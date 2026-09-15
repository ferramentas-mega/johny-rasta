'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Abas internas do site. Como o menu lateral, a aba ativa vem do pathname —
 * nunca de um estado paralelo.
 */
const ABAS = [
  { slug: 'desempenho', label: 'Desempenho' },
  { slug: 'comportamento', label: 'Comportamento' },
  { slug: 'qualidade', label: 'Qualidade técnica' },
  { slug: 'rastreamento', label: 'Rastreamento' },
] as const;

export function Abas({ siteId }: { siteId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const busca = searchParams.toString();

  return (
    <nav
      aria-label="Seções do site"
      style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--bd)', minWidth: 'max-content' }}
    >
      {ABAS.map((aba) => {
        const href = `/sites/${siteId}/${aba.slug}`;
        const on = pathname === href;
        return (
          <Link
            key={aba.slug}
            href={`${href}${busca ? `?${busca}` : ''}`}
            aria-current={on ? 'page' : undefined}
            style={{
              padding: '11px 14px',
              fontSize: 13.5,
              textDecoration: 'none',
              color: on ? 'var(--tx)' : 'var(--tx2)',
              borderBottom: `2px solid ${on ? 'var(--gold)' : 'transparent'}`,
              marginBottom: -1,
              fontWeight: on ? 600 : 400,
              whiteSpace: 'nowrap',
            }}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
