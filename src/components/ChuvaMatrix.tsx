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
    tamanho: 17,
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
    tamanho: 20,
    estilo: {
      position: 'fixed',
      inset: 0,
      width: '100%',
      height: '100%',
      zIndex: 0,
      // Sem atenuação: os dígitos precisam ficar visíveis, e o cartão de login
      // tem fundo sólido próprio — é ele que garante a leitura do formulário,
      // não o apagamento do fundo. Versões anteriores usavam máscara radial
      // apagando o centro, e o efeito sumia justamente onde se olha.
      opacity: 1,
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
    /** Linha atual de cada coluna — INTEIRO, não fração. Veja `passo`. */
    let colunas: number[] = [];
    let largura = 0;
    let altura = 0;
    let raf = 0;
    /** Acumulador de tempo, para a queda não depender da taxa de quadros. */
    let acumulado = 0;
    let ultimo = 0;

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
      // Começam ACIMA da tela, em alturas sorteadas: a chuva já nasce
      // espalhada, em vez de todas as colunas entrando juntas pelo topo.
      colunas = new Array(Math.ceil(largura / TAMANHO))
        .fill(0)
        .map(() => Math.floor(Math.random() * -100));
      ctx.clearRect(0, 0, largura, altura);
    };

    /**
     * Intervalo entre passos, em ms. Cada passo desce EXATAMENTE uma linha.
     *
     * Antes a coluna avançava 0,32 de linha por quadro, e o caractere era
     * desenhado na posição fracionária resultante. O efeito ficava esticado e
     * fora de grade: em vez de uma coluna de texto, saía um borrão vertical com
     * os glifos desalinhados entre si.
     *
     * Descer uma linha inteira por passo é o que faz cada número cair
     * exatamente sob o anterior — que é a aparência da chuva do Matrix. O
     * acumulador desacopla isso da taxa de quadros: numa tela de 120 Hz a
     * queda tem a mesma velocidade que numa de 60.
     */
    const MS_POR_LINHA = 33;

    const desenhar = (claro: boolean) => {
      ctx.font = `${TAMANHO}px var(--fonte-mono), ui-monospace, monospace`;
      // COR ÚNICA para toda a coluna. Uma versão anterior deixava a cabeça mais
      // clara que o rastro; é bonito, mas muda a aparência — a chuva de
      // referência é um campo uniforme de dígitos, onde a profundidade vem só
      // do desbotamento progressivo do véu.
      ctx.fillStyle = claro ? '#1F8F43' : '#00FF41';
      const linhas = Math.ceil(altura / TAMANHO);

      for (let i = 0; i < colunas.length; i += 1) {
        const linha = colunas[i]!;
        // Dígito SORTEADO a cada passo, não derivado da posição. Derivar produz
        // padrões diagonais perceptíveis; sortear dá o ruído binário do original.
        ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)]!, i * TAMANHO, linha * TAMANHO);

        // Reinício probabilístico depois de sair pela base: as colunas voltam
        // em momentos diferentes, então a chuva cai contínua em vez de pulsar
        // em bloco.
        colunas[i] = linha > linhas && Math.random() > 0.975 ? 0 : linha + 1;
      }
    };

    const passo = (agora: number) => {
      raf = requestAnimationFrame(passo);
      const root = document.documentElement;
      if (root.dataset.fx !== 'on' || document.hidden) {
        ultimo = agora;
        return;
      }

      const decorrido = ultimo ? Math.min(agora - ultimo, 250) : 0;
      ultimo = agora;
      acumulado += decorrido;
      if (acumulado < MS_POR_LINHA) return;
      acumulado %= MS_POR_LINHA;

      // O véu de cada passo é o que APAGA o passado: quanto mais fraco, mais
      // longo o rastro. É daqui que vem a cauda desbotada característica. Usa a
      // cor do PRÓPRIO tema — um preto fixo sujaria o tema claro.
      // 0,1 é o valor do componente de referência: com um passo a cada 33 ms,
      // um dígito sobrevive ~10 passos, e o rastro fica com ~10 caracteres.
      // Usa a cor do PRÓPRIO tema — um preto fixo sujaria o tema claro.
      const claro = root.dataset.tema === 'claro';
      ctx.fillStyle = claro ? 'rgba(247,251,247,0.1)' : 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, 0, largura, altura);

      desenhar(claro);
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
