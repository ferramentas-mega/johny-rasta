'use server';

import { revalidatePath } from 'next/cache';
import { exigirSessao } from '@/server/contexto';
import { ClienteEntrada, criarCliente, atualizarCliente, arquivarCliente } from '@/server/services/cadastros';
import type { EstadoFormulario } from '@/components/Formulario';

/**
 * Ações de cadastro de clientes.
 *
 * Toda ação revalida as rotas que mostram clientes. É isso que faz um cliente
 * recém-criado aparecer imediatamente no seletor da tela de sites — sem
 * nenhuma sincronização manual de estado.
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

function revalidarTudo() {
  // Clientes aparecem nestas telas; todas precisam refletir a mudança.
  for (const rota of ['/clientes', '/sites', '/visao-geral', '/leads']) revalidatePath(rota);
}

export async function salvarCliente(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const id = dados.get('id');

  const analise = ClienteEntrada.safeParse({
    nome: dados.get('nome'),
    observacoes: dados.get('observacoes'),
  });
  if (!analise.success) return problemas(analise.error);

  try {
    if (typeof id === 'string' && id) {
      const ok = await atualizarCliente(usuario.accountId, id, analise.data);
      if (!ok) return { erro: 'Cliente não encontrado.' };
      revalidarTudo();
      return { ok: true, mensagem: `Cliente "${analise.data.nome}" atualizado.` };
    }
    await criarCliente(usuario.accountId, analise.data);
    revalidarTudo();
    return { ok: true, mensagem: `Cliente "${analise.data.nome}" cadastrado. Já aparece no cadastro de sites.` };
  } catch (erro) {
    // Violação do índice único de nome por conta.
    if (erro instanceof Error && erro.message.includes('clients_account_name_key')) {
      return { erro: 'Já existe um cliente com esse nome nesta conta.', campos: { nome: 'Nome já utilizado.' } };
    }
    return problemas(erro);
  }
}

export async function removerCliente(_anterior: EstadoFormulario, dados: FormData): Promise<EstadoFormulario> {
  const usuario = await exigirSessao();
  const id = dados.get('id');
  if (typeof id !== 'string' || !id) return { erro: 'Cliente inválido.' };

  const resultado = await arquivarCliente(usuario.accountId, id);
  if (!resultado.ok) return { erro: resultado.motivo ?? 'Cliente não encontrado.' };
  revalidarTudo();
  return { ok: true, mensagem: 'Cliente arquivado.' };
}
