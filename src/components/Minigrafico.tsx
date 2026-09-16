import { segmentosDaSerie, type Ponto } from '@/lib/evidencias';

/**
 * Sparkline: a série por trás de um número, sem eixo e sem rótulo.
 *
 * Componente de SERVIDOR e SVG estático, como o funil e as evidências. Não há
 * interação a oferecer num gráfico de 8px de altura útil, e um componente
 * cliente adiaria a primeira pintura para trazer comportamento nenhum.
 *
 * Três regras herdadas de `evidencias.ts`, e nenhuma é detalhe:
 *
 *  1. **Buraco é buraco.** Medição ausente INTERROMPE a linha. Ligada ao ponto
 *     seguinte, desenharia uma queda até o chão que não aconteceu — e gráfico é
 *     lido pela forma.
 *  2. **A régua é a faixa da própria série**, não 0–100. Contra 0–100 uma
 *     diferença de quatro pontos some, e é justamente ela que o sparkline
 *     existe para mostrar.
 *  3. **Um ponto não vira linha.** Ponto isolado é desenhado como ponto.
 *
 * O preenchimento em gradiente vem da referência: `accent 25%` no topo,
 * transparente embaixo. Preenchimento sólido empasta o número que está na
 * frente — a área existe para dar peso à forma, não para pintar o cartão.
 */

const LARGURA = 150;
const ALTURA = 38;
/** Respiro vertical: sem ele o pico encosta na borda e parece cortado. */
const PAD = 3;

/**
 * O x do primeiro e do último ponto de um segmento.
 *
 * `segmentosDaSerie` devolve o caminho já pronto como string — o que é bom para
 * a linha e insuficiente para a ÁREA, que precisa fechar contra a base. Em vez
 * de duplicar o cálculo de coordenadas (e arriscar que as duas contas divirjam),
 * lê-se de volta do caminho que a própria função gerou, num formato que ela
 * escreve duas linhas acima: `M x y L x y …`.
 */
function extremos(caminho: string): { primeiro: number; ultimo: number } | null {
  const xs = [...caminho.matchAll(/[ML] (-?[\d.]+) /g)].map((m) => Number(m[1]));
  if (xs.length === 0) return null;
  return { primeiro: xs[0]!, ultimo: xs[xs.length - 1]! };
}

export function Minigrafico({
  pontos,
  id,
  cor = 'var(--gold)',
}: {
  pontos: Ponto[];
  /** Precisa ser único na página: `<linearGradient>` é referenciado por id. */
  id: string;
  cor?: string;
}) {
  // A altura útil é menor que a do desenho: sem esse respiro o pico encosta na
  // borda de cima e parece cortado.
  const util = ALTURA - PAD * 2;
  const { segmentos, pontosIsolados } = segmentosDaSerie(pontos, LARGURA, util);
  if (segmentos.length === 0 && pontosIsolados.length === 0) return null;

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      preserveAspectRatio="none"
      width="100%"
      height={ALTURA}
      // Decorativo: o número e a variação estão escritos ao lado, e são eles
      // que um leitor de tela precisa anunciar. Um SVG de série sem rótulo não
      // acrescentaria leitura — acrescentaria ruído.
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {/* `accent 22%` no topo, transparente embaixo. Preenchimento sólido
              empastaria o número que está na frente: a área existe para dar
              peso à forma, não para pintar o cartão. */}
          <stop offset="0%" stopColor={cor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={cor} stopOpacity="0" />
        </linearGradient>
      </defs>

      <g transform={`translate(0 ${PAD})`}>
        {/* A área fecha POR SEGMENTO, não sobre a série inteira — senão o
            preenchimento atravessaria o buraco que a linha acabou de respeitar. */}
        {segmentos.map((d, i) => {
          const e = extremos(d);
          return e ? (
            <path key={`a${i}`} d={`${d} L ${e.ultimo} ${util} L ${e.primeiro} ${util} Z`} fill={`url(#${id})`} />
          ) : null;
        })}

        {segmentos.map((d, i) => (
          <path
            key={`l${i}`}
            d={d}
            fill="none"
            stroke={cor}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            // Mantém a espessura constante apesar do `preserveAspectRatio="none"`,
            // que estica o desenho na horizontal.
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* Ponto isolado vira PONTO: um ponto não tem linha. */}
        {pontosIsolados.map((c, i) => (
          <circle key={`p${i}`} cx={c.x} cy={c.y} r={1.8} fill={cor} />
        ))}
      </g>
    </svg>
  );
}
