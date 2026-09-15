/**
 * Estilo dos botões das telas de erro.
 *
 * Mora num módulo **sem** `'use client'` de propósito. Estava exportado de
 * `TelaDeErro.tsx`, que é cliente, e o build quebrou: `not-found.tsx` é um
 * server component, e chamar uma função de um módulo cliente a partir do
 * servidor não é possível — o Next só sabe renderizar componentes daquele lado,
 * não executar funções soltas.
 *
 * Num módulo neutro, os dois lados importam igual.
 */
export const estiloAcao = (primaria: boolean) =>
  ({
    cursor: 'pointer',
    background: primaria ? 'var(--gold)' : 'var(--elev)',
    color: primaria ? 'var(--on-gold)' : 'var(--tx2)',
    border: primaria ? 'none' : '1px solid var(--bd)',
    borderRadius: 10,
    padding: '11px 16px',
    fontWeight: primaria ? 600 : 500,
    fontSize: 13.5,
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
  }) as const;
