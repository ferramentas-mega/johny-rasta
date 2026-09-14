'use client';

import { useActionState } from 'react';
import { Marca } from '@/components/Marca';
import { entrar, type EstadoLogin } from './acoes';

const ESTADO_INICIAL: EstadoLogin = {};

export default function PaginaEntrar() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);

  const campo = {
    width: '100%',
    background: 'var(--elev)',
    border: '1px solid var(--bd)',
    borderRadius: 8,
    padding: '11px 12px',
    fontSize: 14,
    color: 'var(--tx)',
  } as const;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--header-bg)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 380 }}>
        <Marca />
        <form
          action={acao}
          style={{
            marginTop: 18,
            border: '1px solid var(--bd)',
            borderRadius: 12,
            background: 'var(--card)',
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <h1 style={{ fontSize: 17, fontWeight: 600 }}>Entrar no painel</h1>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
            E-mail
            <input name="email" type="email" autoComplete="username" required autoFocus style={campo} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
            Senha
            <input name="senha" type="password" autoComplete="current-password" required style={campo} />
          </label>

          {estado.erro && (
            <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>
              {estado.erro}
            </p>
          )}

          <button
            type="submit"
            disabled={pendente}
            style={{
              cursor: pendente ? 'progress' : 'pointer',
              background: 'var(--gold)',
              color: 'var(--on-gold)',
              border: 'none',
              borderRadius: 8,
              padding: '11px 14px',
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {pendente ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
