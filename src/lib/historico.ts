/**
 * Histórico — a parte PURA.
 *
 * O histórico responde "o site está melhorando ou piorando?". Ele é DERIVADO
 * das tabelas que já guardam fato datado (medições, jobs, marcações, tarefas,
 * verificações, cadastros) — não há tabela de eventos nem event sourcing. Uma
 * tabela paralela envelheceria na primeira escrita que esquecesse de
 * registrar, e o histórico passaria a mentir por omissão.
 */
export type TipoDeEvento =
  | 'analise'
  | 'analise_falhou'
  | 'problema_resolvido'
  | 'acompanhamento'
  | 'tarefa_criada'
  | 'tarefa_concluida'
  | 'recurso_verificado'
  | 'url_monitorada'
  | 'site_cadastrado';

export const EVENTO_LABEL: Record<TipoDeEvento, string> = {
  analise: 'Análise concluída',
  analise_falhou: 'Análise falhou',
  problema_resolvido: 'Problema resolvido por medição',
  acompanhamento: 'Situação marcada',
  tarefa_criada: 'Tarefa criada',
  tarefa_concluida: 'Tarefa concluída',
  recurso_verificado: 'Recurso verificado',
  url_monitorada: 'URL monitorada',
  site_cadastrado: 'Site cadastrado',
};

export const EVENTO_TOM: Record<TipoDeEvento, 'ok' | 'warn' | 'neg' | 'soft'> = {
  analise: 'soft',
  analise_falhou: 'neg',
  problema_resolvido: 'ok',
  acompanhamento: 'soft',
  tarefa_criada: 'soft',
  tarefa_concluida: 'ok',
  recurso_verificado: 'ok',
  url_monitorada: 'soft',
  site_cadastrado: 'soft',
};

export type EventoDeHistorico = {
  quando: Date;
  tipo: TipoDeEvento;
  siteId: string;
  site: string;
  cliente: string;
  /** Página e dispositivo, quando o evento é de uma página. */
  url: string | null;
  dispositivo: 'mobile' | 'desktop' | null;
  titulo: string;
  detalhe: string | null;
  /** Nota de desempenho (0–100) desta medição, e a anterior do mesmo par. */
  nota: number | null;
  notaAnterior: number | null;
};

/**
 * Direção de uma medição contra a anterior do MESMO par (URL, dispositivo).
 * Sem anterior, não há direção — um ponto não tem variação.
 */
export function direcao(e: EventoDeHistorico): 'melhora' | 'piora' | 'igual' | null {
  if (e.nota === null || e.notaAnterior === null) return null;
  if (e.nota > e.notaAnterior) return 'melhora';
  if (e.nota < e.notaAnterior) return 'piora';
  return 'igual';
}

/** Quantas medições melhoraram e quantas pioraram — o resumo do "está melhorando?". */
export function tendencia(eventos: EventoDeHistorico[]): { melhoras: number; pioras: number; medicoes: number } {
  let melhoras = 0;
  let pioras = 0;
  let medicoes = 0;
  for (const e of eventos) {
    if (e.tipo !== 'analise') continue;
    medicoes += 1;
    const d = direcao(e);
    if (d === 'melhora') melhoras += 1;
    if (d === 'piora') pioras += 1;
  }
  return { melhoras, pioras, medicoes };
}
