'use client';

import { useEffect, useState } from 'react';

/**
 * Liga/desliga os efeitos e alterna o tema.
 *
 * As duas preferências vivem em data-attributes do <html> (aplicados antes da
 * primeira pintura pelo script do layout) e são persistidas em localStorage.
 * Desligar os efeitos é uma opção permanente, não apenas visual: o canvas
 * realmente para de desenhar.
 */
export function ControlesAparencia() {
  const [fx, setFx] = useState(false);
  const [tema, setTema] = useState<'escuro' | 'claro'>('escuro');

  // Lê o estado que o script inline já decidiu, em vez de assumir um padrão
  // que poderia divergir do que está pintado na tela.
  useEffect(() => {
    const root = document.documentElement;
    setFx(root.dataset.fx === 'on');
    setTema(root.dataset.tema === 'claro' ? 'claro' : 'escuro');
  }, []);

  const alternarFx = () => {
    const proximo = !fx;
    setFx(proximo);
    document.documentElement.dataset.fx = proximo ? 'on' : 'off';
    try {
      localStorage.setItem('painel:fx', proximo ? 'on' : 'off');
    } catch {
      /* navegação privativa: a preferência vale só nesta aba */
    }
  };

  const alternarTema = () => {
    const proximo = tema === 'escuro' ? 'claro' : 'escuro';
    setTema(proximo);
    document.documentElement.dataset.tema = proximo;
    try {
      localStorage.setItem('painel:tema', proximo);
    } catch {
      /* idem */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={alternarFx}
        aria-pressed={fx}
        title="Ativar ou desativar os efeitos decorativos"
        className="mono"
        style={{
          cursor: 'pointer',
          fontSize: 11,
          letterSpacing: '.06em',
          padding: '8px 11px',
          borderRadius: 8,
          background: 'var(--elev)',
          border: '1px solid var(--bd)',
          color: fx ? 'var(--gold)' : 'var(--tx3)',
        }}
      >
        {fx ? '>_ FX ON' : '>_ FX OFF'}
      </button>

      <button
        type="button"
        onClick={alternarTema}
        aria-label={tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        style={{
          display: 'flex',
          alignItems: 'center',
          flex: 'none',
          width: 64,
          height: 32,
          padding: 3,
          borderRadius: 999,
          cursor: 'pointer',
          background: 'var(--elev)',
          border: '1px solid var(--bd)',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            borderRadius: '50%',
            background: 'var(--gold)',
            color: 'var(--on-gold)',
            transform: tema === 'escuro' ? 'translateX(0)' : 'translateX(32px)',
            transition: 'transform 200ms',
          }}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tema === 'escuro' ? (
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            ) : (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </>
            )}
          </svg>
        </span>
      </button>
    </>
  );
}
