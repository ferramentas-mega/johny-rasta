import type { ReactNode } from 'react';
import { EstadoVazio } from '@/components/EstadoVazio';

/**
 * Tabela de dados.
 *
 * Suporta uma linha de TOTAIS. Isso não é enfeite: as tabelas por página e por
 * botão do protótipo somavam valores diferentes (169 contra 207) sem que a tela
 * oferecesse qualquer meio de perceber. Com os totais visíveis, quem lê confere.
 *
 * Rola horizontalmente em telas estreitas, dentro do próprio contêiner — a
 * página nunca ganha barra de rolagem lateral.
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
};

export function Tabela<T>({
  colunas,
  linhas,
  vazio = 'Nenhum registro no período.',
  rotuloTotal = 'Total',
  chave,
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
}) {
  const temTotais = colunas.some((c) => c.total);

  if (linhas.length === 0) {
    // String continua funcionando: vira o título de um estado vazio composto.
    // `vazio=""` (usado onde o painel só aparece se houver linha) continua
    // significando "não desenhe nada".
    if (!vazio) return null;
    return typeof vazio === 'string' ? <EstadoVazio titulo={vazio} /> : <>{vazio}</>;
  }

  const celula = (c: Coluna<T>): React.CSSProperties => ({
    padding: '11px 10px',
    textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
    fontSize: 'var(--tipo-corpo)',
    whiteSpace: c.quebraLinha ? 'normal' : 'nowrap',
    // Sem um teto, a coluna que quebra ocupa toda a sobra e espreme as demais.
    ...(c.quebraLinha ? { maxWidth: 340 } : {}),
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
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                title={c.ajuda}
                style={{
                  ...celula(c),
                  fontSize: 'var(--tipo-legenda)',
                  fontWeight: 500,
                  color: 'var(--tx2)',
                  borderBottom: '1px solid var(--bd)',
                  cursor: c.ajuda ? 'help' : undefined,
                }}
              >
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={chave ? chave(linha) : i} className="tabela-linha" style={{ borderBottom: '1px solid var(--rowbd)' }}>
              {colunas.map((c) => (
                <td key={c.chave} className={c.mono ? 'mono' : undefined} style={celula(c)}>
                  {c.render(linha)}
                </td>
              ))}
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

/**
 * `neg` entrou com o estado por recurso: "Erro identificado" é diferente de
 * "aguardando", e pintar os dois de amarelo esconderia justamente o que exige
 * ação agora.
 */
export function Etiqueta({ texto, tom = 'soft' }: { texto: string; tom?: 'soft' | 'ok' | 'warn' | 'neg' }) {
  const fundo =
    tom === 'ok' ? 'var(--ok-bg)'
    : tom === 'warn' ? 'var(--warn-bg)'
    : tom === 'neg' ? 'var(--neg-bg)'
    : 'var(--soft-bg)';
  const cor =
    tom === 'ok' ? 'var(--ok-tx)'
    : tom === 'warn' ? 'var(--warn-tx)'
    : tom === 'neg' ? 'var(--neg)'
    : 'var(--soft-tx)';
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
