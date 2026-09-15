import type { ReactNode } from 'react';

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
  render: (linha: T) => ReactNode;
  /** Valor do rodapé de totais. Ausente = célula vazia. */
  total?: (linhas: T[]) => ReactNode;
};

export function Tabela<T>({
  colunas,
  linhas,
  vazio = 'Nenhum registro no período.',
  rotuloTotal = 'Total',
}: {
  colunas: Coluna<T>[];
  linhas: T[];
  vazio?: string;
  rotuloTotal?: string;
}) {
  const temTotais = colunas.some((c) => c.total);

  if (linhas.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--tx2)', padding: '18px 2px' }}>{vazio}</p>
    );
  }

  const celula = (c: Coluna<T>): React.CSSProperties => ({
    padding: '11px 10px',
    textAlign: c.alinhamento === 'direita' ? 'right' : 'left',
    fontSize: 13,
    whiteSpace: 'nowrap',
  });

  return (
    <div data-testid="rolagem-tabela" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                title={c.ajuda}
                style={{
                  ...celula(c),
                  fontSize: 11.5,
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
            <tr key={i} style={{ borderBottom: '1px solid var(--rowbd)' }}>
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
    : tom === 'neg' ? 'rgba(255, 133, 133, 0.14)'
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
        borderRadius: 999,
        background: fundo,
        color: cor,
        fontSize: 11,
        whiteSpace: 'nowrap',
      }}
    >
      {texto}
    </span>
  );
}
