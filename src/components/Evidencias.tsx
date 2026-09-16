import {
  faixaDaSerie,
  segmentosDaSerie,
  variacaoDaSerie,
  type Ponto,
} from '@/lib/evidencias';
import { dataHora, duracaoMs, num } from '@/lib/formato';

/**
 * A série de medições por trás de uma afirmação sobre desempenho.
 *
 * Componente de servidor e SVG estático: não há interação a oferecer, e um
 * componente cliente adiaria a primeira pintura para trazer comportamento
 * nenhum. Mesma escolha do funil.
 *
 * O que ele NÃO faz:
 *
 *  - Não mistura laboratório e campo. São duas séries, em painéis separados,
 *    pela mesma razão registrada no CLAUDE.md — a mesma página deu 12,0 s no
 *    laboratório e 3,2 s no campo, e os dois estão certos.
 *  - Não conclui que alguma coisa causou a variação. Mostra as medições e as
 *    datas; quem lê investiga.
 *  - Não fecha o buraco. Medição ausente interrompe a linha em vez de descer
 *    até o chão.
 */

const LARGURA = 260;
const ALTURA = 44;

export type SerieDeEvidencia = {
  chave: string;
  titulo: string;
  subtitulo: string;
  /** Rótulo da unidade, só para a legenda. */
  unidade: 'nota' | 'ms';
  maiorEhMelhor: boolean;
  pontos: Ponto[];
  /** Quantas medições existem no total, quando a série mostrada é um recorte. */
  total?: number;
};

function formatar(valor: number | null, unidade: SerieDeEvidencia['unidade']): string {
  if (valor === null) return 'sem medição';
  return unidade === 'ms' ? duracaoMs(valor) : `${Math.round(valor)}/100`;
}

function Faixa({ serie }: { serie: SerieDeEvidencia }) {
  const faixa = faixaDaSerie(serie.pontos);
  const { segmentos, pontosIsolados } = segmentosDaSerie(serie.pontos, LARGURA, ALTURA);

  if (!faixa) {
    return (
      <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0 }}>
        Nenhuma medição com valor nesta série.
      </p>
    );
  }

  const buracos = serie.pontos.filter((p) => p.valor === null).length;

  return (
    <div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width="100%"
        height={ALTURA}
        style={{ display: 'block', overflow: 'visible' }}
        role="img"
        aria-label={serie.pontos
          .map((p) => `${dataHora(p.em)}: ${formatar(p.valor, serie.unidade)}`)
          .join('; ')}
      >
        {segmentos.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--gold)" strokeWidth={1.6} />
        ))}
        {/* Um ponto cercado de buracos não tem segmento para desenhar. Sem isto
            ele simplesmente não apareceria — a medição existiria no banco e não
            na tela. */}
        {pontosIsolados.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2.2} fill="var(--gold)" />
        ))}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          fontSize: 10.5,
          color: 'var(--tx3)',
          marginTop: 2,
        }}
      >
        {/* A régua é a faixa da PRÓPRIA série, e a legenda diz isso: uma linha
            que sobe de 34 para 38 parece uma escalada se ninguém disser entre
            que valores ela está sendo desenhada. */}
        <span className="mono">
          {formatar(faixa.minimo, serie.unidade)} – {formatar(faixa.maximo, serie.unidade)}
        </span>
        <span>
          {num(serie.pontos.length)} medição(ões)
          {serie.total !== undefined && serie.total > serie.pontos.length && (
            <> de {num(serie.total)}</>
          )}
          {buracos > 0 && <> · {num(buracos)} sem valor</>}
        </span>
      </div>
    </div>
  );
}

function Variacao({ serie }: { serie: SerieDeEvidencia }) {
  const v = variacaoDaSerie(serie.pontos, serie.maiorEhMelhor);

  // Uma medição só não tem variação. Dizer "0%" afirmaria que comparamos.
  if (!v) {
    return (
      <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Sem base comparável nesta série</span>
    );
  }

  const cor =
    v.direcao === 'melhora' ? 'var(--pos)' : v.direcao === 'piora' ? 'var(--neg)' : 'var(--tx3)';
  const sinal = v.delta > 0 ? '+' : v.delta < 0 ? '−' : '';
  const magnitude =
    serie.unidade === 'ms' ? duracaoMs(Math.abs(v.delta)) : `${Math.round(Math.abs(v.delta))}`;

  return (
    <span className="mono" style={{ fontSize: 12, color: cor }}>
      {sinal}
      {magnitude} da primeira à última medição
    </span>
  );
}

export function Evidencias({ series }: { series: SerieDeEvidencia[] }) {
  if (series.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6 }}>
        Nenhuma medição guardada ainda. A evidência aparece a partir da primeira análise — e a
        comparação, a partir da segunda.
      </p>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      }}
    >
      {series.map((serie) => (
        <div
          key={serie.chave}
          // A chave identifica a série na prova de navegador. Sem ela o teste
          // caçaria o cartão pelo texto do título, e "Desempenho" também é o
          // começo do título do painel: o seletor casava com a casca inteira.
          data-serie={serie.chave}
          style={{
            border: '1px solid var(--bd)',
            borderRadius: 10,
            background: 'var(--card)',
            padding: '12px 14px',
          }}
        >
          <div className="mono" style={{ fontSize: 12, color: 'var(--tx)' }}>
            {serie.titulo}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tx3)', margin: '2px 0 10px' }}>
            {serie.subtitulo}
          </div>
          <Faixa serie={serie} />
          <div style={{ marginTop: 8 }}>
            <Variacao serie={serie} />
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--tx3)', marginTop: 6 }}>
            {dataHora(serie.pontos[0]!.em)} → {dataHora(serie.pontos[serie.pontos.length - 1]!.em)}
          </div>
        </div>
      ))}
    </div>
  );
}
