import type { ReactNode } from 'react';
import { EstadoVazio } from '@/components/EstadoVazio';
import { CabecalhoOrdenavel } from '@/components/CabecalhoOrdenavel';
import { ordenar, type Ordem } from '@/lib/ordenacao';

/**
 * Tabela de dados.
 *
 * Suporta uma linha de TOTAIS. Isso não é enfeite: as tabelas por página e por
 * botão do protótipo somavam valores diferentes (169 contra 207) sem que a tela
 * oferecesse qualquer meio de perceber. Com os totais visíveis, quem lê confere.
 *
 * Rola horizontalmente em telas estreitas, dentro do próprio contêiner — a
 * página nunca ganha barra de rolagem lateral.
 *
 * v2: colunas com `valor` são ORDENÁVEIS quando a tabela recebe `ordenacao`; a
 * ordem vive na URL (`lib/ordenacao.ts`) e o cabeçalho ativo fica verde, com a
 * seta do sentido. Colunas com `barra` desenham, sob o número, uma barra
 * proporcional ao MAIOR valor da coluna — a régua é a própria coluna, não
 * um total inventado. Ordenar e desenhar barras não são contas: o número
 * continua vindo da consulta.
 */

export type Coluna<T> = {
  chave: string;
  titulo: string;
  /** Escopo do que a coluna conta. Vira `title` no cabeçalho. */
  ajuda?: string;
  alinhamento?: 'esquerda' | 'direita';
  mono?: boolean;
  /**
   * Permite que o conteúdo QUEBRE em várias linhas.
   *
   * O padrão da tabela é `nowrap`, e isso está certo para o que ela quase sempre
   * carrega: número, data, caminho e identificador não devem quebrar no meio.
   * Mas uma coluna com FRASE — a ação sugerida de um botão mal marcado, por
   * exemplo — some para fora da tabela em vez de quebrar, e o texto é cortado
   * sem reticências, sem barra de rolagem visível, sem pista de que há mais.
   *
   * Opt-in em vez de padrão: inverter o padrão faria toda tabela existente
   * reflowar, e as que existem dependem de não quebrar.
   */
  quebraLinha?: boolean;
  render: (linha: T) => ReactNode;
  /** Valor do rodapé de totais. Ausente = célula vazia. */
  total?: (linhas: T[]) => ReactNode;
  /**
   * Valor cru para ORDENAR. Presente = a coluna é ordenável (quando a tabela
   * tem `ordenacao`). `null` é "indisponível" e vai sempre para o fim.
   */
  valor?: (linha: T) => number | string | null;
  /** Valor da barra proporcional desenhada sob o conteúdo da célula. */
  barra?: (linha: T) => number;
  /** Cor da barra, na paleta de dados. Padrão: a primeira. */
  corDaBarra?: 'c1' | 'c2' | 'c3' | 'c4' | 'c5';
};

export function Tabela<T>({
  colunas,
  linhas,
  vazio = 'Nenhum registro no período.',
  rotuloTotal = 'Total',
  chave,
  ordenacao,
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  /**
   * Texto do vazio, ou um `EstadoVazio` montado pela tela.
   *
   * Aceita `ReactNode` para que as dez chamadas que já passam uma frase
   * continuem valendo — elas ganham ícone e composição sem mudar nada — e para
   * que a tela que TEM um próximo passo real possa passar um com ação.
   */
  vazio?: ReactNode;
  rotuloTotal?: string;
  /**
   * Chave estável da linha. Sem ela a chave é a posição — e uma linha com
   * formulário (situação de tarefa) que muda de posição depois de uma Action
   * REMONTA, levando junto a confirmação que a própria Action devolveu. É a
   * armadilha da remontagem por `key` do CLAUDE.md, aplicada à tabela.
   */
  chave?: (linha: T) => string;
  /**
   * Liga a ordenação pelo cabeçalho. `parametro` é o nome na URL (cada tabela
   * da página tem o seu); `atual` é a ordem lida de lá pela tela.
   */
  ordenacao?: { parametro: string; atual: Ordem };
}) {
  const temTotais = colunas.some((c) => c.total);

  if (linhas.length === 0) {
    // String continua funcionando: vira o título de um estado vazio composto.
    // `vazio=""` (usado onde o painel só aparece se houver linha) continua
    // significando "não desenhe nada".
    if (!vazio) return null;
    return typeof vazio === 'string' ? <EstadoVazio titulo={vazio} /> : <>{vazio}</>;
  }

  const colunaAtiva = ordenacao ? colunas.find((c) => c.chave === ordenacao.atual.coluna && c.valor) : undefined;
  const ordenadas = ordenacao && colunaAtiva ? ordenar(linhas, colunaAtiva.valor!, ordenacao.atual.direcao) : linhas;

  // A régua de cada barra é o maior valor da PRÓPRIA coluna.
  const maiores = new Map<string, number>();
  for (const c of colunas) {
    if (c.barra) maiores.set(c.chave, Math.max(0, ...linhas.map((l) => c.barra!(l))));
  }

  const celula = (c: Coluna<T>): React.CSSProperties => ({
    padding: '11px 10px',
    textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
    fontSize: 'var(--tipo-corpo)',
    whiteSpace: c.quebraLinha ? 'normal' : 'nowrap',
    // Sem um teto, a coluna que quebra ocupa toda a sobra e espreme as demais.
    ...(c.quebraLinha ? { maxWidth: 340 } : {}),
    // Número alinhado à direita em algarismos tabulares: as colunas de dígitos
    // formam coluna de verdade, e o olho compara sem ler.
    ...(c.alinhamento === 'direita' ? { fontVariantNumeric: 'tabular-nums' } : {}),
  });

  return (
    <div data-testid="rolagem-tabela" style={{ overflowX: 'auto' }}>
      {/* Cabeçalho fixo só a partir de 12 linhas: em tabela curta ele não tem
          o que resolver, e `position: sticky` num `thead` que nunca sai da
          vista é custo de pintura sem ganho. */}
      <table
        className={linhas.length >= 12 ? 'tabela-fixa' : undefined}
        style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}
      >
        <thead>
          <tr>
            {colunas.map((c) => {
              const ordenavel = Boolean(ordenacao && c.valor);
              const ativa = ordenavel && ordenacao!.atual.coluna === c.chave;
              return (
                <th
                  key={c.chave}
                  scope="col"
                  title={c.ajuda}
                  aria-sort={ativa ? (ordenacao!.atual.direcao === 'desc' ? 'descending' : 'ascending') : undefined}
                  style={{
                    ...celula(c),
                    fontSize: 'var(--tipo-legenda)',
                    fontWeight: 500,
                    color: 'var(--tx2)',
                    borderBottom: '1px solid var(--bd)',
                    cursor: c.ajuda && !ordenavel ? 'help' : undefined,
                  }}
                >
                  {ordenavel ? (
                    <CabecalhoOrdenavel
                      parametro={ordenacao!.parametro}
                      coluna={c.chave}
                      titulo={c.titulo}
                      atual={ordenacao!.atual}
                      tipo={c.alinhamento === 'direita' ? 'numero' : 'texto'}
                    />
                  ) : (
                    c.titulo
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((linha, i) => (
            <tr key={chave ? chave(linha) : i} className="tabela-linha" style={{ borderBottom: '1px solid var(--rowbd)' }}>
              {colunas.map((c) => {
                const maior = maiores.get(c.chave);
                const largura = c.barra && maior && maior > 0 ? (c.barra(linha) / maior) * 100 : null;
                return (
                  <td key={c.chave} className={c.mono ? 'mono' : undefined} style={celula(c)}>
                    {largura === null ? (
                      c.render(linha)
                    ) : (
                      <span className="celula-com-barra">
                        <span>{c.render(linha)}</span>
                        <span className="celula-barra" aria-hidden="true">
                          <i style={{ width: `${largura}%`, background: `var(--${c.corDaBarra ?? 'c1'})` }} />
                        </span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {temTotais && (
          <tfoot>
            <tr style={{ borderTop: '1px solid var(--bd)' }}>
              {colunas.map((c, i) => (
                <td
                  key={c.chave}
                  className={c.mono ? 'mono' : undefined}
                  style={{ ...celula(c), fontWeight: 600, color: 'var(--tx)' }}
                >
                  {c.total ? c.total(linhas) : i === 0 ? rotuloTotal : null}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export type TomDeEtiqueta = 'soft' | 'ok' | 'warn' | 'neg' | 'c1' | 'c2' | 'c3' | 'c4';

/**
 * `neg` entrou com o estado por recurso: "Erro identificado" é diferente de
 * "aguardando", e pintar os dois de amarelo esconderia justamente o que exige
 * ação agora.
 *
 * `c1`..`c4` são a paleta de DADOS: a etiqueta da ação (WhatsApp, abertura de
 * formulário, telefone, e-mail) usa a mesma cor da pilha do gráfico, para que a
 * tabela e o desenho falem a mesma língua.
 */
export function Etiqueta({ texto, tom = 'soft' }: { texto: string; tom?: TomDeEtiqueta }) {
  const fundo =
    tom === 'ok' ? 'var(--ok-bg)'
    : tom === 'warn' ? 'var(--warn-bg)'
    : tom === 'neg' ? 'var(--neg-bg)'
    : tom === 'soft' ? 'var(--soft-bg)'
    : `var(--f${tom.slice(1)})`;
  const cor =
    tom === 'ok' ? 'var(--ok-tx)'
    : tom === 'warn' ? 'var(--warn-tx)'
    : tom === 'neg' ? 'var(--neg)'
    : tom === 'soft' ? 'var(--soft-tx)'
    : `var(--${tom})`;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 9px',
        borderRadius: 'var(--raio-pilula)',
        background: fundo,
        color: cor,
        fontSize: 'var(--tipo-legenda)',
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}

/** A cor de dados de cada ação de clique — a mesma nas etiquetas e nas pilhas do gráfico. */
export const TOM_DA_ACAO: Record<string, TomDeEtiqueta> = {
  whatsapp: 'c1',
  form_open: 'c2',
  phone: 'c3',
  email: 'c4',
};
