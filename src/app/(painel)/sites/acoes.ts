'use server';

import { revalidatePath } from 'next/cache';
import { exigirSessao } from '@/server/contexto';
import { SiteEntrada, criarSite, atualizarSite, arquivarSite, registrarSnippetVisto } from '@/server/services/cadastros';
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
      const ok = await atualizarSite(usuario.accountId, id, analise.data);
      if (!ok) return { erro: 'Site não encontrado.' };
      revalidarTudo(id);
      return { ok: true, mensagem: `Site atualizado para "${analise.data.nome}". O novo nome vale em todas as telas.` };
    }
    const criado = await criarSite(usuario.accountId, analise.data);
    revalidarTudo(criado.id);
    return {
      ok: true,
      mensagem: `Site "${analise.data.nome}" cadastrado com o identificador ${criado.publicId}. Falta instalar o script: abra a aba Rastreamento.`,
    };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('sites_public_id_key')) {
      return { erro: 'Conflito ao gerar o identificador. Tente novamente.' };
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
  return { ok: true, mensagem: 'Site arquivado. O histórico é preservado.' };
}

export async function marcarSnippetVisto(siteId: string): Promise<void> {
  const usuario = await exigirSessao();
  await registrarSnippetVisto(usuario.accountId, siteId);
  revalidarTudo(siteId);
}
