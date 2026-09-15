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
  // Cabeçalho inteiro.
  //
  // Ocupava só a faixa direita de 42%, e ficava quase invisível. Agora cobre a
  // largura toda — mas a máscara mantém o canto esquerdo limpo, que é onde vivem
  // o título da tela e o nome da conta. Chuva por trás de texto grande é onde a
  // leitura se perde primeiro.
  cabecalho: {
    tamanho: 14,
    estilo: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      opacity: 0.42,
      maskImage:
        'linear-gradient(90deg, transparent 0%, transparent 18%, rgba(0,0,0,.45) 42%, rgba(0,0,0,.9) 72%, #000 100%)',
      WebkitMaskImage:
        'linear-gradient(90deg, transparent 0%, transparent 18%, rgba(0,0,0,.45) 42%, rgba(0,0,0,.9) 72%, #000 100%)',
    },
  },
  // Tela inteira, atrás do conteúdo.
  //
  // A opacidade baixa e a máscara radial não são enfeite: fundo animado atrás de
  // um formulário é exatamente onde a legibilidade costuma se perder. A máscara
  // apaga o centro, que é onde o texto fica.
  tela: {
    tamanho: 18,
    estilo: {
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      // Bem mais presente que antes: com 0,3 e máscara apagando o centro, a
      // chuva praticamente sumia. Aqui ela cobre a tela inteira, e a máscara
      // apenas ATENUA a região do cartão de login em vez de apagá-la — o
      // suficiente para o texto continuar legível sem matar o efeito.
      opacity: 0.85,
      maskImage: 'radial-gradient(ellipse 46% 42% at 50% 46%, rgba(0,0,0,.28) 0%, rgba(0,0,0,.72) 55%, #000 100%)',
      WebkitMaskImage: 'radial-gradient(ellipse 46% 42% at 50% 46%, rgba(0,0,0,.28) 0%, rgba(0,0,0,.72) 55%, #000 100%)',
    },
  },
};

/**
 * Só `0` e `1`, como no Matrix.
 *
 * Antes havia símbolos e letras no conjunto, e o resultado lia como ruído de
 * terminal em vez de binário. É prop para quem quiser outro alfabeto, mas o
 * padrão é este de propósito.
 */
const ALFABETO_PADRAO = '01';

export function ChuvaMatrix({
  variante = 'cabecalho',
  caracteres = ALFABETO_PADRAO,
}: {
  variante?: VarianteChuva;
  caracteres?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { tamanho: TAMANHO, estilo } = VARIANTES[variante];

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const CHARS = (caracteres || ALFABETO_PADRAO).split('');
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

      // O véu de cada quadro é o que APAGA o passado: quanto mais fraco, mais
      // longo o rastro. É daqui que vem a cauda desbotada característica.
      ctx.fillStyle = claro ? 'rgba(247,251,247,0.055)' : 'rgba(5,8,5,0.045)';
      ctx.fillRect(0, 0, largura, altura);
      ctx.font = `${TAMANHO}px var(--fonte-mono), ui-monospace, monospace`;

      const corpo = claro ? '#1F8F43' : '#3FBF63';
      const cabeca = claro ? '#0C5C28' : '#C8FFD6';

      for (let i = 0; i < colunas.length; i += 1) {
        const y = colunas[i]! * TAMANHO;
        const char = CHARS[(i * 7 + Math.floor(colunas[i]!)) % CHARS.length]!;

        // A cabeça da coluna é mais clara que o rastro. Sem esse contraste a
        // chuva lê como um borrão uniforme em vez de gotas caindo.
        ctx.fillStyle = cabeca;
        ctx.fillText(char, i * TAMANHO, y);
        ctx.fillStyle = corpo;
        ctx.fillText(CHARS[(i * 11 + Math.floor(colunas[i]!) + 1) % CHARS.length]!, i * TAMANHO, y - TAMANHO);

        if (y > altura && (i * 13 + Math.floor(colunas[i]!)) % 97 === 0) colunas[i] = 0;
        colunas[i] = colunas[i]! + 0.32;
      }
    };

    redimensionar();
    window.addEventListener('resize', redimensionar);
    raf = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', redimensionar);
    };
  }, [TAMANHO, caracteres]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid={variante === 'tela' ? 'fx-canvas-tela' : 'fx-canvas'}
      style={{ pointerEvents: 'none', ...estilo }}
    />
  );
}
