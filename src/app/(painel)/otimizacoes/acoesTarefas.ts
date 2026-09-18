'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { criarTarefa, mudarStatusTarefa } from '@/server/services/tarefas';
import type { PedidoDeReanalise } from '@/server/qualidade/auditoria';
import { ehDispositivo } from '@/lib/otimizacoes';

export type EstadoTarefa = { erro?: string; aviso?: string; ok?: string; id?: string };

const Nova = z.object({
  siteId: z.string().uuid(),
  titulo: z.string().trim().min(1, 'Dê um título à tarefa.').max(200, 'Título longo demais.'),
  descricao: z.string().trim().max(2000).optional(),
  prioridade: z.coerce.number().int().min(1).max(3).default(2),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  sinalTipo: z.enum(['tecnico', 'comercial', 'coleta', 'atualizacao']).optional().or(z.literal('')),
  sinalUrl: z.string().optional(),
  sinalDispositivo: z.string().optional(),
  sinalTitulo: z.string().optional(),
});

/** Cria uma tarefa — avulsa, ou ligada ao sinal cujos campos vieram ocultos. */
export async function criarTarefaAction(_anterior: EstadoTarefa, dados: FormData): Promise<EstadoTarefa> {
  const usuario = await exigirSessao();
  const analise = Nova.safeParse({
    siteId: dados.get('siteId'),
    titulo: dados.get('titulo'),
    descricao: dados.get('descricao') || undefined,
    prioridade: dados.get('prioridade') || 2,
    prazo: dados.get('prazo') || '',
    sinalTipo: dados.get('sinalTipo') || '',
    sinalUrl: dados.get('sinalUrl') || undefined,
    sinalDispositivo: dados.get('sinalDispositivo') || undefined,
    sinalTitulo: dados.get('sinalTitulo') || undefined,
  });
  if (!analise.success) return { erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' };
  const d = analise.data;

  try {
    const id = await withAccount(usuario.accountId, (db) =>
      criarTarefa(db, {
        siteId: d.siteId,
        titulo: d.titulo,
        descricao: d.descricao ?? null,
        prioridade: d.prioridade as 1 | 2 | 3,
        prazo: d.prazo || null,
        sinal:
          d.sinalTipo && d.sinalTitulo
            ? {
                tipo: d.sinalTipo,
                url: d.sinalUrl || null,
                dispositivo: d.sinalDispositivo && ehDispositivo(d.sinalDispositivo) ? d.sinalDispositivo : null,
                titulo: d.sinalTitulo,
              }
            : null,
      }),
    );
    revalidar();
    return { ok: 'Tarefa criada.', id };
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes('Site não encontrado')) {
      return { erro: 'Site não encontrado nesta conta.' };
    }
    console.error('[tarefas] falha ao criar', erro);
    return { erro: 'Não foi possível criar a tarefa.' };
  }
}

/** Muda a situação; concluir tarefa de página enfileira a reanálise e diz o que aconteceu. */
export async function mudarStatusTarefaAction(_anterior: EstadoTarefa, dados: FormData): Promise<EstadoTarefa> {
  const usuario = await exigirSessao();
  const id = String(dados.get('id') ?? '');
  const status = String(dados.get('status') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return { erro: 'Tarefa inválida.' };

  try {
    const desfecho = await withAccount(usuario.accountId, (db) => mudarStatusTarefa(db, id, status));
    if (!desfecho) return { erro: 'Tarefa não encontrada nesta conta.' };
    revalidar();
    if (desfecho.reanalise) return frase(desfecho.reanalise);
    return { ok: status === 'concluida' ? 'Tarefa concluída.' : 'Situação registrada.' };
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'Situação inválida.') return { erro: erro.message };
    console.error('[tarefas] falha ao mudar situação', erro);
    return { erro: 'Não foi possível registrar a situação.' };
  }
}

function revalidar() {
  revalidatePath('/otimizacoes');
  revalidatePath('/clientes/[clienteId]', 'page');
  revalidatePath('/avisos');
}

/**
 * O código do pedido de reanálise vira frase aqui. Os `aviso` são o ponto:
 * a tarefa FOI concluída e a medição NÃO foi enfileirada — e o operador
 * precisa saber que "concluída" ainda não é "resolvido".
 */
function frase(p: PedidoDeReanalise): EstadoTarefa {
  switch (p.resultado) {
    case 'enfileirada':
      return { ok: 'Tarefa concluída e reanálise enfileirada. O problema fecha quando a medição não o encontrar mais.' };
    case 'ja_na_fila':
      return { ok: 'Tarefa concluída. Já havia análise desta página na fila.' };
    case 'sem_pagina':
      return { aviso: 'Tarefa concluída. O sinal é do site inteiro; ele sai da lista quando os eventos voltarem.' };
    case 'nao_configurado':
      return { aviso: 'Tarefa concluída, mas a reanálise NÃO foi enfileirada: a análise técnica não está configurada neste servidor.' };
    case 'recusado':
      return { aviso: `Tarefa concluída, mas a reanálise NÃO foi enfileirada: ${p.motivo}` };
  }
}
