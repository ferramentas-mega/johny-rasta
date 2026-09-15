'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { Icone, type IconeNome } from '@/components/icones';

/**
 * Navegação de rodapé do celular, com o facho sobre o item ativo.
 *
 * Adaptado de um componente pronto (shadcn + Tailwind + lucide). O facho e a
 * medição da posição são a ideia dele; o resto é deste projeto, por três
 * motivos que mudam o comportamento:
 *
 * 1. **São links de verdade, não `<a onClick>`.** O original guarda o índice
 *    ativo num `useState` e não navega. Aqui o ativo vem do `pathname`, como no
 *    resto do painel — foi um destaque com estado próprio que, no protótipo,
 *    deixava "Leads" aceso sobre a tela de Desempenho. Além disso, `<a>` sem
 *    `href` não recebe foco de teclado e não abre em nova aba.
 * 2. **Os ícones já existem** em `icones.tsx`. O `lucide-react` inteiro não se
 *    paga por seis traçados.
 * 3. **O rótulo aparece.** Ícone sozinho é adivinhação; `aria-label` resolve
 *    para quem usa leitor de tela e não resolve para quem enxerga.
 *
 * Só existe no celular: no desktop a barra lateral cabe e mostra mais.
 */

type Item = { href: string; label: string; icone: IconeNome; prefixos?: string[]; contagem?: number | null };

export function MenuInferior({ itens, busca }: { itens: Item[]; busca: string }) {
  const pathname = usePathname();
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const facho = useRef<HTMLSpanElement | null>(null);
  /**
   * O facho nasce parado. Sem isto ele desliza da esquerda da tela até o item
   * ativo no primeiro quadro, o que parece defeito e não animação.
   */
  const [pronto, setPronto] = useState(false);

  const indiceAtivo = itens.findIndex(
    (i) => pathname === i.href || (i.prefixos ?? []).some((p) => pathname.startsWith(`${p}/`)),
  );

  useLayoutEffect(() => {
    const alvo = refs.current[indiceAtivo];
    const barra = facho.current;
    if (!alvo || !barra) return;

    // Medido do DOM, e não calculado por índice × largura: os itens não têm
    // largura igual (o rótulo "Visão geral" é maior que "Sites"), e assumir que
    // têm desalinharia o facho justamente nos extremos.
    barra.style.left = `${alvo.offsetLeft + alvo.offsetWidth / 2 - barra.offsetWidth / 2}px`;
    barra.style.opacity = indiceAtivo < 0 ? '0' : '1';

    if (!pronto) {
      // Um quadro de folga antes de ligar a transição, para a primeira
      // colocação ser instantânea.
      const t = requestAnimationFrame(() => setPronto(true));
      return () => cancelAnimationFrame(t);
    }
  }, [indiceAtivo, pronto, itens.length]);

  return (
    <nav className="menu-inferior" aria-label="Seções do painel">
      {itens.map((item, i) => {
        const on = i === indiceAtivo;
        return (
          <Link
            key={item.href}
            href={`${item.href}${busca}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-current={on ? 'page' : undefined}
            className="item-inferior"
          >
            <span className="item-inferior-icone">
              <Icone nome={item.icone} tamanho={20} />
              {item.contagem != null && item.contagem > 0 && (
                <span className="mono item-inferior-contagem" aria-hidden="true">
                  {item.contagem > 99 ? '99+' : item.contagem}
                </span>
              )}
            </span>
            <span className="item-inferior-rotulo">{item.label}</span>
            {/* A contagem já apareceu como número sobre o ícone, mas ali ela é
                decorativa. Aqui ela vira texto para quem usa leitor de tela. */}
            {item.contagem != null && item.contagem > 0 && (
              <span className="apenas-leitor">{`, ${item.contagem} itens`}</span>
            )}
          </Link>
        );
      })}

      {/* Decorativo: a informação de "qual está ativo" já está no
          `aria-current` de cada link. */}
      <span
        ref={facho}
        aria-hidden="true"
        className={pronto ? 'facho facho-animado' : 'facho'}
        style={{ left: -999, opacity: 0 }}
      >
        <span className="facho-cone" />
      </span>
    </nav>
  );
}
