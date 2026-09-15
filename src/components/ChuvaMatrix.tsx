'use client';

import { useEffect, useRef } from 'react';

/**
 * Chuva Matrix.
 *
 * Um motor só, duas aparências. Duplicar o desenho em dois componentes faria as
 * duas divergirem na primeira correção aplicada a apenas um deles.
 *
 * Decorativa em qualquer variante: não recebe ponteiro, não entra na árvore de
 * acessibilidade, e **para de desenhar** quando os efeitos estão desligados ou a
 * aba está em segundo plano — nada de queimar CPU e bateria numa aba esquecida.
 *
 * O desligamento respeita `data-fx` no `<html>`, que o script do layout raiz
 * define a partir de `prefers-reduced-motion` e da escolha salva. Quem pede
 * menos movimento não vê animação nenhuma, e há teste de navegador provando.
 */

export type VarianteChuva = 'cabecalho' | 'tela';

/** Cada variante define onde a chuva mora e o quanto ela aparece. */
const VARIANTES: Record<VarianteChuva, { tamanho: number; estilo: React.CSSProperties }> = {
  // Faixa à direita do cabeçalho, sumindo sob uma máscara lateral.
  cabecalho: {
    tamanho: 14,
    estilo: {
      position: 'absolute',
      top: 0,
      right: 0,
      height: '100%',
      width: '42%',
      opacity: 0.5,
      maskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,1) 100%)',
      WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,1) 100%)',
    },
  },
  // Tela inteira, atrás do conteúdo.
  //
  // A opacidade baixa e a máscara radial não são enfeite: fundo animado atrás de
  // um formulário é exatamente onde a legibilidade costuma se perder. A máscara
  // apaga o centro, que é onde o texto fica.
  tela: {
    tamanho: 16,
    estilo: {
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      opacity: 0.3,
      maskImage: 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 10%, rgba(0,0,0,.85) 70%, #000 100%)',
      WebkitMaskImage: 'radial-gradient(ellipse 60% 55% at 50% 45%, transparent 10%, rgba(0,0,0,.85) 70%, #000 100%)',
    },
  },
};

export function ChuvaMatrix({ variante = 'cabecalho' }: { variante?: VarianteChuva }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { tamanho: TAMANHO, estilo } = VARIANTES[variante];

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const CHARS = '01<>/[]{}#$%&*+=?ABCDEF'.split('');
    let colunas: number[] = [];
    let largura = 0;
    let altura = 0;
    let raf = 0;

    const redimensionar = () => {
      // Sem isto a chuva sai borrada em tela de alta densidade.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      largura = r.width;
      altura = r.height;
      canvas.width = Math.max(1, Math.floor(largura * dpr));
      canvas.height = Math.max(1, Math.floor(altura * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // As colunas são recalculadas: redimensionar com a contagem antiga
      // deixaria faixas vazias ou colunas fora da tela.
      colunas = new Array(Math.ceil(largura / TAMANHO)).fill(0).map((_, i) => -((i * 37) % 60));
      ctx.clearRect(0, 0, largura, altura);
    };

    const passo = () => {
      raf = requestAnimationFrame(passo);
      const root = document.documentElement;
      if (root.dataset.fx !== 'on' || document.hidden) return;

      // O esmaecimento usa a cor do PRÓPRIO tema. Um preto fixo pintaria por
      // cima do tema claro e sujaria a tela.
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
  }, [TAMANHO]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid={variante === 'tela' ? 'fx-canvas-tela' : 'fx-canvas'}
      style={{ pointerEvents: 'none', ...estilo }}
    />
  );
}
