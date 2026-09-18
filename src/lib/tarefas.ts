import type { ChaveDoSinal, Dispositivo, TipoOtimizacao } from '@/lib/otimizacoes';

/**
 * Tarefas — a parte PURA (tipos e rótulos), importável por componente cliente.
 *
 * Tarefa é decisão humana sobre um problema derivado. Concluir a tarefa não
 * fecha o problema; a medição seguinte é que diz se funcionou.
 */
export const STATUS_TAREFA = ['aberta', 'em_andamento', 'concluida', 'cancelada'] as const;
export type StatusTarefa = (typeof STATUS_TAREFA)[number];

export const STATUS_TAREFA_LABEL: Record<StatusTarefa, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const STATUS_TAREFA_TOM: Record<StatusTarefa, 'warn' | 'ok' | 'soft'> = {
  aberta: 'warn',
  em_andamento: 'warn',
  concluida: 'ok',
  cancelada: 'soft',
};

export const PRIORIDADE_LABEL: Record<1 | 2 | 3, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' };

export function ehStatusTarefa(v: string): v is StatusTarefa {
  return (STATUS_TAREFA as readonly string[]).includes(v);
}

export const ABERTAS: readonly StatusTarefa[] = ['aberta', 'em_andamento'];

export type Tarefa = {
  id: string;
  siteId: string;
  site: string;
  cliente: string;
  clienteId: string;
  titulo: string;
  descricao: string | null;
  prioridade: 1 | 2 | 3;
  status: StatusTarefa;
  /** O sinal ao qual a tarefa responde; `null` para tarefa avulsa. */
  sinal: (Omit<ChaveDoSinal, 'siteId'> & { tipo: TipoOtimizacao; dispositivo: Dispositivo | null }) | null;
  prazo: string | null;
  criadaEm: Date;
  atualizadaEm: Date;
  concluidaEm: Date | null;
};

/** A tarefa casa com este sinal? Mesma chave, campo a campo. */
export function tarefaDoSinal(t: Tarefa, sinal: ChaveDoSinal): boolean {
  return (
    t.siteId === sinal.siteId &&
    t.sinal !== null &&
    t.sinal.tipo === sinal.tipo &&
    (t.sinal.url ?? '') === (sinal.url ?? '') &&
    (t.sinal.dispositivo ?? '') === (sinal.dispositivo ?? '') &&
    t.sinal.titulo === sinal.titulo
  );
}
