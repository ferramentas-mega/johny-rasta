import 'server-only';

/**
 * CrUX — experiência real de usuários do Chrome.
 *
 * Separado do PageSpeed de propósito, por dois motivos:
 *
 * 1. São coisas diferentes. Lighthouse é laboratório: uma carga sintética, numa
 *    máquina do Google. CrUX é campo: o que aconteceu com gente de verdade nos
 *    últimos 28 dias. Misturar as duas numa tela só faria o leitor comparar
 *    números que não se comparam.
 * 2. O Google avisa que vai parar de devolver CrUX dentro da resposta do
 *    PageSpeed, e recomenda esta API. Depender do campo embutido seria
 *    construir sobre algo anunciado como temporário.
 *
 * Aqui está o ÚNICO lugar de onde INP pode sair. O Lighthouse não mede INP.
 */

export type FormFactor = 'PHONE' | 'DESKTOP' | 'TABLET';
export type Escopo = 'url' | 'origem';

export type JanelaDeColeta = { inicio: string; fim: string } | null;

export type LeituraCrux = {
  escopo: Escopo;
  /** A URL ou a origem efetivamente consultada. */
  alvo: string;
  formFactor: FormFactor;
  lcpP75Ms: number | null;
  inpP75Ms: number | null;
  clsP75: number | null;
  /**
   * A janela que a API devolveu — tipicamente 28 dias. NÃO é o período
   * comercial escolhido no painel: escolher "7 dias" na tela não estreita a
   * janela do CrUX, e apresentar como se estreitasse seria mentira.
   */
  janela: JanelaDeColeta;
};

export class CruxNaoConfigurado extends Error {
  constructor(readonly detalhe?: string) {
    super('A API do CrUX não está habilitada para esta chave.');
    this.name = 'CruxNaoConfigurado';
  }
}

const ENDERECO = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

/**
 * O p75 vem como número na documentação, mas o CLS já apareceu como string
 * (`"0.05"`) em respostas reais. Aceitar as duas formas custa três linhas;
 * assumir uma só custaria um valor silenciosamente perdido.
 */
function p75(metrica: unknown): number | null {
  const bruto = (metrica as { percentiles?: { p75?: unknown } } | undefined)?.percentiles?.p75;
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? bruto : null;
  if (typeof bruto === 'string') {
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function data(d: unknown): string | null {
  const o = d as { year?: number; month?: number; day?: number } | undefined;
  if (!o?.year || !o?.month || !o?.day) return null;
  const mm = String(o.month).padStart(2, '0');
  const dd = String(o.day).padStart(2, '0');
  return `${o.year}-${mm}-${dd}`;
}

export function interpretar(corpo: unknown, escopo: Escopo, alvo: string, formFactor: FormFactor): LeituraCrux {
  const registro = ((corpo ?? {}) as { record?: Record<string, unknown> }).record ?? {};
  const metricas = (registro.metrics ?? {}) as Record<string, unknown>;
  const periodo = registro.collectionPeriod as { firstDate?: unknown; lastDate?: unknown } | undefined;

  const inicio = data(periodo?.firstDate);
  const fim = data(periodo?.lastDate);

  return {
    escopo,
    alvo,
    formFactor,
    lcpP75Ms: p75(metricas.largest_contentful_paint),
    inpP75Ms: p75(metricas.interaction_to_next_paint),
    clsP75: p75(metricas.cumulative_layout_shift),
    janela: inicio && fim ? { inicio, fim } : null,
  };
}

async function consultar(
  corpo: Record<string, unknown>,
  escopo: Escopo,
  alvo: string,
  formFactor: FormFactor,
  signal?: AbortSignal,
): Promise<LeituraCrux | null> {
  const chave = process.env.PAGESPEED_API_KEY;
  if (!chave) throw new CruxNaoConfigurado('PAGESPEED_API_KEY ausente');

  const resposta = await fetch(`${ENDERECO}?key=${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...corpo, formFactor }),
    signal,
    // POST não é cacheado pelo Next, mas deixar explícito evita que uma
    // mudança futura reintroduza o problema que o PageSpeed teve.
    cache: 'no-store',
  });

  // 404 NÃO é falha: significa que o Chrome não tem amostra suficiente para
  // este alvo. É informação, e a tela precisa dizer "dados insuficientes" —
  // não zero, não erro.
  if (resposta.status === 404) return null;

  if (resposta.status === 403) {
    const texto = await resposta.text().catch(() => '');
    // A API do CrUX é habilitada à parte da do PageSpeed, com a mesma chave.
    throw new CruxNaoConfigurado(texto.slice(0, 300));
  }

  if (!resposta.ok) {
    throw new Error(`CrUX respondeu HTTP ${resposta.status}`);
  }

  return interpretar(await resposta.json(), escopo, alvo, formFactor);
}

/**
 * Tenta a URL; sem dados, cai para a origem — e diz qual foi.
 *
 * A distinção não é decorativa: a origem é a média de TODO o site. Mostrar o
 * número da origem no lugar do da página faria uma landing page lenta parecer
 * boa porque a Home é rápida.
 */
export async function consultarPaginaOuOrigem(
  url: string,
  formFactor: FormFactor,
  signal?: AbortSignal,
): Promise<LeituraCrux | null> {
  const daPagina = await consultar({ url }, 'url', url, formFactor, signal);
  if (daPagina && (daPagina.lcpP75Ms !== null || daPagina.inpP75Ms !== null || daPagina.clsP75 !== null)) {
    return daPagina;
  }

  const origem = new URL(url).origin;
  return consultar({ origin: origem }, 'origem', origem, formFactor, signal);
}
