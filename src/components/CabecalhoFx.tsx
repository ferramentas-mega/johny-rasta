'use client';

import { ChuvaMatrix } from './ChuvaMatrix';

/**
 * Chuva Matrix do cabeçalho.
 *
 * Casca fina sobre `ChuvaMatrix`, mantida porque o nome já é usado nas telas.
 * O motor mora lá, num lugar só.
 */
export function CabecalhoFx() {
  return <ChuvaMatrix variante="cabecalho" />;
}
