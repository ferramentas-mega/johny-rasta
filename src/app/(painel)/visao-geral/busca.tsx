'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * Busca por cliente.
 *
 * O termo vai para a URL, e não só para o estado local, para que recarregar,
 * voltar e compartilhar o endereço preservem o filtro — como já acontece com
 * período e site no resto do painel.
 */
export function BuscaCarteira({ valor }: { valor: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [texto, setTexto] = useState(valor);

  function aplicar(novo: string) {
    const p = new URLSearchParams(params.toString());
    if (novo.trim()) p.set('q', novo.trim());
    else p.delete('q');
    router.push(`/visao-geral?${p.toString()}`);
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); aplicar(texto); }}
      style={{ display: 'flex', gap: 6 }}
    >
      <input
        type="search"
        name="q"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar cliente…"
        aria-label="Buscar cliente"
        style={{
          background: 'var(--elev)', border: '1px solid var(--bd)', borderRadius: 8,
          padding: '7px 10px', fontSize: 12.5, color: 'var(--tx)', width: 160,
        }}
      />
    </form>
  );
}
