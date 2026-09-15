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
  // O assistente é uma aba, e não só um destino do cadastro: configuração
  // incompleta precisa ser retomável de dentro do site, a qualquer momento.
  { slug: 'configurar', label: 'Configuração' },
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
            // Como no menu lateral: o realce ao passar o mouse precisa de CSS.
            className="aba-site"
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
