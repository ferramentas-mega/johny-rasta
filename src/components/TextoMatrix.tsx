'use client';

import { useEffect, useState } from 'react';

/**
 * Texto que "decodifica": cada letra vira um dígito binário por um instante e
 * volta ao caractere real, da esquerda para a direita.
 *
 * Adaptado de um componente pronto (shadcn + Tailwind + `motion`). A ideia é a
 * mesma; a implementação é deste projeto, por três motivos concretos:
 *
 * 1. `motion` custaria uma dependência de animação para mudar a cor de um
 *    `<span>` — que é `transition` de CSS.
 * 2. O original **troca o texto do elemento**. Num link de navegação isso muda
 *    o nome acessível: quem usa leitor de tela ouviria "1 0 1 1 0" no lugar de
 *    "Clientes". Aqui a camada animada é `aria-hidden` e o texto real continua
 *    no DOM, intacto.
 * 3. O original anima uma vez, ao montar. Num menu com seis itens, animar tudo
 *    a cada carregamento seria movimento sem propósito. Aqui quem dispara é o
 *    ponteiro, o teclado ou a própria navegação.
 *
 * Respeita `data-fx`: com os efeitos desligados, nada acontece — nem sequer um
 * temporizador é criado.
 */

/** Quanto tempo cada letra fica embaralhada. */
const MS_POR_LETRA = 380;
/** Atraso entre o início de uma letra e o da seguinte — é o que cria a cascata. */
const MS_ENTRE_LETRAS = 45;
/** De quanto em quanto tempo o dígito sorteado troca, enquanto embaralhado. */
const MS_POR_SORTEIO = 60;

/**
 * Dígito derivado de `(posição, semente)`, e não de `Math.random()` na
 * renderização. Render precisa ser determinístico: sortear ali faria o mesmo
 * estado produzir saídas diferentes a cada repintura, e o React avisa sobre
 * isso com razão.
 */
function digito(indice: number, semente: number): string {
  const h = Math.imul(indice + 1, 0x9e3779b1) ^ Math.imul(semente + 1, 0x85ebca6b);
  return (h >>> 7) & 1 ? '1' : '0';
}

export function TextoMatrix({ texto, disparo = 0 }: { texto: string; disparo?: number }) {
  /** Quais posições estão embaralhadas agora. */
  const [embaralhadas, setEmbaralhadas] = useState<boolean[]>([]);
  const [semente, setSemente] = useState(0);

  useEffect(() => {
    // `disparo` começa em 0 e só muda quando alguém pede. Sem isto, o efeito
    // rodaria na montagem — que é justamente o que não se quer aqui.
    if (disparo === 0) return;
    if (document.documentElement.dataset.fx !== 'on') return;

    const letras = [...texto];
    const relogios: ReturnType<typeof setTimeout>[] = [];

    letras.forEach((c, i) => {
      if (c === ' ') return;
      relogios.push(
        setTimeout(() => {
          setEmbaralhadas((p) => marcar(p, letras.length, i, true));
          relogios.push(
            setTimeout(() => setEmbaralhadas((p) => marcar(p, letras.length, i, false)), MS_POR_LETRA),
          );
        }, i * MS_ENTRE_LETRAS),
      );
    });

    // Um relógio só para todas as letras: um por letra multiplicaria os
    // temporizadores sem mudar nada do que se vê.
    const sorteio = setInterval(() => setSemente((s) => s + 1), MS_POR_SORTEIO);

    return () => {
      relogios.forEach(clearTimeout);
      clearInterval(sorteio);
      // Volta ao texto real. Se a animação for interrompida no meio — trocar de
      // página, por exemplo —, o que fica é o rótulo, nunca meio rótulo.
      setEmbaralhadas([]);
    };
  }, [disparo, texto]);

  const animando = embaralhadas.some(Boolean);

  return (
    // `inline-grid` com as duas camadas na MESMA célula: a largura é sempre a do
    // texto real, então o menu não estremece quando "Configurações" vira
    // "10110101010110". Layout que pula durante a animação é pior que não ter
    // animação nenhuma.
    <span style={{ display: 'inline-grid', whiteSpace: 'nowrap' }}>
      <span
        style={{
          gridArea: '1 / 1',
          // `opacity` e não `visibility`/`display`: os dois últimos tirariam o
          // texto da árvore de acessibilidade, e é ele que dá nome ao link.
          opacity: animando ? 0 : 1,
        }}
      >
        {texto}
      </span>

      {animando && (
        <span
          aria-hidden="true"
          className="mono"
          style={{ gridArea: '1 / 1', color: 'var(--gold)', textShadow: 'var(--glow)' }}
        >
          {[...texto].map((c, i) =>
            c === ' ' ? (
              ' '
            ) : (
              <span key={i} style={{ display: 'inline-block', width: '1ch', textAlign: 'center' }}>
                {embaralhadas[i] ? digito(i, semente) : c}
              </span>
            ),
          )}
        </span>
      )}
    </span>
  );
}

function marcar(atual: boolean[], tamanho: number, indice: number, valor: boolean): boolean[] {
  const proximo = atual.length === tamanho ? [...atual] : new Array<boolean>(tamanho).fill(false);
  proximo[indice] = valor;
  return proximo;
}
