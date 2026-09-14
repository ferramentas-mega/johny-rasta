'use client';

import { useEffect } from 'react';

/**
 * Tela de erro do painel.
 *
 * Existe para que uma falha de servidor — banco fora do ar, variável de conexão
 * errada — não vire a página branca de digest do Next, que não diz nada a
 * ninguém. Aqui o usuário entende o que aconteceu e onde procurar, sem que a
 * string de conexão apareça no navegador.
 */
export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[painel] erro de renderização:', error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          border: '1px solid var(--bd)',
          borderRadius: 12,
          background: 'var(--card)',
          padding: 24,
        }}
      >
        <p className="mono" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--warn-tx)' }}>
          ERRO NO SERVIDOR
        </p>
        <h1 style={{ fontSize: 18, fontWeight: 600, margin: '6px 0 10px' }}>
          Não foi possível carregar esta tela
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
          A causa mais comum é a conexão com o banco de dados: variável de ambiente ausente, senha
          incorreta, ou host inacessível a partir do servidor.
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.6, marginTop: 10 }}>
          O motivo exato está no log do servidor. Numa hospedagem, procure em{' '}
          <strong>Runtime Logs</strong>; rodando localmente, no terminal onde a aplicação subiu.
        </p>

        {error.digest && (
          <p className="mono" style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 14 }}>
            Identificador desta ocorrência: {error.digest}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: 'pointer',
              background: 'var(--gold)',
              color: 'var(--on-gold)',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 600,
              fontSize: 13.5,
            }}
          >
            Tentar de novo
          </button>
          <a
            href="/entrar"
            style={{
              background: 'var(--elev)',
              border: '1px solid var(--bd)',
              borderRadius: 8,
              padding: '10px 16px',
              fontSize: 13.5,
              color: 'var(--tx2)',
              textDecoration: 'none',
            }}
          >
            Voltar para o login
          </a>
        </div>
      </div>
    </main>
  );
}
