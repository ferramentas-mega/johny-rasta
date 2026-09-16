'use client';

import Link from 'next/link';
import { ETAPAS, type EtapaSlug, type SituacaoEtapa } from '@/lib/recursos';

/**
 * Indicador de progresso do assistente.
 *
 * Mostra a situação DERIVADA de cada etapa, não por onde o operador passou. Uma
 * etapa visitada e abandonada continua pendente, e uma que não se aplica diz
 * isso em vez de ficar pendente para sempre.
 *
 * Cada etapa é um link: voltar nunca perde o que já foi salvo, porque cada
 * etapa grava ao ser submetida — não existe rascunho em memória para perder.
 */
export function Passos({
  siteId,
  atual,
  situacao,
}: {
  siteId: string;
  atual: EtapaSlug;
  situacao: Record<EtapaSlug, SituacaoEtapa>;
}) {
  return (
    <nav aria-label="Etapas da configuração" style={{ overflowX: 'auto', scrollbarWidth: 'none' }}>
      <ol
        style={{
          listStyle: 'none',
          display: 'flex',
          gap: 6,
          minWidth: 'max-content',
          padding: '2px 0',
        }}
      >
        {ETAPAS.map((etapa) => {
          const s = situacao[etapa.slug];
          const on = etapa.slug === atual;
          const cor =
            s === 'concluida' ? 'var(--gold)'
            : s === 'nao_se_aplica' ? 'var(--tx3)'
            : 'var(--warn-tx)';

          return (
            <li key={etapa.slug}>
              <Link
                href={`/sites/${siteId}/configurar?etapa=${etapa.slug}`}
                aria-current={on ? 'step' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 'var(--raio-p)',
                  fontSize: 'var(--tipo-apoio)',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  color: on ? 'var(--tx)' : 'var(--tx2)',
                  background: on ? 'var(--gold-fill)' : 'transparent',
                  border: `1px solid ${on ? 'var(--bdc)' : 'var(--bd)'}`,
                }}
              >
                <span
                  className="mono"
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--tipo-micro)',
                    border: `1px solid ${cor}`,
                    color: cor,
                  }}
                >
                  {s === 'concluida' ? '✓' : s === 'nao_se_aplica' ? '–' : etapa.numero}
                </span>
                {etapa.titulo}
                {/* O símbolo acima é decorativo; a situação precisa existir em texto. */}
                <span className="apenas-leitor">
                  {s === 'concluida' ? ' (concluída)' : s === 'nao_se_aplica' ? ' (não se aplica)' : ' (pendente)'}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
