'use client';

import { useEffect, useRef } from 'react';

/**
 * Chuva Matrix do cabeçalho.
 *
 * Decorativa e contida: ocupa só a faixa direita do cabeçalho, some sob uma
 * máscara, não recebe eventos de ponteiro e não entra na árvore de
 * acessibilidade. Para de desenhar quando os efeitos estão desligados ou a aba
 * está em segundo plano — não fica queimando CPU numa aba esquecida.
 */
export function CabecalhoFx() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const CHARS = '01<>/[]{}#$%&*+=?ABCDEF'.split('');
    const TAMANHO = 14;
    let colunas: number[] = [];
    let largura = 0;
    let altura = 0;
    let raf = 0;

    const redimensionar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      largura = r.width;
      altura = r.height;
      canvas.width = Math.max(1, Math.floor(largura * dpr));
      canvas.height = Math.max(1, Math.floor(altura * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      colunas = new Array(Math.ceil(largura / TAMANHO)).fill(0).map((_, i) => -((i * 37) % 60));
      ctx.clearRect(0, 0, largura, altura);
    };

    const passo = () => {
      raf = requestAnimationFrame(passo);
      const root = document.documentElement;
      if (root.dataset.fx !== 'on' || document.hidden) return;

      const claro = root.dataset.tema === 'claro';
      ctx.fillStyle = claro ? 'rgba(247,251,247,0.07)' : 'rgba(5,8,5,0.055)';
      ctx.fillRect(0, 0, largura, altura);
      ctx.font = `${TAMANHO}px var(--fonte-mono), ui-monospace, monospace`;
      ctx.fillStyle = claro ? '#1F8F43' : '#70FF8B';

      for (let i = 0; i < colunas.length; i += 1) {
        const y = colunas[i]! * TAMANHO;
        ctx.fillText(CHARS[(i * 7 + Math.floor(colunas[i]!)) % CHARS.length]!, i * TAMANHO, y);
        if (y > altura && (i * 13 + Math.floor(colunas[i]!)) % 97 === 0) colunas[i] = 0;
        colunas[i] = colunas[i]! + 0.16;
      }
    };

    redimensionar();
    window.addEventListener('resize', redimensionar);
    raf = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', redimensionar);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="fx-canvas"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '42%',
        pointerEvents: 'none',
        opacity: 0.5,
        maskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,1) 100%)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,1) 100%)',
      }}
    />
  );
}
