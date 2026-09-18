'use client';

/**
 * Imprimir / salvar como PDF. É o navegador que gera o PDF, com o CSS de
 * impressão de `theme.css`: nenhuma biblioteca, nenhum serviço externo, e o
 * documento é exatamente a tela que a pessoa está vendo.
 */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="mono nao-imprime"
      style={{
        cursor: 'pointer',
        fontSize: 'var(--tipo-legenda)',
        letterSpacing: 'var(--trilha-media)',
        padding: '8px 11px',
        borderRadius: 'var(--raio-p)',
        border: '1px solid var(--bd)',
        background: 'var(--elev)',
        color: 'var(--tx2)',
      }}
    >
      IMPRIMIR / PDF
    </button>
  );
}
