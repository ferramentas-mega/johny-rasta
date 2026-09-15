'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirSessao } from '@/server/contexto';
import { appUrl } from '@/lib/app-url';
import { conferenciaNoConsole } from '@/lib/snippets';
import type { Diagnostico as DiagnosticoDeInstalacao } from '@/lib/instalacao';
import { atualizarSite, criarCliente, ClienteEntrada } from '@/server/services/cadastros';
import { SiteEntrada } from '@/server/services/cadastros';
import {
  RECURSOS,
  salvarRecursos,
  salvarModoFormulario,
  abrirDiagnostico,
  verificarDiagnostico,
  verificarQualidade,
  siteComDominio,
  registrarErroDeRecurso,
  SiteForaDaConta,
  type Recurso,
  type ModoFormulario,
  type EventoDiagnostico,
} from '@/server/services/onboarding';
import type { EstadoFormulario } from '@/components/Formulario';

/**
 * O `siteId` vem do FORMULÁRIO, não da URL — um campo oculto, que quem manda a
 * requisição controla. Server Action não é rota: o Next não valida esse valor
 * contra o `[siteId]` do caminho, e nada impede mandar o id de um site de outra
 * conta.
 *
 * Os serviços agora recusam isso (`SiteForaDaConta`). Esta função é o que faz a
 * recusa virar mensagem na tela em vez de erro 500 — e, principalmente, o que
 * impede a ação de responder "salvo" para uma gravação que não aconteceu.
 *
 * A mensagem não distingue "não é seu" de "não existe": distinguir confirmaria a
 * existência de um registro alheio para quem tem só o identificador.
 */
const FORA_DA_CONTA = 'Site não encontrado nesta conta.';

function ehForaDaConta(erro: unknown): boolean {
  return erro instanceof SiteForaDaConta;
}

/**
 * Ações do assistente de configuração.
 *
 * Toda ação que muda o estado de um recurso revalida as telas que mostram esse
 * estado — lista de sites, painel do cliente e visão geral. Sem isso o operador
 * verificaria a instalação e voltaria para uma lista afirmando que o site ainda
 * está pendente, que é a forma mais rápida de perder a confiança no painel.
 */
function revalidar(siteId: string) {
  for (const rota of ['/sites', '/visao-geral', '/clientes', '/otimizacoes']) revalidatePath(rota);
  for (const aba of ['configurar', 'rastreamento', 'desempenho', 'qualidade']) {
    revalidatePath(`/sites/${siteId}/${aba}`);
  }
  revalidatePath('/clientes/[clienteId]', 'page');
}

// ───────────────────────── etapa 1: identificação ─────────────────────────

/**
 * Endereço absoluto http(s), ou nada.
 *
 * Era só `string().max(512)`. O valor é gravado e depois passado a `new URL()`
 * no Server Component da tela de configuração — e `new URL('meusite.com')`
 * **lança**, porque não há esquema. O resultado não era um campo feio: era a
 * etapa de verificação quebrada de forma permanente, com erro de renderização,
 * e sem caminho de volta pela própria tela para corrigir o valor que a quebrou.
 *
 * `URL.canParse` faz o mesmo teste que o consumidor vai fazer, então não existe
 * a fresta entre "passou na validação" e "o consumidor aceitou".
 */
const URL_PRINCIPAL_INVALIDA =
  'Informe o endereço completo, começando com https:// — exemplo: https://meucliente.com.br/';

const UrlPrincipal = z
  .string()
  .trim()
  .max(512)
  .refine(
    (v) => v === '' || (URL.canParse(v) && /^https?:$/.test(new URL(v).protocol)),
    URL_PRINCIPAL_INVALIDA,
  );

const Identificacao = SiteEntrada.extend({
  plataforma: z.enum(['wordpress', 'react_next', 'html', 'desconhecida']),
  urlPrincipal: UrlPrincipal.optional().or(z.literal('')),
});

export type EstadoIdentificacao = EstadoFormulario & {
  /** Preenchido quando o domínio já pertence a outro site desta conta. */
  duplicado?: { id: string; name: string; domain: string; clienteNome: string };
};

export async function salvarIdentificacao(
  _anterior: EstadoIdentificacao,
  dados: FormData,
): Promise<EstadoIdentificacao> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');

  const analise = Identificacao.safeParse({
    clienteId: dados.get('clienteId'),
    nome: dados.get('nome'),
    dominio: dados.get('dominio'),
    fuso: dados.get('fuso') || undefined,
    plataforma: dados.get('plataforma') || 'desconhecida',
    urlPrincipal: dados.get('urlPrincipal') || '',
  });
  if (!analise.success) {
    const campos: Record<string, string> = {};
    for (const p of analise.error.issues) campos[String(p.path[0] ?? 'form')] ??= p.message;
    return { erro: 'Corrija os campos destacados.', campos };
  }

  // Duplicidade é verificada ANTES de gravar, para poder explicar e oferecer o
  // registro existente. O índice único do banco é a rede de segurança para a
  // corrida entre este SELECT e o UPDATE — não o contrário.
  const existente = await siteComDominio(usuario.accountId, analise.data.dominio, siteId);
  if (existente) {
    return {
      erro: `O domínio ${analise.data.dominio} já está cadastrado nesta conta.`,
      duplicado: existente,
    };
  }

  const ok = await atualizarSite(usuario.accountId, siteId, analise.data, {
    plataforma: analise.data.plataforma,
    urlPrincipal: analise.data.urlPrincipal || null,
  });
  if (!ok) return { erro: 'Site não encontrado.' };

  revalidar(siteId);
  return { ok: true, mensagem: 'Identificação salva.' };
}

/**
 * Cadastra um cliente sem sair do assistente.
 *
 * Devolve o id para que o formulário o selecione na hora. O motivo de existir:
 * mandar o operador para outra tela cadastrar o cliente faria ele perder tudo
 * o que já digitou sobre o site.
 */
export async function criarClienteRapido(
  _anterior: EstadoFormulario & { clienteId?: string },
  dados: FormData,
): Promise<EstadoFormulario & { clienteId?: string }> {
  const usuario = await exigirSessao();
  const analise = ClienteEntrada.safeParse({ nome: dados.get('nome'), observacoes: '' });
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? 'Nome inválido.' };
  }
  try {
    const id = await criarCliente(usuario.accountId, analise.data);
    revalidatePath('/clientes');
    revalidatePath('/sites');
    return { ok: true, clienteId: id, mensagem: `Cliente "${analise.data.nome}" criado.` };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('clients_account_name_key')) {
      return { erro: 'Já existe um cliente com esse nome nesta conta.' };
    }
    return { erro: 'Não foi possível criar o cliente.' };
  }
}

// ───────────────────────── etapa 2: recursos ─────────────────────────

export async function salvarEscolhaDeRecursos(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const escolhidos = RECURSOS.filter((r) => dados.get(`recurso:${r}`) === 'on') as Recurso[];

  try {
    await salvarRecursos(usuario.accountId, siteId, escolhidos);
  } catch (erro) {
    if (ehForaDaConta(erro)) return { erro: FORA_DA_CONTA };
    throw erro;
  }

  revalidar(siteId);
  return {
    ok: true,
    mensagem:
      escolhidos.length === 0
        ? 'Nenhum recurso selecionado. Você pode voltar aqui quando quiser.'
        : `${escolhidos.length} recurso(s) selecionado(s).`,
  };
}

// ───────────────────────── etapa 4: verificação ─────────────────────────

export type EstadoDiagnostico = {
  erro?: string;
  token?: string;
  url?: string;
  /** ISO. Quando o token para de valer — a tela conta os minutos a partir daqui. */
  expiraEm?: string;
  eventos?: EventoDiagnostico[];
  verificados?: Recurso[];
  conferidoEm?: string;
  /** Por que a verificação ainda não passou, derivado do que o banco mediu. */
  diagnostico?: DiagnosticoDeInstalacao;
  /**
   * A conferência para colar no console do navegador do operador.
   *
   * Montada no servidor porque depende do endereço público do painel e do
   * identificador do site — dois valores que a tela não tem, e que errados
   * fariam a conferência acusar problema onde não há.
   */
  consoleTexto?: string;
};

/** Abre a sessão e devolve a URL que o operador deve abrir no site. */
export async function iniciarDiagnostico(
  _anterior: EstadoDiagnostico,
  dados: FormData,
): Promise<EstadoDiagnostico> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const base = String(dados.get('base') ?? '');

  // `base` chega por campo oculto. `new URL` sobre texto qualquer lança, e a
  // Action devolveria 500 em vez de uma mensagem.
  if (!URL.canParse(base)) {
    return { erro: 'Endereço de diagnóstico inválido. Confira a URL principal na etapa 1.' };
  }

  try {
    const sessao = await abrirDiagnostico(usuario.accountId, siteId);
    const url = new URL(base);
    url.searchParams.set('painel_diag', sessao.token);
    revalidar(siteId);
    return { token: sessao.token, url: url.toString(), expiraEm: sessao.expiraEm.toISOString() };
  } catch (erro) {
    if (ehForaDaConta(erro)) return { erro: FORA_DA_CONTA };
    console.error('[onboarding] falha ao abrir diagnóstico', erro);
    return { erro: 'Não foi possível abrir a sessão de diagnóstico.' };
  }
}

/**
 * Confere o que chegou.
 *
 * Nada é confirmado por tempo decorrido nem por o script aparecer no HTML: esta
 * ação lê o banco e só carimba o que encontrou lá.
 */
export async function conferirDiagnostico(
  anterior: EstadoDiagnostico,
  dados: FormData,
): Promise<EstadoDiagnostico> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const token = String(dados.get('token') ?? anterior.token ?? '');
  if (!token) return { ...anterior, erro: 'Abra o modo de diagnóstico antes de conferir.' };

  try {
    const resultado = await verificarDiagnostico(usuario.accountId, siteId, token);
    revalidar(siteId);
    return {
      ...anterior,
      token,
      erro: undefined,
      eventos: resultado.eventos,
      verificados: resultado.verificados,
      diagnostico: resultado.diagnostico,
      consoleTexto:
        resultado.diagnostico.ofereceConsole && resultado.publicId
          ? conferenciaNoConsole(appUrl(), resultado.publicId)
          : undefined,
      conferidoEm: new Date().toISOString(),
    };
  } catch (erro) {
    if (ehForaDaConta(erro)) return { ...anterior, erro: FORA_DA_CONTA };
    console.error('[onboarding] falha ao conferir diagnóstico', erro);
    return { ...anterior, erro: 'Não foi possível consultar os eventos recebidos.' };
  }
}

// ───────────────────────── etapa 5: formulários ─────────────────────────

export async function salvarFormulario(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const modo = String(dados.get('modo') ?? '');

  if (modo !== 'proprio' && modo !== 'externo' && modo !== 'sem') {
    return { erro: 'Escolha como o formulário funciona.' };
  }

  try {
    await salvarModoFormulario(usuario.accountId, siteId, modo as ModoFormulario);

    // "Plugin ou serviço externo" não tem conector implementado neste projeto.
    // Dizer isso é melhor que oferecer uma integração que não existe: o registro
    // de erro faz a etapa aparecer como pendência real, com o motivo à vista.
    if (modo === 'externo') {
      await registrarErroDeRecurso(
        usuario.accountId,
        siteId,
        'formularios',
        'Nenhum conector para serviço externo está implementado. O envio precisa chegar ao endpoint de formulários do painel.',
      );
    }
  } catch (erro) {
    if (ehForaDaConta(erro)) return { erro: FORA_DA_CONTA };
    throw erro;
  }

  revalidar(siteId);
  return { ok: true, mensagem: 'Configuração de formulário salva.' };
}

// ───────────────────────── etapa 6: qualidade ─────────────────────────

export async function conferirQualidade(
  _anterior: EstadoFormulario,
  dados: FormData,
): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');

  let ok: boolean;
  try {
    ok = await verificarQualidade(usuario.accountId, siteId);
  } catch (erro) {
    if (ehForaDaConta(erro)) return { erro: FORA_DA_CONTA };
    throw erro;
  }

  revalidar(siteId);
  return ok
    ? { ok: true, mensagem: 'Análise técnica encontrada e registrada como verificada.' }
    : { erro: 'Ainda não há nenhuma análise concluída com nota para este site.' };
}
