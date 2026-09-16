'use server';

import { revalidatePath } from 'next/cache';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { marcarOtimizacao } from '@/server/qualidade/otimizacoes';
import { enfileirarReanalise, type PedidoDeReanalise } from '@/server/qualidade/auditoria';
import { ehDispositivo, ehStatusManual, type ChaveDoSinal, type TipoOtimizacao } from '@/lib/otimizacoes';

export type EstadoOtimizacao = { erro?: string; aviso?: string; ok?: string };

/**
 * Registra a situação de um item da lista.
 *
 * O que esta Action **não** faz, e é o motivo de ela ser pequena: não some com
 * o item. A lista mostra sinais derivados, e o sinal só desaparece quando a
 * causa desaparece. Marcar "resolvida" registra que você tratou; não afirma que
 * o problema acabou — quem afirma isso é a próxima medição.
 *
 * A exceção é "aguardando nova análise", e ela é a razão desta Action ter
 * crescido: era o único status que **prometia um acontecimento futuro** sem nada
 * por trás. Escolhê-lo agora enfileira a análise de verdade, e a resposta diz o
 * que aconteceu — inclusive quando não deu.
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
  const brutoDispositivo = String(dados.get('dispositivo') ?? '');
  const proximaAcao = String(dados.get('proximaAcao') ?? '');
  const status = String(dados.get('status') ?? '');
  const evidencia = String(dados.get('evidencia') ?? '');

  if (!siteId || !tipo || !titulo) return { erro: 'Item inválido.' };
  if (!ehStatusManual(status)) return { erro: 'Situação inválida.' };

  const sinal: ChaveDoSinal = {
    siteId,
    tipo,
    url,
    dispositivo: ehDispositivo(brutoDispositivo) ? brutoDispositivo : null,
    titulo,
  };

  try {
    const pedido = await withAccount(usuario.accountId, async (db) => {
      await marcarOtimizacao(db, sinal, status, proximaAcao, evidencia);
      // Na MESMA transação da marcação: se o enfileiramento falhar, a marcação
      // não fica de pé sozinha prometendo uma análise que não existe.
      return status === 'aguardando_nova_analise' ? enfileirarReanalise(db, sinal) : null;
    });

    revalidatePath('/otimizacoes');
    return pedido ? resposta(pedido) : { ok: 'Situação registrada.' };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('Site não encontrado')) {
      return { erro: 'Site não encontrado nesta conta.' };
    }
    console.error('[otimizacoes] falha ao marcar situação', erro);
    return { erro: 'Não foi possível registrar a situação.' };
  }
}

/**
 * O código vira frase aqui, e não no serviço.
 *
 * Os dois casos de `aviso` são o ponto: a situação FOI registrada e a análise
 * NÃO foi enfileirada. Reportar isso como sucesso deixaria o operador esperando
 * um resultado que ninguém vai produzir — que é exatamente o defeito que este
 * recurso veio corrigir.
 */
function resposta(pedido: PedidoDeReanalise): EstadoOtimizacao {
  switch (pedido.resultado) {
    case 'enfileirada':
      return { ok: 'Situação registrada e análise enfileirada.' };
    case 'ja_na_fila':
      return { ok: 'Situação registrada. Já havia análise desta página na fila.' };
    case 'sem_pagina':
      return {
        aviso:
          'Situação registrada. Este sinal não é de uma página, então não há análise a ' +
          'enfileirar: ele sai da lista quando o site voltar a enviar eventos.',
      };
    case 'nao_configurado':
      return {
        aviso:
          'Situação registrada, mas a análise NÃO foi enfileirada: a análise técnica não está ' +
          'configurada neste servidor.',
      };
    case 'recusado':
      return { aviso: `Situação registrada, mas a análise NÃO foi enfileirada: ${pedido.motivo}` };
  }
}
