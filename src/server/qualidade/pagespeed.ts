import 'server-only';

/**
 * PageSpeed Insights (Lighthouse).
 *
 * O módulo é dividido em duas partes de propósito: `interpretar`, que é pura e
 * testável contra uma resposta gravada, e `analisar`, que é a chamada de rede.
 * O que costuma quebrar é a interpretação — formato que muda entre versões do
 * Lighthouse — e é justamente a parte que dá para testar sem rede.
 */

export const CATEGORIAS = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

export type Estrategia = 'mobile' | 'desktop';

/** Nota de 0 a 1, como a API devolve. `null` é ausência, e ausência não é zero. */
export type Notas = {
  performance: number | null;
  acessibilidade: number | null;
  boasPraticas: number | null;
  seo: number | null;
};

/**
 * Métricas de LABORATÓRIO. Repare que não há INP: ele não existe em teste
 * sintético, só em dado de campo (CrUX). TBT é o proxy do Lighthouse, e não
 * pode ser apresentado no lugar dele.
 */
export type MetricasLaboratorio = {
  lcpMs: number | null;
  fcpMs: number | null;
  tbtMs: number | null;
  cls: number | null;
  speedIndexMs: number | null;
  ttiMs: number | null;
};

export type Diagnostico = {
  id: string;
  titulo: string;
  nota: number | null;
  /** Economia estimada em ms, quando a auditoria informa. Nunca inventada. */
  economiaMs: number | null;
  valorExibido: string | null;
};

export type ResultadoPageSpeed = {
  urlSolicitada: string;
  urlFinal: string;
  estrategia: Estrategia;
  versaoLighthouse: string | null;
  notas: Notas;
  metricas: MetricasLaboratorio;
  diagnosticos: Diagnostico[];
  avisos: string[];
};

export class IntegracaoNaoConfigurada extends Error {
  constructor() {
    super('PAGESPEED_API_KEY não está definida. A análise técnica está desligada neste servidor.');
    this.name = 'IntegracaoNaoConfigurada';
  }
}

export class FalhaNaAnalise extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FalhaNaAnalise';
  }
}

/** Lê um número só se for número. `"3,9 s"` não serve para conta. */
function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function nota(categorias: Record<string, { score?: unknown }>, chave: string): number | null {
  const bruto = categorias?.[chave]?.score;
  // A API manda `null` quando a categoria não pôde ser avaliada. Virar 0 aqui
  // transformaria "não medimos" em "medimos e deu zero".
  return numero(bruto);
}

type AuditoriaBruta = {
  id?: string;
  title?: string;
  score?: unknown;
  scoreDisplayMode?: string;
  displayValue?: string;
  details?: { overallSavingsMs?: unknown };
};

/**
 * Quais auditorias guardar.
 *
 * NÃO existe lista fixa de ids: a versão do Lighthouse muda e os ids com ela —
 * a medição real veio na 13.4.1, com 153 auditorias nas quatro categorias. O
 * critério é por propriedade:
 *
 * - `notApplicable` e `manual` saem: não há o que fazer a respeito.
 * - Auditoria que passou (nota 1) sai: diagnóstico é o que está pendente.
 * - O resto fica, ordenado por economia estimada.
 */
function relevante(a: AuditoriaBruta): boolean {
  const modo = a.scoreDisplayMode;
  if (modo === 'notApplicable' || modo === 'manual') return false;
  const n = numero(a.score);
  if (n !== null && n >= 1) return false;
  return true;
}

export function interpretar(corpo: unknown, estrategia: Estrategia): ResultadoPageSpeed {
  const raiz = (corpo ?? {}) as Record<string, unknown>;
  const lr = (raiz.lighthouseResult ?? {}) as Record<string, unknown>;
  const categorias = (lr.categories ?? {}) as Record<string, { score?: unknown }>;
  const audits = (lr.audits ?? {}) as Record<string, AuditoriaBruta>;

  const metrica = (id: string): number | null => numero(audits[id]?.['numericValue' as keyof AuditoriaBruta]);

  const diagnosticos = Object.entries(audits)
    .filter(([, a]) => relevante(a))
    .map(([id, a]) => ({
      id,
      titulo: typeof a.title === 'string' ? a.title : id,
      nota: numero(a.score),
      economiaMs: numero(a.details?.overallSavingsMs),
      valorExibido: typeof a.displayValue === 'string' ? a.displayValue : null,
    }))
    .sort((x, y) => (y.economiaMs ?? -1) - (x.economiaMs ?? -1));

  const avisos = Array.isArray(lr.runWarnings)
    ? lr.runWarnings.filter((w): w is string => typeof w === 'string')
    : [];

  return {
    urlSolicitada: typeof lr.requestedUrl === 'string' ? lr.requestedUrl : '',
    urlFinal: typeof lr.finalUrl === 'string' ? lr.finalUrl : '',
    estrategia,
    versaoLighthouse: typeof lr.lighthouseVersion === 'string' ? lr.lighthouseVersion : null,
    notas: {
      performance: nota(categorias, 'performance'),
      acessibilidade: nota(categorias, 'accessibility'),
      boasPraticas: nota(categorias, 'best-practices'),
      seo: nota(categorias, 'seo'),
    },
    metricas: {
      lcpMs: metrica('largest-contentful-paint'),
      fcpMs: metrica('first-contentful-paint'),
      tbtMs: metrica('total-blocking-time'),
      cls: metrica('cumulative-layout-shift'),
      speedIndexMs: metrica('speed-index'),
      ttiMs: metrica('interactive'),
    },
    diagnosticos,
    avisos,
  };
}

/** 0–1 → 0–100, só para apresentação. Ausente continua ausente. */
export function paraCem(n: number | null): number | null {
  return n === null ? null : Math.round(n * 100);
}

const ENDERECO = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function analisar(
  url: string,
  estrategia: Estrategia,
  opcoes: { signal?: AbortSignal } = {},
): Promise<ResultadoPageSpeed> {
  const chave = process.env.PAGESPEED_API_KEY;
  if (!chave) throw new IntegracaoNaoConfigurada();

  const params = new URLSearchParams({ url, strategy: estrategia, locale: 'pt_BR', key: chave });
  // Categoria é repetida, não separada por vírgula: a API exige uma ocorrência
  // por categoria, e sem nenhuma ela devolve só performance.
  for (const c of CATEGORIAS) params.append('category', c);

  const resposta = await fetch(`${ENDERECO}?${params}`, {
    signal: opcoes.signal,
    headers: { accept: 'application/json' },
    // OBRIGATÓRIO. O `fetch` do Next.js guarda respostas de GET em cache, e a
    // URL desta chamada é sempre a mesma para a mesma página e dispositivo.
    // Sem isto, a PRIMEIRA resposta fica valendo para todas as seguintes:
    // uma falha intermitente vira permanente, e uma medição velha passa por
    // nova. Foi exatamente o que aconteceu — a mesma URL falhava sempre pelo
    // aplicativo e respondia 200 pelo curl.
    cache: 'no-store',
  });

  if (!resposta.ok) {
    // A mensagem da API entra no erro, mas a CHAVE nunca: ela está na query, e
    // repetir a URL aqui a colocaria no log.
    let detalhe = `HTTP ${resposta.status}`;
    try {
      const corpo = (await resposta.json()) as { error?: { message?: string } };
      if (corpo?.error?.message) detalhe = corpo.error.message;
    } catch {
      /* corpo não-JSON: o status já basta */
    }
    throw new FalhaNaAnalise(detalhe, resposta.status);
  }

  const corpo = await resposta.json();

  // A API devolve 200 mesmo quando o Lighthouse não conseguiu carregar a
  // página: o motivo vem em `lighthouseResult.runtimeError`. Sem esta
  // verificação, esse caso viraria uma "análise" com as quatro notas nulas
  // gravada no histórico — pior que um erro, porque parece medição.
  //
  // FAILED_DOCUMENT_REQUEST é comprovadamente intermitente: a mesma URL que
  // falhou respondeu 200 com notas reais na chamada seguinte. Por isso o job
  // volta para a fila em vez de ser descartado.
  const runtime = (corpo as { lighthouseResult?: { runtimeError?: { code?: string; message?: string } } })
    ?.lighthouseResult?.runtimeError;
  if (runtime?.code && runtime.code !== 'NO_ERROR') {
    throw new FalhaNaAnalise(runtime.message ?? runtime.code, resposta.status);
  }

  return interpretar(corpo, estrategia);
}
