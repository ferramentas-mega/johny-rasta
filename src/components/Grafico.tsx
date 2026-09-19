'use client';

import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { num, dataCurta } from '@/lib/formato';
import { escalasDoGrafico, eixoDeContagem, diasRotulados } from '@/lib/eixo';
import type { DailyPoint } from '@/server/metrics/queries';

/**
 * Evolução diária.
 *
 * CORREÇÃO CENTRAL (mantida da v1): no protótipo, a linha de formulários era
 * normalizada contra o eixo de visitas (`v / formMax * max * 0.55`) e desenhada
 * com os rótulos das visitas. A curva parecia mostrar centenas de formulários
 * enquanto o cartão dizia 37 — números que não podiam ser conferidos porque não
 * existiam. Aqui a série de formulários tem EIXO PRÓPRIO, à direita, com
 * números reais, e a soma da série é exatamente o valor do cartão (garantido
 * por teste).
 *
 * v2 acrescenta, sem mexer em nenhuma conta:
 *
 *  - **Linha do período anterior**, fina e cinza, alinhada dia a dia contra o
 *    MESMO eixo da métrica. É a mesma consulta, sobre a janela anterior — a
 *    que já alimenta a variação dos cartões.
 *  - **Modo "barras por ação"**: cada dia é uma pilha com os quatro subtipos de
 *    clique (WhatsApp, abertura de formulário, telefone, e-mail). O eixo é o
 *    máximo da PILHA, não do maior segmento — senão o dia mais cheio estouraria
 *    o desenho.
 *  - **Cursor e dica**: passar o mouse (ou usar as setas, com o gráfico em
 *    foco) mostra os números do dia. A dica escreve os valores; o SVG continua
 *    decorativo para quem não o vê.
 *  - **A curva nunca desce abaixo de zero.** Catmull-Rom cria pontos de
 *    controle fora da faixa dos dados, e uma sequência "3, 0, 0, 3" desenhava
 *    um vale negativo — um número que não existe. Os pontos de controle são
 *    presos à faixa do eixo; a curva de Bézier fica dentro do casco convexo
 *    deles.
 *
 * Tudo é SVG escrito à mão: nenhuma biblioteca de gráfico entra aqui.
 */

type Metrica = 'sessoes' | 'cliquesCta' | 'formularios';
type Modo = 'linha' | 'barras';

const ROTULO: Record<Metrica, string> = {
  sessoes: 'Visitas',
  cliquesCta: 'Cliques em CTA',
  formularios: 'Formulários',
};

/** Cor da MÉTRICA, a mesma do cartão correspondente. */
const COR: Record<Metrica, string> = {
  sessoes: 'var(--c1)',
  cliquesCta: 'var(--c2)',
  formularios: 'var(--c3)',
};

/** As pilhas do modo por ação, de baixo para cima. A ordem é a da paleta. */
const ACOES = [
  { chave: 'cliquesWhatsapp', rotulo: 'WhatsApp', cor: 'var(--c1)' },
  { chave: 'aberturasFormulario', rotulo: 'Abertura de formulário', cor: 'var(--c2)' },
  { chave: 'cliquesTelefone', rotulo: 'Telefone', cor: 'var(--c3)' },
  { chave: 'cliquesEmail', rotulo: 'E-mail', cor: 'var(--c4)' },
] as const;

const PAD = { top: 16, right: 52, bottom: 28, left: 52 };
const LARGURA = 760;
const ALTURA = 240;
const INTERNO_L = LARGURA - PAD.left - PAD.right;
const INTERNO_A = ALTURA - PAD.top - PAD.bottom;
const BASE = PAD.top + INTERNO_A;

const yDe = (v: number, topo: number) => BASE - (v / topo) * INTERNO_A;

/** Prende um y à faixa do eixo: nem acima do topo, nem abaixo do zero. */
const presoAoEixo = (y: number) => Math.min(BASE, Math.max(PAD.top, y));

function caminho(valores: number[], topo: number): string {
  const n = valores.length;
  if (n === 0) return '';
  const dx = n > 1 ? INTERNO_L / (n - 1) : 0;
  const pts = valores.map((v, i) => [PAD.left + i * dx, yDe(v, topo)] as const);

  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  // Curva suave de Catmull-Rom convertida em Bézier, como no protótipo — com os
  // pontos de controle presos à faixa do eixo (ver o cabeçalho do arquivo).
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? pts[i + 1]!;
    const c1y = presoAoEixo(p1[1] + (p2[1] - p0[1]) / 6);
    const c2y = presoAoEixo(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${c1y.toFixed(1)}`;
    d += ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${c2y.toFixed(1)}`;
    d += ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

const botaoChip = (on: boolean): React.CSSProperties => ({
  cursor: 'pointer',
  fontSize: 'var(--tipo-apoio)',
  padding: '6px 11px',
  minHeight: 32,
  borderRadius: 'var(--raio-p)',
  background: on ? 'var(--gold)' : 'var(--elev)',
  color: on ? 'var(--on-gold)' : 'var(--tx2)',
  border: `1px solid ${on ? 'var(--gold)' : 'var(--bd)'}`,
});

function Amostra({ cor, tracejada, fina }: { cor: string; tracejada?: boolean; fina?: boolean }) {
  return (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="22" y2="4" stroke={cor} strokeWidth={fina ? 1.5 : 2.5} strokeDasharray={tracejada ? '5 4' : undefined} />
    </svg>
  );
}

export function Grafico({
  pontos,
  anteriores = [],
  periodo,
}: {
  pontos: DailyPoint[];
  /** A mesma série, sobre o período anterior. Alinhada dia a dia pela posição. */
  anteriores?: DailyPoint[];
  periodo: string;
}) {
  const [metrica, setMetrica] = useState<Metrica>('sessoes');
  const [modo, setModo] = useState<Modo>('linha');
  const [foco, setFoco] = useState<number | null>(null);
  const gradiente = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  const n = pontos.length;
  const principal = pontos.map((p) => p[metrica]);
  const formularios = pontos.map((p) => p.formularios);
  const anterior = anteriores.slice(0, n).map((p) => p[metrica]);
  const mostrarSegunda = metrica !== 'formularios';
  const mostrarAnterior = anterior.length === n && n > 0;

  // Os dois eixos dividem as MESMAS linhas, então compartilham a contagem de
  // intervalos — e ela é fixa. Cada topo depende só do máximo da própria série:
  // trocar a métrica principal não pode mexer na escala dos formulários. A
  // linha do período anterior entra no topo da esquerda: ela é da mesma
  // métrica, e um dia anterior maior que o atual precisa caber no desenho.
  const { esquerda: eixoEsq, direita: eixoDir } = escalasDoGrafico([...principal, ...anterior], formularios);
  const topoEsq = eixoEsq.topo;

  // Modo por ação: o eixo é o máximo da PILHA.
  const pilhas = pontos.map((p) => ACOES.reduce((t, a) => t + p[a.chave], 0));
  const eixoPilha = eixoDeContagem(Math.max(...pilhas, 0));

  const eixo = modo === 'linha' ? eixoEsq : eixoPilha;
  const dx = n > 1 ? INTERNO_L / (n - 1) : 0;
  const vao = n > 0 ? INTERNO_L / n : INTERNO_L;
  const larguraBarra = Math.max(2, vao * 0.62);
  const xDoDia = (i: number) => (modo === 'linha' ? PAD.left + i * dx : PAD.left + i * vao + vao / 2);

  const rotulados = new Set(diasRotulados(n));

  const focar = (i: number | null) => setFoco(i === null ? null : Math.min(n - 1, Math.max(0, i)));

  const aoMover = (e: MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || n === 0) return;
    const caixa = svg.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / caixa.width) * LARGURA;
    focar(modo === 'linha' ? Math.round((x - PAD.left) / (dx || 1)) : Math.floor((x - PAD.left) / vao));
  };

  const aoTeclar = (e: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); focar((foco ?? -1) + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focar((foco ?? n) - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focar(0); }
    else if (e.key === 'End') { e.preventDefault(); focar(n - 1); }
    else if (e.key === 'Escape') focar(null);
  };

  const dia = foco === null ? null : pontos[foco] ?? null;
  const xFoco = foco === null ? 0 : xDoDia(foco);
  const yFoco = dia === null ? 0 : modo === 'linha' ? yDe(dia[metrica], topoEsq) : yDe(pilhas[foco!]!, eixoPilha.topo);
  const dicaLado: 'esquerda' | 'meio' | 'direita' = xFoco < LARGURA * 0.22 ? 'esquerda' : xFoco > LARGURA * 0.72 ? 'direita' : 'meio';

  const descricao =
    modo === 'linha'
      ? `Evolução de ${ROTULO[metrica].toLowerCase()} por dia, ${periodo}. Máximo do eixo esquerdo: ${num(topoEsq)}.`
      : `Cliques por ação e por dia, ${periodo}. Máximo do eixo: ${num(eixoPilha.topo)}.`;

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        {modo === 'linha' && (
          <div role="group" aria-label="Métrica do gráfico" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(ROTULO) as Metrica[]).map((m) => {
              const on = m === metrica;
              return (
                <button key={m} type="button" aria-pressed={on} onClick={() => setMetrica(m)} style={botaoChip(on)}>
                  {ROTULO[m]}
                </button>
              );
            })}
          </div>
        )}
        <div role="group" aria-label="Forma do gráfico" style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {([['linha', 'Linha'], ['barras', 'Barras por ação']] as const).map(([m, rotulo]) => {
            const on = m === modo;
            return (
              <button key={m} type="button" aria-pressed={on} onClick={() => { setModo(m); setFoco(null); }} style={botaoChip(on)}>
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {/* A legenda diz a qual eixo cada linha pertence. Sem isso, duas escalas
          no mesmo desenho enganam mais do que informam. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)', marginBottom: 6 }}>
        {modo === 'linha' ? (
          <>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Amostra cor={COR[metrica]} />
              {ROTULO[metrica]} — eixo da esquerda
            </span>
            {mostrarSegunda && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Amostra cor="var(--c3)" tracejada />
                Formulários recebidos — eixo da direita
              </span>
            )}
            {mostrarAnterior && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Amostra cor="var(--c5)" fina />
                Período anterior, mesmo eixo
              </span>
            )}
          </>
        ) : (
          ACOES.map((a) => (
            <span key={a.chave} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 'var(--raio-p)', background: a.cor, display: 'inline-block' }} />
              {a.rotulo}
            </span>
          ))
        )}
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          className="grafico-svg"
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          width="100%"
          role="img"
          tabIndex={0}
          aria-label={`${descricao} Com o gráfico em foco, as setas percorrem os dias.`}
          onMouseMove={aoMover}
          onMouseLeave={() => focar(null)}
          onKeyDown={aoTeclar}
          onBlur={() => focar(null)}
          style={{ display: 'block', maxWidth: '100%', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id={gradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR[metrica]} stopOpacity="0.22" />
              <stop offset="100%" stopColor={COR[metrica]} stopOpacity="0" />
            </linearGradient>
          </defs>

          {eixo.marcas.map((valor, i) => {
            const y = BASE - (i / eixo.intervalos) * INTERNO_A;
            return (
              <g key={valor}>
                <line x1={PAD.left} y1={y} x2={PAD.left + INTERNO_L} y2={y} stroke="var(--rowbd)" strokeWidth="1" />
                <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="var(--tx3)" className="mono" data-eixo="esquerda">
                  {num(valor)}
                </text>
                {modo === 'linha' && mostrarSegunda && (
                  <text x={PAD.left + INTERNO_L + 8} y={y + 4} fontSize="10.5" fill="var(--tx3)" className="mono" data-eixo="direita">
                    {num(eixoDir.marcas[i]!)}
                  </text>
                )}
              </g>
            );
          })}

          {modo === 'linha' ? (
            <>
              <path
                key={`area-${metrica}`}
                className="grafico-area"
                d={`${caminho(principal, topoEsq)} L${PAD.left + INTERNO_L} ${BASE} L${PAD.left} ${BASE} Z`}
                fill={`url(#${gradiente})`}
              />
              {mostrarAnterior && (
                <path
                  d={caminho(anterior, topoEsq)}
                  fill="none"
                  stroke="var(--c5)"
                  strokeWidth="1.5"
                  strokeOpacity="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  data-serie="anterior"
                />
              )}
              <path
                key={`linha-${metrica}`}
                className="grafico-linha"
                pathLength={1}
                d={caminho(principal, topoEsq)}
                fill="none"
                stroke={COR[metrica]}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                data-serie="principal"
              />
              {mostrarSegunda && (
                <path
                  d={caminho(formularios, eixoDir.topo)}
                  fill="none"
                  stroke="var(--c3)"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                  data-serie="formularios"
                />
              )}
              {principal.map((v, i) => (
                <circle key={i} cx={xDoDia(i)} cy={yDe(v, topoEsq)} r={foco === i ? 4.5 : 3} fill={COR[metrica]}>
                  <title>{`${dataCurta(pontos[i]!.dia)}: ${num(v)} ${ROTULO[metrica].toLowerCase()}${mostrarSegunda ? ` · ${num(formularios[i]!)} formulários` : ''}`}</title>
                </circle>
              ))}
            </>
          ) : (
            pontos.map((p, i) => {
              let acumulado = 0;
              const x = PAD.left + i * vao + (vao - larguraBarra) / 2;
              return (
                <g key={p.dia} className="grafico-barra" style={{ animationDelay: `${i * 22}ms` }} opacity={foco === null || foco === i ? 1 : 0.55}>
                  <title>{`${dataCurta(p.dia)}: ${ACOES.map((a) => `${num(p[a.chave])} ${a.rotulo.toLowerCase()}`).join(' · ')}`}</title>
                  {ACOES.map((a) => {
                    const v = p[a.chave];
                    const y0 = yDe(acumulado, eixoPilha.topo);
                    const y1 = yDe(acumulado + v, eixoPilha.topo);
                    acumulado += v;
                    return v > 0 ? <rect key={a.chave} x={x} y={y1} width={larguraBarra} height={y0 - y1} fill={a.cor} data-acao={a.chave} /> : null;
                  })}
                </g>
              );
            })
          )}

          {foco !== null && dia && (
            <line x1={xFoco} y1={PAD.top} x2={xFoco} y2={BASE} stroke="var(--tx3)" strokeWidth="1" strokeDasharray="3 3" data-cursor="dia" />
          )}

          {pontos.map((p, i) =>
            rotulados.has(i) ? (
              <text
                key={p.dia}
                x={xDoDia(i)}
                y={ALTURA - 8}
                textAnchor={modo === 'linha' ? (i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle') : 'middle'}
                fontSize="10.5"
                fill="var(--tx3)"
                className="mono"
              >
                {dataCurta(p.dia)}
              </text>
            ) : null,
          )}
        </svg>

        {/* A dica escreve os números do dia. `aria-live` para quem navega por
            teclado ouvir o dia que as setas escolheram. */}
        <div aria-live="polite" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {dia && (
            <div
              className="grafico-dica mono"
              style={{
                position: 'absolute',
                left: `${(xFoco / LARGURA) * 100}%`,
                top: `${(yFoco / ALTURA) * 100}%`,
                transform: `translate(${dicaLado === 'esquerda' ? '8px' : dicaLado === 'direita' ? 'calc(-100% - 8px)' : '-50%'}, calc(-100% - 12px))`,
              }}
            >
              <div style={{ color: 'var(--tx3)', marginBottom: 4 }}>{dataCurta(dia.dia)}</div>
              {modo === 'linha' ? (
                <>
                  <div><span style={{ color: COR.sessoes }}>●</span> Visitas {num(dia.sessoes)}</div>
                  <div><span style={{ color: COR.cliquesCta }}>●</span> Cliques {num(dia.cliquesCta)}</div>
                  <div><span style={{ color: COR.formularios }}>●</span> Formulários {num(dia.formularios)}</div>
                  {mostrarAnterior && (
                    <div style={{ color: 'var(--tx3)', marginTop: 4 }}>
                      Anterior: {num(anterior[foco!]!)} {ROTULO[metrica].toLowerCase()}
                    </div>
                  )}
                </>
              ) : (
                ACOES.map((a) => (
                  <div key={a.chave}><span style={{ color: a.cor }}>●</span> {a.rotulo} {num(dia[a.chave])}</div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
