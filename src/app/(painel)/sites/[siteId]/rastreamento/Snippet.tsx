'use client';

import { useState } from 'react';

/** Bloco de código copiável. */
export function Snippet({ codigo, rotulo }: { codigo: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o código continua selecionável
      // na tela, então não há perda real de função.
      setCopiado(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{rotulo}</span>
        <button
          type="button"
          onClick={copiar}
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            fontSize: 11.5,
            padding: '5px 10px',
            borderRadius: 7,
            background: 'var(--elev)',
            border: '1px solid var(--bd)',
            color: copiado ? 'var(--gold)' : 'var(--tx2)',
          }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre
        className="mono"
        style={{
          margin: 0,
          padding: '12px 14px',
          borderRadius: 8,
          border: '1px solid var(--bd)',
          background: 'var(--bg)',
          color: 'var(--tx)',
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {codigo}
      </pre>
    </div>
  );
}
