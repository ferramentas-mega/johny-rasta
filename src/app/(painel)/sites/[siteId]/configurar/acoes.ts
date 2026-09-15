'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { exigirSessao } from '@/server/contexto';
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
  type Recurso,
  type ModoFormulario,
  type EventoDiagnostico,
} from '@/server/services/onboarding';
import type { EstadoFormulario } from '@/components/Formulario';

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

const Identificacao = SiteEntrada.extend({
  plataforma: z.enum(['wordpress', 'react_next', 'html', 'desconhecida']),
  urlPrincipal: z
    .string()
    .trim()
    .max(512)
    .optional()
    .or(z.literal('')),
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

  await salvarRecursos(usuario.accountId, siteId, escolhidos);
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
  eventos?: EventoDiagnostico[];
  verificados?: Recurso[];
  conferidoEm?: string;
};

/** Abre a sessão e devolve a URL que o operador deve abrir no site. */
export async function iniciarDiagnostico(
  _anterior: EstadoDiagnostico,
  dados: FormData,
): Promise<EstadoDiagnostico> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const base = String(dados.get('base') ?? '');

  try {
    const sessao = await abrirDiagnostico(usuario.accountId, siteId);
    const url = new URL(base);
    url.searchParams.set('painel_diag', sessao.token);
    revalidar(siteId);
    return { token: sessao.token, url: url.toString() };
  } catch (erro) {
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
      conferidoEm: new Date().toISOString(),
    };
  } catch (erro) {
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

  const ok = await verificarQualidade(usuario.accountId, siteId);
  revalidar(siteId);
  return ok
    ? { ok: true, mensagem: 'Análise técnica encontrada e registrada como verificada.' }
    : { erro: 'Ainda não há nenhuma análise concluída com nota para este site.' };
}
