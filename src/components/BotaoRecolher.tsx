'use client';

import { useEffect, useState } from 'react';

/**
 * Recolhe e expande a barra lateral.
 *
 * Adaptado de um componente que expandia ao passar o MOUSE. Aqui é por clique,
 * e por três motivos concretos:
 *
 *  1. Num sistema de operação, uma barra que abre e fecha sozinha desloca todo
 *     o conteúdo à direita toda vez que o ponteiro a cruza sem intenção.
 *  2. Passagem de mouse não existe para quem navega por teclado.
 *  3. A escolha PERSISTE. Quem trabalha recolhido continua recolhido amanhã —
 *     e o script inline do layout aplica o estado antes da primeira pintura,
 *     pelo mesmo motivo do tema: senão a barra nasce aberta e encolhe na cara.
 *
 * Vale só no desktop. Abaixo de 860px a navegação vira a barra inferior, ao
 * alcance do polegar, e não há o que recolher.
 */
export function BotaoRecolher() {
  const [recolhido, setRecolhido] = useState(false);

  // Lê o que o script inline já decidiu, em vez de assumir um padrão que
  // poderia divergir do que está pintado.
  useEffect(() => {
    setRecolhido(document.documentElement.dataset.menu === 'recolhido');
  }, []);

  const alternar = () => {
    const proximo = !recolhido;
    setRecolhido(proximo);
    document.documentElement.dataset.menu = proximo ? 'recolhido' : 'aberto';
    try {
      localStorage.setItem('painel:menu', proximo ? 'recolhido' : 'aberto');
    } catch {
      /* navegação privativa: a preferência vale só nesta aba */
    }
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={recolhido}
      // O nome diz a AÇÃO, não o estado: "Recolher menu" quando dá para
      // recolher. `aria-pressed` carrega o estado, que é o papel dele.
      aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'}
      className="botao-recolher mono"
    >
      <span aria-hidden="true">{recolhido ? '»' : '«'}</span>
    </button>
  );
}
