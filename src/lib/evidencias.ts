/**
 * Evidências de desempenho: a série de medições por trás de cada afirmação.
 *
 * ── O que existia, e não aparecia ────────────────────────────────────────────
 *
 * `lighthouse_results` e `crux_snapshots` gravam uma LINHA NOVA a cada coleta, de
 * propósito, e os dois comentários no código dizem por quê — "histórico não se
 * apaga", "sobrescrever apagaria a possibilidade de comparar como a experiência
 * real evoluiu". Só que **toda consulta do projeto lia `distinct on (…)`**: a
 * última linha de cada par, e nada mais. O histórico era guardado para uma
 * comparação que nenhuma tela fazia.
 *
 * Enquanto isso o painel JÁ AFIRMA coisas sobre desempenho: o acompanhamento
 * fechado guarda "de 34 para 91", e a lista de Otimizações diz que a página está
 * lenta. Afirmação sem a série que a sustenta é pedir confiança; a série é a
 * evidência.
 *
 * ── As três regras deste arquivo ─────────────────────────────────────────────
 *
 * 1. **Buraco é buraco, nunca zero.** Uma medição ausente interrompe a linha.
 *    Ligá-la ao ponto seguinte desenharia uma queda até o chão que não
 *    aconteceu — e um gráfico é lido pela forma, não pelos números.
 * 2. **Um ponto não tem variação.** Sem medição anterior não existe "melhorou":
 *    a resposta é que não há base comparável, como em todo o resto do painel.
 * 3. **A direção depende da métrica.** Nota subindo é melhora; LCP subindo é
 *    piora. Quem chama informa qual é o caso — inferir pelo nome da coluna seria
 *    o tipo de esperteza que erra em silêncio no dia em que a coluna mudar.
 */

export type Ponto = {
  /** `null` é medição ausente naquele instante — não é zero. */
  valor: number | null;
  em: Date;
};

export type Direcao = 'melhora' | 'piora' | 'igual';

export type Variacao = {
  delta: number;
  direcao: Direcao;
};

/**
 * A diferença entre duas medições.
 *
 * `null` quando falta qualquer uma das duas: é o mesmo "sem base de cálculo" que
 * o painel usa em toda parte, e é diferente de `delta: 0`, que afirma "medimos as
 * duas e não mudou".
 */
export function variacaoEntre(
  anterior: number | null,
  atual: number | null,
  maiorEhMelhor: boolean,
): Variacao | null {
  if (anterior === null || atual === null) return null;
  if (!Number.isFinite(anterior) || !Number.isFinite(atual)) return null;

  const delta = atual - anterior;
  if (delta === 0) return { delta: 0, direcao: 'igual' };
  const subiu = delta > 0;
  return { delta, direcao: subiu === maiorEhMelhor ? 'melhora' : 'piora' };
}

/**
 * A variação entre a PRIMEIRA e a ÚLTIMA medição com valor da série.
 *
 * Primeira e última com valor, e não primeira e última posições: uma série que
 * termina num buraco não perdeu desempenho, ela ficou sem medição.
 */
export function variacaoDaSerie(pontos: Ponto[], maiorEhMelhor: boolean): Variacao | null {
  const comValor = pontos.filter((p) => p.valor !== null);
  if (comValor.length < 2) return null;
  return variacaoEntre(comValor[0]!.valor, comValor[comValor.length - 1]!.valor, maiorEhMelhor);
}

export type Faixa = { minimo: number; maximo: number };

/**
 * Os extremos da série, ignorando os buracos.
 *
 * `null` quando não há nenhum valor: uma faixa `0–0` desenharia uma linha reta
 * no chão para uma série que ninguém mediu.
 */
export function faixaDaSerie(pontos: Ponto[]): Faixa | null {
  const valores = pontos.map((p) => p.valor).filter((v): v is number => v !== null);
  if (valores.length === 0) return null;
  return { minimo: Math.min(...valores), maximo: Math.max(...valores) };
}

export type Segmento = string;

/**
 * O caminho SVG da série, QUEBRADO nos buracos.
 *
 * Devolve um segmento por trecho contínuo, em vez de um `path` só: um `M` no
 * meio de um `d` também interromperia o traço, mas um ponto isolado entre dois
 * buracos ficaria invisível — sem segmento para desenhar, não há nada na tela.
 * Com a lista, quem desenha sabe que aquele trecho tem um ponto só e pode
 * marcá-lo.
 *
 * A escala vertical é a faixa da própria série, não 0–100: a diferença entre 34
 * e 38 some contra uma régua de 0 a 100, e é justamente essa diferença que a
 * evidência precisa mostrar. Série de valor constante fica na linha do meio, e
 * não colada no topo ou no chão, porque `maximo === minimo` não diz se o valor é
 * alto ou baixo.
 */
export function segmentosDaSerie(
  pontos: Ponto[],
  largura: number,
  altura: number,
): { segmentos: Segmento[]; pontosIsolados: { x: number; y: number }[] } {
  const faixa = faixaDaSerie(pontos);
  if (!faixa || pontos.length === 0) return { segmentos: [], pontosIsolados: [] };

  const amplitude = faixa.maximo - faixa.minimo;
  const passoX = pontos.length > 1 ? largura / (pontos.length - 1) : 0;

  const coordenada = (p: Ponto, i: number) => ({
    x: pontos.length > 1 ? i * passoX : largura / 2,
    y: amplitude === 0 ? altura / 2 : altura - ((p.valor! - faixa.minimo) / amplitude) * altura,
  });

  const segmentos: Segmento[] = [];
  const pontosIsolados: { x: number; y: number }[] = [];
  let trecho: { x: number; y: number }[] = [];

  const fechar = () => {
    if (trecho.length === 1) pontosIsolados.push(trecho[0]!);
    if (trecho.length > 1) {
      segmentos.push(
        trecho.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' '),
      );
    }
    trecho = [];
  };

  pontos.forEach((p, i) => {
    if (p.valor === null) {
      fechar();
      return;
    }
    trecho.push(coordenada(p, i));
  });
  fechar();

  return { segmentos, pontosIsolados };
}
