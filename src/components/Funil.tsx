import { num, pct } from '@/lib/formato';
import type { FunilDeLeads } from '@/server/metrics/queries';

/**
 * Funil da qualidade dos leads.
 *
 * Adaptado de um componente pronto (Tailwind + Recharts). O que veio de lá é a
 * ideia do desenho: trapézios empilhados, largura proporcional ao valor. O que
 * mudou, e por que:
 *
 * 1. **Não calcula número.** As etapas chegam prontas de
 *    `getFunilDeLeads`. O original recebia um array cru e derivava percentuais
 *    dentro do próprio componente — que é exatamente o caminho para duas telas
 *    discordarem sobre o mesmo indicador.
 * 2. **É SVG estático, no servidor.** Não há interação: um funil de quatro
 *    etapas não precisa de estado, e um componente cliente aqui adiaria a
 *    primeira pintura para trazer zero comportamento novo.
 * 3. **Recharts ficou fora.** 400 KB por quatro trapézios que a fórmula de um
 *    polígono resolve em três linhas.
 * 4. **Cada etapa diz o que é.** O original rotulava "Leads", "Qualificados",
 *    "Fechados" sem definição. Aqui o texto de cada barra é a definição da
 *    consulta, porque a pergunta que aparece olhando um funil é sempre "o que
 *    exatamente entrou nesta faixa?".
 *
 * A largura é proporcional à PRIMEIRA etapa, não à anterior. Proporcional à
 * anterior, toda etapa que retém metade desenha a mesma queda — e um funil em
 * que 50%→50%→50% tem o mesmo formato que 90%→90%→90% não informa nada.
 */

const LARGURA = 720;
const ALTURA_ETAPA = 62;
const ESPACO = 6;
/** Largura mínima visível de uma etapa não-zero, para ela não sumir. */
const MINIMO = 26;

/**
 * Quantas camadas por etapa.
 *
 * Adaptado de um componente pronto (Tailwind + shadcn + `motion`), do qual
 * aproveitei a IDEIA — borda curva, camadas concêntricas, realce ao apontar — e
 * não o código: as classes dele (`text-foreground`, `bg-foreground`) dependem de
 * um Tailwind que este projeto não tem, e instalar Tailwind, shadcn e uma
 * biblioteca de animação para ganhar um gráfico trocaria o sistema visual
 * inteiro. Aqui sai em SVG com os tokens do tema, sem dependência nova, e
 * continua sendo componente de SERVIDOR: o realce é `:hover` em CSS, e não
 * estado em JavaScript.
 */
const CAMADAS = 3;

/**
 * Lados curvos, com a curva presa na horizontal nas duas pontas.
 *
 * O trapézio reto liga os dois pontos por uma diagonal; a curva sai plana de
 * cima, desce no meio e chega plana embaixo. É o que faz o desenho parecer um
 * funil em vez de uma pilha de retângulos cortados — e não muda número nenhum:
 * a meia-largura de cada ponta continua sendo a mesma que o trapézio usava.
 */
function ladosCurvos(topo: number, baixo: number, centro: number, altura: number): string {
  // 0,3 e não 0,55: com etapas de valores próximos a curva forte vira uma
  // "asa" no degrau grande — testei, e ficou pior que o trapézio reto. Aqui ela
  // arredonda a queda sem inventar forma onde a queda é pequena.
  const curva = altura * 0.3;
  const esquerda =
    `M ${centro - topo} 0 ` +
    `C ${centro - topo} ${curva}, ${centro - baixo} ${altura - curva}, ${centro - baixo} ${altura}`;
  const direita =
    `L ${centro + baixo} ${altura} ` +
    `C ${centro + baixo} ${altura - curva}, ${centro + topo} ${curva}, ${centro + topo} 0`;
  return `${esquerda} ${direita} Z`;
}

export function Funil({ funil }: { funil: FunilDeLeads }) {
  const base = funil.etapas[0]?.sessoes ?? 0;
  const altura = funil.etapas.length * (ALTURA_ETAPA + ESPACO) - ESPACO;

  /** Meia-largura da etapa, em pixels, medida contra a primeira. */
  const meia = (valor: number) => {
    if (base <= 0) return MINIMO / 2;
    const cheia = Math.max((valor / base) * LARGURA, valor > 0 ? MINIMO : 2);
    return cheia / 2;
  };

  const centro = LARGURA / 2;

  return (
    <div>
      {/* Sem base de cálculo não há funil: largura proporcional a zero é uma
          conta que não existe. Dizer isso é melhor que desenhar quatro barras
          vazias, que quem olha lê como "medimos e deu zero". */}
      {base <= 0 ? (
        <p style={{ fontSize: 13, color: 'var(--tx2)', padding: '18px 0' }}>
          Sem sessões no período. Sem base de cálculo, o funil não tem o que comparar.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <svg
            viewBox={`0 0 ${LARGURA} ${altura}`}
            width="100%"
            style={{ display: 'block', minWidth: 320 }}
            role="img"
            aria-label={`Funil de ${funil.etapas.map((e) => `${e.rotulo}: ${e.sessoes}`).join('; ')}`}
          >
            {funil.etapas.map((etapa, i) => {
              const proxima = funil.etapas[i + 1];
              // A etapa inteira é transladada pelo `<g>`; por isso os textos
              // abaixo usam coordenadas locais, sem somar `y` de novo.
              const y = i * (ALTURA_ETAPA + ESPACO);
              const topo = meia(etapa.sessoes);
              // O rodapé de uma etapa encosta no topo da seguinte: é a
              // inclinação que mostra a queda. A última desce reta.
              const baixo = proxima ? meia(proxima.sessoes) : topo;

              // Opacidade decrescente: a primeira etapa é a mais clara porque é
              // a maior, e a cor não codifica estado nenhum aqui — só ordem.
              //
              // O piso não é decoração defensiva: são quatro etapas hoje, e na
              // sexta a conta chega a 0,05 — uma etapa que existe, tem número e
              // não se vê. Quem acrescentasse a etapa veria o número aparecer e
              // o trapézio não, sem erro nenhum para investigar.
              const opacidade = Math.max(0.12, 0.5 - i * 0.09);

              // Camadas concêntricas: a de fora é a maior e a mais apagada, e
              // cada uma seguinte encolhe e escurece. É o que dá profundidade
              // sem usar sombra — sombra sobre fundo escuro não aparece.
              const camadas = Array.from({ length: CAMADAS }, (_, c) => {
                // Passo pequeno de propósito: com 0,3 as camadas apareciam
                // como faixas verticais escuras nas bordas, e não como
                // profundidade. O efeito tem de ser percebido sem ser notado.
                const escala = 1 - (c / CAMADAS) * 0.1;
                return {
                  d: ladosCurvos(topo * escala, baixo * escala, centro, ALTURA_ETAPA),
                  opacidade: opacidade * (0.7 + (c / Math.max(CAMADAS - 1, 1)) * 0.3),
                };
              });

              return (
                <g key={etapa.chave} className="funil-etapa" transform={`translate(0 ${y})`}>
                  {camadas.map((camada, c) => (
                    <path
                      key={c}
                      d={camada.d}
                      fill="var(--gold)"
                      fillOpacity={camada.opacidade}
                      // Só a camada de fora recebe contorno: repetir o traço em
                      // todas empastaria o desenho numa mancha sólida.
                      stroke={c === 0 ? 'var(--gold)' : 'none'}
                      strokeOpacity={0.55}
                      style={{ animationDelay: `${i * 90}ms` }}
                      className="funil-camada"
                    />
                  ))}
                  <text
                    x={centro}
                    y={25}
                    textAnchor="middle"
                    className="mono"
                    style={{ fontSize: 17, fill: 'var(--tx)' }}
                  >
                    {num(etapa.sessoes)}
                  </text>
                  <text
                    x={centro}
                    y={43}
                    textAnchor="middle"
                    style={{ fontSize: 12, fill: 'var(--tx2)' }}
                  >
                    {etapa.rotulo}
                  </text>
                  {/* A proporção contra a primeira etapa, fora do trapézio: numa
                      etapa estreita ela não caberia dentro. */}
                  {i > 0 && (
                    <text
                      x={LARGURA - 14}
                      y={36}
                      textAnchor="end"
                      className="mono"
                      style={{ fontSize: 11.5, fill: 'var(--tx3)' }}
                    >
                      {pct(etapa.sessoes / base)} das sessões
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* As definições ficam em texto, e não em `title`: uma dica que só aparece
          ao passar o mouse não existe para quem está no celular. */}
      <dl style={{ margin: '14px 0 0', display: 'grid', gap: 8 }}>
        {funil.etapas.map((etapa) => (
          <div key={etapa.chave} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <dt
              className="mono"
              style={{ fontSize: 11, color: 'var(--tx3)', minWidth: 150, letterSpacing: '.02em' }}
            >
              {etapa.rotulo.toUpperCase()}
            </dt>
            <dd style={{ margin: 0, fontSize: 12, color: 'var(--tx2)', flex: '1 1 260px' }}>
              {etapa.definicao}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Os números que NÃO cabem no funil, e que sem isto desapareceriam.
 *
 * Um funil medido por sessão não tem onde pôr um envio que não teve sessão, nem
 * distingue contato que voltou de contato novo. Se esses dois números ficassem
 * de fora, a última etapa seria lida como "todo o resto se perdeu" — e parte do
 * "resto" é cliente conhecido enviando de novo, que é o oposto de perda.
 */
export function ForaDoFunil({ funil }: { funil: FunilDeLeads }) {
  const itens: { rotulo: string; valor: string; explicacao: string }[] = [
    {
      rotulo: 'Contatos distintos',
      valor: num(funil.leadsDistintos),
      explicacao:
        'Pessoas diferentes por trás dos envios do período. Duas sessões da mesma pessoa contam uma vez.',
    },
    {
      rotulo: 'Com e-mail e telefone',
      valor: `${num(funil.leadsComOsDoisContatos)} de ${num(funil.leadsDistintos)}`,
      explicacao:
        'Contatos com os dois caminhos abertos. É o que diz se vale pedir o segundo campo no formulário.',
    },
    {
      rotulo: 'Já conhecidos',
      valor: num(funil.enviosDeContatoConhecido),
      explicacao:
        'Envios de quem o site já tinha registrado antes deste período. Não é perda: é retorno.',
    },
    {
      rotulo: 'Sem sessão',
      valor: num(funil.enviosSemSessao),
      explicacao:
        'Envios que chegaram sem identificação de visita — bloqueador de analytics, consentimento negado ou coletor fora do ar. O lead vale; a origem é que se perdeu.',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gap: 12,
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        marginTop: 4,
      }}
    >
      {itens.map((item) => (
        <div
          key={item.rotulo}
          style={{
            border: '1px solid var(--bd)',
            borderRadius: 10,
            background: 'var(--card)',
            padding: '12px 14px',
          }}
        >
          <div className="mono" style={{ fontSize: 19, color: 'var(--tx)' }}>
            {item.valor}
          </div>
          <div style={{ fontSize: 12, color: 'var(--tx)', marginTop: 2 }}>{item.rotulo}</div>
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: '6px 0 0', lineHeight: 1.45 }}>
            {item.explicacao}
          </p>
        </div>
      ))}
    </div>
  );
}
