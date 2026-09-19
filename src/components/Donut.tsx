import { num, pct } from '@/lib/formato';
import type { Fatia } from '@/lib/origens';

/**
 * Anel de participação — SVG escrito à mão, componente de servidor.
 *
 * Cada fatia é um arco de `stroke-dasharray` sobre um círculo: o comprimento é
 * a participação vezes o perímetro, e o deslocamento acumula as anteriores.
 * Não há biblioteca de gráfico aqui, e não vai entrar.
 *
 * O anel é decorativo: a legenda ao lado escreve rótulo, valor e participação
 * de cada fatia, e é ela que o leitor de tela lê.
 */

const TAMANHO = 132;
const RAIO = 52;
const TRACO = 16;
const PERIMETRO = 2 * Math.PI * RAIO;

export function Donut<T>({ fatias, rotuloDoTotal }: { fatias: Fatia<T>[]; rotuloDoTotal: string }) {
  const total = fatias.reduce((t, f) => t + f.valor, 0);
  const comBase = fatias.length > 0 && total > 0;
  let acumulado = 0;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--esp-5)', alignItems: 'center' }}>
      <svg width={TAMANHO} height={TAMANHO} viewBox={`0 0 ${TAMANHO} ${TAMANHO}`} aria-hidden="true" style={{ flex: 'none' }}>
        <circle cx={TAMANHO / 2} cy={TAMANHO / 2} r={RAIO} fill="none" stroke="var(--elev)" strokeWidth={TRACO} />
        {comBase &&
          fatias.map((f) => {
            const comprimento = (f.participacao ?? 0) * PERIMETRO;
            const deslocamento = -acumulado;
            acumulado += comprimento;
            return (
              <circle
                key={f.rotulo}
                className="donut-fatia"
                cx={TAMANHO / 2}
                cy={TAMANHO / 2}
                r={RAIO}
                fill="none"
                stroke={`var(--c${f.cor + 1})`}
                strokeWidth={TRACO}
                strokeDasharray={`${comprimento.toFixed(2)} ${PERIMETRO.toFixed(2)}`}
                strokeDashoffset={deslocamento.toFixed(2)}
                // Começa no topo, não às 3 horas.
                transform={`rotate(-90 ${TAMANHO / 2} ${TAMANHO / 2})`}
                data-fatia={f.rotulo}
              />
            );
          })}
        <text x={TAMANHO / 2} y={TAMANHO / 2 - 2} textAnchor="middle" className="mono" fontSize="18" fontWeight="600" fill="var(--tx)">
          {num(total)}
        </text>
        <text x={TAMANHO / 2} y={TAMANHO / 2 + 14} textAnchor="middle" fontSize="10" fill="var(--tx3)">
          {rotuloDoTotal}
        </text>
      </svg>

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 180px' }}>
        {fatias.map((f) => (
          <li key={f.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--tipo-apoio)', minWidth: 0 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 'var(--raio-p)', background: `var(--c${f.cor + 1})`, flex: 'none' }} />
            <span style={{ color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={f.rotulo}>
              {f.rotulo}
            </span>
            <span className="mono" style={{ color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>{num(f.valor)}</span>
            <span className="mono" style={{ color: 'var(--tx3)', minWidth: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {f.participacao === null ? '—' : pct(f.participacao, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
