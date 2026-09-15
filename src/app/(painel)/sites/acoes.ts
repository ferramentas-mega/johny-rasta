'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirSessao } from '@/server/contexto';
import { SiteEntrada, criarSite, atualizarSite, arquivarSite } from '@/server/services/cadastros';
import { siteComDominio } from '@/server/services/onboarding';
import type { EstadoFormulario } from '@/components/Formulario';

/**
 * Ações de cadastro de sites.
 *
 * Criar um site gera o identificador público e nada mais. Ele NÃO passa a
 * "coletando" por isso: o estado continua derivado dos eventos recebidos.
 */

function problemas(erro: unknown): EstadoFormulario {
  if (erro && typeof erro === 'object' && 'issues' in erro) {
    const campos: Record<string, string> = {};
    for (const p of (erro as { issues: { path: (string | number)[]; message: string }[] }).issues) {
      const campo = String(p.path[0] ?? 'form');
      campos[campo] ??= p.message;
    }
    return { erro: 'Corrija os campos destacados.', campos };
  }
  return { erro: erro instanceof Error ? erro.message : 'Não foi possível salvar.' };
}

function revalidarTudo(siteId?: string) {
  for (const rota of ['/sites', '/visao-geral', '/leads', '/clientes']) revalidatePath(rota);
  if (siteId) {
    // O nome do site aparece no cabeçalho e no seletor de todas as abas.
    for (const aba of ['desempenho', 'comportamento', 'rastreamento']) {
      revalidatePath(`/sites/${siteId}/${aba}`);
    }
  }
}

export async function salvarSite(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const id = dados.get('id');

  const analise = SiteEntrada.safeParse({
    clienteId: dados.get('clienteId'),
    nome: dados.get('nome'),
    dominio: dados.get('dominio'),
    fuso: dados.get('fuso') || undefined,
  });
  if (!analise.success) return problemas(analise.error);

  try {
    if (typeof id === 'string' && id) {
      const outro = await siteComDominio(usuario.accountId, analise.data.dominio, id);
      if (outro) {
        return { erro: `O domínio ${analise.data.dominio} já pertence ao site "${outro.name}".` };
      }
      const ok = await atualizarSite(usuario.accountId, id, analise.data);
      if (!ok) return { erro: 'Site não encontrado.' };
      revalidarTudo(id);
      return { ok: true, mensagem: `Site atualizado para "${analise.data.nome}". O novo nome vale em todas as telas.` };
    }
    // Duplicidade é verificada antes de gravar, para poder explicar e apontar o
    // registro existente em vez de criar um segundo site em silêncio. O índice
    // único do banco cobre a corrida entre esta consulta e o INSERT.
    const existente = await siteComDominio(usuario.accountId, analise.data.dominio);
    if (existente) {
      return {
        erro: `O domínio ${analise.data.dominio} já pertence ao site "${existente.name}" (cliente ${existente.clienteNome}). Abra a configuração dele em /sites/${existente.id}/configurar.`,
      };
    }

    const criado = await criarSite(usuario.accountId, analise.data);
    revalidarTudo(criado.id);
    // Vai direto para o assistente: o cadastro sozinho não mede nada, e deixar
    // o operador descobrir isso depois é como a configuração ficava pela metade.
    redirect(`/sites/${criado.id}/configurar`);
  } catch (erro) {
    // `redirect` sinaliza por exceção. Reerguer sem isto transformaria a
    // navegação num "não foi possível salvar" — com o site já criado.
    if (erro instanceof Error && erro.message === 'NEXT_REDIRECT') throw erro;
    if (typeof erro === 'object' && erro !== null && 'digest' in erro
        && String((erro as { digest?: unknown }).digest).startsWith('NEXT_REDIRECT')) {
      throw erro;
    }
    if (erro instanceof Error && erro.message.includes('sites_public_id_key')) {
      return { erro: 'Conflito ao gerar o identificador. Tente novamente.' };
    }
    if (erro instanceof Error && erro.message.includes('sites_conta_dominio_ativo')) {
      return { erro: 'Este domínio já está cadastrado nesta conta.' };
    }
    return problemas(erro);
  }
}

export async function removerSite(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const id = dados.get('id');
  if (typeof id !== 'string' || !id) return { erro: 'Site inválido.' };

  const ok = await arquivarSite(usuario.accountId, id);
  if (!ok) return { erro: 'Site não encontrado.' };
  revalidarTudo(id);

  /*
   * A confirmação vai na URL, e não no estado da Action.
   *
   * Arquivar tira o site da lista. A lista é a fonte de `emEdicao`, e o
   * formulário leva `key={emEdicao?.id ?? 'novo'}` — então o site sumir troca a
   * chave, **remonta o componente** e descarta o resultado da Action junto. A
   * mensagem de sucesso não tinha como aparecer: o ato de arquivar destruía
   * quem iria mostrá-la. Quem pegou foi a prova de navegador.
   */
  redirect('/sites?arquivado=1');
}
