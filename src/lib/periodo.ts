/**
 * Períodos do painel.
 *
 * As datas são gravadas em UTC e recortadas no fuso do site. "Hoje" para um
 * site em America/Sao_Paulo começa às 03:00 UTC, e é isso que o SQL calcula —
 * nunca `now() - interval '1 day'`, que erraria a borda do dia.
 */

export const PERIOD_KEYS = ['hoje', '7d', '30d', 'personalizado'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export type PeriodInput = {
  key: PeriodKey;
  /** Datas locais (YYYY-MM-DD) do período personalizado. */
  de?: string;
  ate?: string;
};

export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  /** Número de dias locais cobertos, usado para as faixas do gráfico. */
  days: number;
  from: Date;
  to: Date;
  /** Período imediatamente anterior, de mesma duração, para a comparação. */
  previousFrom: Date;
  previousTo: Date;
};

const LABELS: Record<PeriodKey, string> = {
  hoje: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  personalizado: 'Período personalizado',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parsePeriodParams(params: {
  periodo?: string | null;
  de?: string | null;
  ate?: string | null;
}): PeriodInput {
  const key = PERIOD_KEYS.includes(params.periodo as PeriodKey) ? (params.periodo as PeriodKey) : '7d';
  if (key !== 'personalizado') return { key };

  const de = params.de && DATE_RE.test(params.de) ? params.de : undefined;
  const ate = params.ate && DATE_RE.test(params.ate) ? params.ate : undefined;
  // Personalizado sem datas válidas cai para 7 dias em vez de renderizar vazio.
  if (!de || !ate || de > ate) return { key: '7d' };
  return { key, de, ate };
}

export function periodLabel(period: ResolvedPeriod): string {
  if (period.key !== 'personalizado') return LABELS[period.key];
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${fmt(period.from)} a ${fmt(new Date(period.to.getTime() - 1))}`;
}

export function toSearchParams(input: PeriodInput): Record<string, string> {
  if (input.key !== 'personalizado' || !input.de || !input.ate) return { periodo: input.key };
  return { periodo: input.key, de: input.de, ate: input.ate };
}

export { LABELS as PERIOD_LABELS };
