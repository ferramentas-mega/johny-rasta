/**
 * Correções elegíveis: o que o Lighthouse REPROVOU naquela página, naquele
 * dispositivo, e sobre o que ele diz quanto se ganharia.
 *
 * ── O que existia, e não aparecia em lugar nenhum ────────────────────────────
 *
 * `lighthouse_results.auditorias` guarda todas as auditorias de cada análise
 * desde o esquema inicial — a medição real trouxe 153 delas — e **nenhuma linha
 * do projeto lia essa coluna**. Pior: a lista de Otimizações dizia, como próxima
 * ação, "Abrir Qualidade técnica e ver os diagnósticos", e a tela de Qualidade
 * técnica não mostrava diagnóstico nenhum. O produto mandava o operador a um
 * lugar que não tinha o que ele foi buscar.
 *
 * ── O que "elegível" quer dizer aqui ─────────────────────────────────────────
 *
 * O Lighthouse devolve duas coisas misturadas no mesmo saco:
 *
 *  - auditorias com VEREDITO — ele avaliou e reprovou. Há o que corrigir.
 *  - auditorias INFORMATIVAS — ele devolve o dado e não emite juízo (a lista de
 *    requisições da rede, o tamanho do DOM). Não há nada a decidir a respeito.
 *
 * Só as primeiras são correções. Jogar as duas na mesma lista encheria a tela de
 * itens sobre os quais não existe decisão a tomar — e uma lista em que a maior
 * parte não é acionável treina quem olha a ignorar a lista inteira, que é a
 * mesma razão pela qual o aviso de coleta exige site que já coletava.
 *
 * A distinção é derivada do dado guardado: a auditoria informativa vem sem nota.
 * As que não se aplicam à página e as que passaram já são descartadas antes de
 * gravar, em `relevante()`.
 *
 * ── O que esta lista NÃO faz ─────────────────────────────────────────────────
 *
 * Não soma economias. O `overallSavingsMs` do Lighthouse é o ganho estimado
 * daquela correção **isolada**, contra a mesma execução; corrigir duas coisas
 * não economiza a soma das duas, porque elas disputam o mesmo caminho crítico.
 * Somar produziria um número grande, convincente e falso.
 *
 * Não inventa economia. Boa parte das auditorias reprovadas não traz estimativa
 * nenhuma, e ausência de estimativa não é zero: elas continuam na lista, depois
 * das quantificadas, dizendo que o Lighthouse não estimou.
 */

export type Dispositivo = 'mobile' | 'desktop';

/** Como a auditoria foi gravada em `lighthouse_results.auditorias`. */
export type AuditoriaGravada = {
  id?: unknown;
  titulo?: unknown;
  nota?: unknown;
  economiaMs?: unknown;
  valorExibido?: unknown;
};

export type Correcao = {
  id: string;
  titulo: string;
  /** Nota da auditoria, de 0 a 1. Sempre presente numa correção. */
  nota: number;
  /** Economia estimada em ms, quando o Lighthouse estimou. `null` é ausência. */
  economiaMs: number | null;
  /** O que o Lighthouse mostra ao lado do título ("1,2 s", "3 recursos"). */
  valorExibido: string | null;
};

function numero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function texto(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/**
 * Separa o que é correção do que é informação.
 *
 * A entrada é o objeto gravado no banco — `{ [id]: auditoria }` —, e vem de uma
 * coluna `jsonb` escrita por uma versão do Lighthouse que pode mudar. Por isso
 * cada campo é lido com desconfiança: um `economiaMs` que virou string não pode
 * entrar numa ordenação como se fosse número.
 */
export function separarCorrecoes(bruto: unknown): {
  correcoes: Correcao[];
  informativas: number;
} {
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { correcoes: [], informativas: 0 };
  }

  const correcoes: Correcao[] = [];
  let informativas = 0;

  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>)) {
    if (!valor || typeof valor !== 'object') continue;
    const a = valor as AuditoriaGravada;
    const nota = numero(a.nota);

    // Sem nota, o Lighthouse não emitiu juízo: é dado, não pendência.
    if (nota === null) {
      informativas += 1;
      continue;
    }

    correcoes.push({
      id: texto(a.id) ?? chave,
      titulo: texto(a.titulo) ?? texto(a.id) ?? chave,
      nota,
      economiaMs: numero(a.economiaMs),
      valorExibido: texto(a.valorExibido),
    });
  }

  return { correcoes: ordenar(correcoes), informativas };
}

/**
 * Quantificadas primeiro, da maior economia para a menor; depois as demais.
 *
 * Ausência de estimativa vai para o fim, e **não** é tratada como zero: uma
 * auditoria sem estimativa pode ser mais importante que uma de 20 ms, e
 * ordená-la como se valesse zero afirmaria o contrário. Entre as sem
 * estimativa, a nota mais baixa primeiro — é o único critério que sobra, e é
 * o do próprio Lighthouse.
 */
export function ordenar(correcoes: Correcao[]): Correcao[] {
  return [...correcoes].sort((a, b) => {
    if (a.economiaMs !== null && b.economiaMs !== null) return b.economiaMs - a.economiaMs;
    if (a.economiaMs !== null) return -1;
    if (b.economiaMs !== null) return 1;
    return a.nota - b.nota;
  });
}

/**
 * A maior economia estimada do conjunto, ou `null` se nenhuma foi estimada.
 *
 * É o resumo que a tela mostra, e é deliberadamente a MAIOR, nunca a soma. Ver
 * o cabeçalho deste arquivo: somar `overallSavingsMs` produz um número grande,
 * convincente e falso.
 */
export function maiorEconomia(correcoes: Correcao[]): number | null {
  const estimadas = correcoes.map((c) => c.economiaMs).filter((e): e is number => e !== null);
  return estimadas.length ? Math.max(...estimadas) : null;
}
