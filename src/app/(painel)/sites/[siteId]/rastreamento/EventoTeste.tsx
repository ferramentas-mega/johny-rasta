'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Dispara um evento de teste a partir do navegador, contra o endpoint real.
 *
 * É uma chamada de verdade ao `/api/collect`, não uma simulação: se o endpoint
 * estiver fora do ar ou o identificador estiver errado, o erro aparece aqui.
 * O evento nasce marcado como teste e fica FORA de todas as métricas — serve
 * apenas para confirmar que o caminho de coleta está de pé.
 */
export function EventoTeste({ publicId }: { publicId: string }) {
  const [estado, setEstado] = useState<{ tipo: 'ocioso' | 'enviando' | 'ok' | 'erro'; texto?: string }>({ tipo: 'ocioso' });
  const router = useRouter();

  const enviar = async () => {
    setEstado({ tipo: 'enviando' });
    try {
      const resposta = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          site: publicId,
          tipo: 'page_view',
          uid: crypto.randomUUID(),
          visitante: `teste-${crypto.randomUUID()}`,
          caminho: '/verificacao-de-instalacao',
          ocorridoEm: new Date().toISOString(),
          teste: true,
        }),
      });

      if (resposta.status === 204) {
        setEstado({ tipo: 'ok', texto: 'Evento de teste recebido pelo servidor.' });
        router.refresh();
        return;
      }
      const corpo = await resposta.json().catch(() => ({}));
      setEstado({ tipo: 'erro', texto: corpo.erro ?? `O servidor respondeu ${resposta.status}.` });
    } catch (erro) {
      setEstado({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Falha de rede.' });
    }
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <button
        type="button"
        onClick={enviar}
        disabled={estado.tipo === 'enviando'}
        style={{
          cursor: estado.tipo === 'enviando' ? 'progress' : 'pointer',
          background: 'var(--elev)',
          border: '1px solid var(--bd)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: 'var(--tx)',
        }}
      >
        {estado.tipo === 'enviando' ? 'Enviando…' : 'Enviar evento de teste'}
      </button>
      {estado.texto && (
        <span
          role="status"
          style={{ fontSize: 12.5, color: estado.tipo === 'ok' ? 'var(--ok-tx)' : 'var(--neg)' }}
        >
          {estado.texto}
        </span>
      )}
    </div>
  );
}
