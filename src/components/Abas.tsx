'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { SeletorPeriodo } from '@/components/filtros';
import { parsePeriodParams } from '@/lib/periodo';

/**
 * Abas internas do site. Como o menu lateral, a aba ativa vem do pathname —
 * nunca de um estado paralelo.
 *
 * v2: os chips de período moram AQUI, à direita, em todas as abas. Antes só
 * Desempenho e Comportamento os tinham; quem trocava para Qualidade perdia o
 * controle e, ao voltar, o período. Nas abas que não recortam por período
 * (Rastreamento, Configuração) o chip só preserva a escolha na URL — é a
 * mesma query que os links das abas já propagam.
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
  const periodo = parsePeriodParams({
    periodo: searchParams.get('periodo'),
    de: searchParams.get('de'),
    ate: searchParams.get('ate'),
  });

  return (
    <div className="abas-linha">
      <nav
        aria-label="Seções do site"
        style={{ display: 'flex', gap: 4, minWidth: 'max-content' }}
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
      <div className="abas-direita">
        <SeletorPeriodo atual={periodo.key} />
      </div>
    </div>
  );
}
