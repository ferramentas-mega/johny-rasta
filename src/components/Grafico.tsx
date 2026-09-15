'use client';

import { useId, useState } from 'react';
import { num, dataCurta } from '@/lib/formato';
import { escalasDoGrafico } from '@/lib/eixo';
import type { DailyPoint } from '@/server/metrics/queries';

/**
 * Evolução diária.
 *
 * CORREÇÃO CENTRAL: no protótipo, a linha de formulários era normalizada contra
 * o eixo de visitas (`v / formMax * max * 0.55`) e desenhada com os rótulos das
 * visitas. A curva parecia mostrar centenas de formulários enquanto o cartão
 * dizia 37 — números que não podiam ser conferidos porque não existiam.
 *
 * Aqui a série de formulários tem EIXO PRÓPRIO, à direita, com números reais.
 * As duas escalas são anunciadas na legenda, e a soma da série é exatamente o
 * valor do cartão de formulários (garantido por teste).
 */

type Metrica = 'sessoes' | 'cliquesCta' | 'formularios';

const ROTULO: Record<Metrica, string> = {
  sessoes: 'Visitas',
  cliquesCta: 'Cliques em CTA',
  formularios: 'Formulários',
};

const PAD = { top: 16, right: 52, bottom: 28, left: 52 };
const LARGURA = 760;
const ALTURA = 240;
const INTERNO_L = LARGURA - PAD.left - PAD.right;
const INTERNO_A = ALTURA - PAD.top - PAD.bottom;

function caminho(valores: number[], topo: number): string {
  const n = valores.length;
  if (n === 0) return '';
  const dx = n > 1 ? INTERNO_L / (n - 1) : 0;
  const pts = valores.map((v, i) => [PAD.left + i * dx, PAD.top + INTERNO_A - (v / topo) * INTERNO_A] as const);

  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  // Curva suave de Catmull-Rom convertida em Bézier, como no protótipo.
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? pts[i + 1]!;
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)}`;
    d += ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)}`;
    d += ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Grafico({ pontos, periodo }: { pontos: DailyPoint[]; periodo: string }) {
  const [metrica, setMetrica] = useState<Metrica>('sessoes');
  const gradiente = useId();

  const principal = pontos.map((p) => p[metrica]);
  const formularios = pontos.map((p) => p.formularios);
  const mostrarSegunda = metrica !== 'formularios';

  // Os dois eixos dividem as MESMAS linhas, então compartilham a contagem de
  // intervalos — e ela é fixa. Cada topo depende só do máximo da própria série:
  // trocar a métrica principal não pode mexer na escala dos formulários.
  const { esquerda: eixoEsq, direita: eixoDir } = escalasDoGrafico(principal, formularios);
  const topoEsq = eixoEsq.topo;

  const dx = pontos.length > 1 ? INTERNO_L / (pontos.length - 1) : 0;

  // Em 30 dias mostrar todo dia vira borrão: um a cada 5.
  const passoRotulo = pontos.length > 12 ? Math.ceil(pontos.length / 7) : 1;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <div role="group" aria-label="Métrica do gráfico" style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(ROTULO) as Metrica[]).map((m) => {
            const on = m === metrica;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setMetrica(m)}
                style={{
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '6px 11px',
                  borderRadius: 8,
                  background: on ? 'var(--gold)' : 'var(--elev)',
                  color: on ? 'var(--on-gold)' : 'var(--tx2)',
                  border: `1px solid ${on ? 'var(--gold)' : 'var(--bd)'}`,
                }}
              >
                {ROTULO[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* A legenda diz a qual eixo cada linha pertence. Sem isso, duas escalas
          no mesmo desenho enganam mais do que informam. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 11.5, color: 'var(--tx2)', marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <svg width="22" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="22" y2="4" stroke="var(--gold)" strokeWidth="2.5" />
          </svg>
          {ROTULO[metrica]} — eixo da esquerda
        </span>
        {mostrarSegunda && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" stroke="var(--tx2)" strokeWidth="2" strokeDasharray="5 4" />
            </svg>
            Formulários recebidos — eixo da direita
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width="100%"
        role="img"
        aria-label={`Evolução de ${ROTULO[metrica].toLowerCase()} por dia, ${periodo}. Máximo do eixo esquerdo: ${num(topoEsq)}.`}
        style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {eixoEsq.marcas.map((valor, i) => {
          const y = PAD.top + INTERNO_A - (i / eixoEsq.intervalos) * INTERNO_A;
          return (
            <g key={valor}>
              <line x1={PAD.left} y1={y} x2={PAD.left + INTERNO_L} y2={y} stroke="var(--rowbd)" strokeWidth="1" />
              <text
                x={PAD.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10.5"
                fill="var(--tx3)"
                className="mono"
                data-eixo="esquerda"
              >
                {num(valor)}
              </text>
              {mostrarSegunda && (
                <text
                  x={PAD.left + INTERNO_L + 8}
                  y={y + 4}
                  fontSize="10.5"
                  fill="var(--tx3)"
                  className="mono"
                  data-eixo="direita"
                >
                  {num(eixoDir.marcas[i]!)}
                </text>
              )}
            </g>
          );
        })}

        <path d={`${caminho(principal, topoEsq)} L${PAD.left + INTERNO_L} ${PAD.top + INTERNO_A} L${PAD.left} ${PAD.top + INTERNO_A} Z`} fill={`url(#${gradiente})`} />
        <path d={caminho(principal, topoEsq)} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {mostrarSegunda && (
          <path d={caminho(formularios, eixoDir.topo)} fill="none" stroke="var(--tx2)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        )}

        {principal.map((v, i) => (
          <circle
            key={i}
            cx={PAD.left + i * dx}
            cy={PAD.top + INTERNO_A - (v / topoEsq) * INTERNO_A}
            r="3"
            fill="var(--gold)"
          >
            <title>{`${dataCurta(pontos[i]!.dia)}: ${num(v)} ${ROTULO[metrica].toLowerCase()}${mostrarSegunda ? ` · ${num(formularios[i]!)} formulários` : ''}`}</title>
          </circle>
        ))}

        {pontos.map((p, i) =>
          i % passoRotulo === 0 || i === pontos.length - 1 ? (
            <text
              key={p.dia}
              x={PAD.left + i * dx}
              y={ALTURA - 8}
              textAnchor={i === 0 ? 'start' : i === pontos.length - 1 ? 'end' : 'middle'}
              fontSize="10.5"
              fill="var(--tx3)"
              className="mono"
            >
              {dataCurta(p.dia)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
