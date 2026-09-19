'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { proximaOrdem, serializarOrdem, type Ordem } from '@/lib/ordenacao';

/**
 * Cabeçalho de coluna que ordena. É um LINK, não um botão com estado: a ordem
 * vive na URL (ver `lib/ordenacao.ts`), então recarregar e voltar preservam a
 * escolha, e o servidor devolve a tabela já ordenada — o HTML chega pronto.
 *
 * `aria-sort` no `<th>` fica por conta da tabela; aqui vai só o link, com o
 * sentido escrito no nome acessível ("ordenar por Sessões, decrescente").
 */
export function CabecalhoOrdenavel({
  parametro,
  coluna,
  titulo,
  atual,
  tipo,
}: {
  parametro: string;
  coluna: string;
  titulo: string;
  atual: Ordem;
  tipo: 'numero' | 'texto';
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ativa = atual.coluna === coluna;
  const proxima = proximaOrdem(atual, coluna, tipo);

  const params = new URLSearchParams(searchParams.toString());
  params.set(parametro, serializarOrdem(proxima));

  return (
    <Link
      href={`${pathname}?${params.toString()}`}
      className={`ordenar${ativa ? ' ordenar-ativa' : ''}`}
      // A seta é conteúdo gerado por CSS (`::after`, por `data-direcao`), de
      // propósito: assim o TEXTO do cabeçalho continua sendo só o título — as
      // provas que localizam a coluna pelo texto seguem valendo — e o nome
      // acessível vem do `aria-label`, nunca do desenho.
      data-direcao={ativa ? atual.direcao : undefined}
      aria-label={`Ordenar por ${titulo}, ${proxima.direcao === 'desc' ? 'decrescente' : 'crescente'}`}
      scroll={false}
    >
      {titulo}
    </Link>
  );
}
