import { separarCorrecoes, maiorEconomia, type Correcao } from '@/lib/correcoes';
import { duracaoMs, num } from '@/lib/formato';

/**
 * As correções elegíveis, uma dobra por (URL, dispositivo).
 *
 * É `<details>` e não estado em JavaScript: são quatro categorias de auditoria
 * por análise e pode haver muitas páginas monitoradas, então abrir tudo de uma
 * vez daria uma tela impossível de ler — e um componente cliente aqui adiaria a
 * primeira pintura para trazer um comportamento que o HTML já tem.
 *
 * O resumo da dobra mostra a MAIOR economia estimada, nunca a soma. Ver
 * `src/lib/correcoes.ts`: as estimativas do Lighthouse são por correção
 * isolada, contra a mesma execução, e somá-las produz um número grande,
 * convincente e falso.
 */

export type AnaliseParaCorrecoes = {
  url: string;
  dispositivo: string;
  auditorias: unknown;
};

function Linha({ correcao }: { correcao: Correcao }) {
  return (
    <li
      style={{
        display: 'flex',
        gap: 12,
        flexWrap: 'wrap',
        alignItems: 'baseline',
        padding: '8px 0',
        borderTop: '1px solid var(--bd)',
      }}
    >
      <span style={{ flex: '1 1 260px', fontSize: 12.5, color: 'var(--tx)' }}>
        {correcao.titulo}
        {correcao.valorExibido && (
          <span className="mono" style={{ color: 'var(--tx3)', fontSize: 11.5 }}>
            {' · '}
            {correcao.valorExibido}
          </span>
        )}
      </span>
      {/* Sem estimativa continua na lista e diz que não tem. Ausência de
          estimativa não é economia zero — pode ser a correção mais importante
          da página, só não quantificada. */}
      {correcao.economiaMs === null ? (
        <span style={{ fontSize: 11, color: 'var(--tx3)' }}>sem estimativa</span>
      ) : (
        <span className="mono" style={{ fontSize: 12.5, color: 'var(--gold)' }}>
          −{duracaoMs(correcao.economiaMs)}
        </span>
      )}
    </li>
  );
}

export function Correcoes({ analises }: { analises: AnaliseParaCorrecoes[] }) {
  const grupos = analises
    .map((a) => ({ ...a, ...separarCorrecoes(a.auditorias) }))
    .filter((g) => g.correcoes.length > 0 || g.informativas > 0);

  if (grupos.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6 }}>
        Nenhuma análise com auditorias guardadas ainda. As correções aparecem aqui depois da
        primeira análise técnica desta página.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {grupos.map((g) => {
        const maior = maiorEconomia(g.correcoes);
        return (
          <details
            key={`${g.url}|${g.dispositivo}`}
            style={{
              border: '1px solid var(--bd)',
              borderRadius: 10,
              background: 'var(--card)',
              padding: '10px 14px',
            }}
          >
            <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--tx)' }}>
              <span className="mono" style={{ fontSize: 12 }}>
                {g.url.replace(/^https?:\/\/[^/]+/, '') || '/'}
              </span>
              <span style={{ color: 'var(--tx3)' }}>
                {' · '}
                {g.dispositivo === 'mobile' ? 'celular' : 'computador'}
                {' · '}
                {num(g.correcoes.length)} correção(ões)
              </span>
              {maior !== null && (
                <span className="mono" style={{ color: 'var(--gold)', fontSize: 12 }}>
                  {' · '}maior estimativa −{duracaoMs(maior)}
                </span>
              )}
            </summary>

            {g.correcoes.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--tx2)', margin: '10px 0 0' }}>
                Nenhuma auditoria reprovada nesta medição.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0 }}>
                {g.correcoes.map((c) => (
                  <Linha key={c.id} correcao={c} />
                ))}
              </ul>
            )}

            {/* Dizer quantas ficaram de fora, e por quê. Descartar em silêncio
                faria a lista parecer completa quando não é. */}
            {g.informativas > 0 && (
              <p style={{ fontSize: 11, color: 'var(--tx3)', margin: '10px 0 0', lineHeight: 1.5 }}>
                Outras {num(g.informativas)} auditoria(s) desta medição são informativas: o
                Lighthouse devolve o dado e não emite veredito, então não há correção a decidir.
              </p>
            )}
          </details>
        );
      })}
    </div>
  );
}
