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
              const y = i * (ALTURA_ETAPA + ESPACO);
              const topo = meia(etapa.sessoes);
              // O rodapé de uma etapa encosta no topo da seguinte: é a
              // inclinação que mostra a queda. A última desce reta.
              const baixo = proxima ? meia(proxima.sessoes) : topo;

              const pontos = [
                `${centro - topo},${y}`,
                `${centro + topo},${y}`,
                `${centro + baixo},${y + ALTURA_ETAPA}`,
                `${centro - baixo},${y + ALTURA_ETAPA}`,
              ].join(' ');

              // Opacidade decrescente: a primeira etapa é a mais clara porque é
              // a maior, e a cor não codifica estado nenhum aqui — só ordem.
              const opacidade = 0.5 - i * 0.09;

              return (
                <g key={etapa.chave}>
                  <polygon
                    points={pontos}
                    fill="var(--gold)"
                    fillOpacity={opacidade}
                    stroke="var(--gold)"
                    strokeOpacity={0.55}
                  />
                  <text
                    x={centro}
                    y={y + 25}
                    textAnchor="middle"
                    className="mono"
                    style={{ fontSize: 17, fill: 'var(--tx)' }}
                  >
                    {num(etapa.sessoes)}
                  </text>
                  <text
                    x={centro}
                    y={y + 43}
                    textAnchor="middle"
                    style={{ fontSize: 12, fill: 'var(--tx2)' }}
                  >
                    {etapa.rotulo}
                  </text>
                  {/* A proporção contra a primeira etapa, fora do trapézio: numa
                      etapa estreita ela não caberia dentro. */}
                  {i > 0 && (
                    <text
                      x={LARGURA - 4}
                      y={y + 36}
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
