'use server';

import { revalidatePath } from 'next/cache';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { marcarOtimizacao } from '@/server/qualidade/otimizacoes';
import { ehStatusManual, type TipoOtimizacao } from '@/lib/otimizacoes';

export type EstadoOtimizacao = { erro?: string; ok?: string };

/**
 * Registra a situação de um item da lista.
 *
 * O que esta Action **não** faz, e é o motivo de ela ser pequena: não some com
 * o item. A lista mostra sinais derivados, e o sinal só desaparece quando a
 * causa desaparece. Marcar "resolvida" registra que você tratou; não afirma que
 * o problema acabou — quem afirma isso é a próxima medição.
 */
export async function marcarSituacao(
  _anterior: EstadoOtimizacao,
  dados: FormData,
): Promise<EstadoOtimizacao> {
  const usuario = await exigirSessao();

  const siteId = String(dados.get('siteId') ?? '');
  const tipo = String(dados.get('tipo') ?? '') as TipoOtimizacao;
  const titulo = String(dados.get('titulo') ?? '');
  const bruta = dados.get('url');
  const url = typeof bruta === 'string' && bruta ? bruta : null;
  const proximaAcao = String(dados.get('proximaAcao') ?? '');
  const status = String(dados.get('status') ?? '');

  if (!siteId || !tipo || !titulo) return { erro: 'Item inválido.' };
  if (!ehStatusManual(status)) return { erro: 'Situação inválida.' };

  try {
    await withAccount(usuario.accountId, (db) =>
      marcarOtimizacao(db, { siteId, tipo, url, titulo }, status, proximaAcao),
    );
    revalidatePath('/otimizacoes');
    return { ok: 'Situação registrada.' };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('Site não encontrado')) {
      return { erro: 'Site não encontrado nesta conta.' };
    }
    console.error('[otimizacoes] falha ao marcar situação', erro);
    return { erro: 'Não foi possível registrar a situação.' };
  }
}
