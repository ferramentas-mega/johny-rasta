'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Atualiza os dados da tela sem recarregar a página.
 *
 * `router.refresh()` pede ao servidor só os Server Components da rota: o
 * estado de cliente (formulário meio preenchido, menu recolhido, rolagem)
 * fica; os números mudam. Um `location.reload()` faria o contrário — jogaria
 * fora o que a pessoa estava fazendo para mostrar o mesmo número.
 *
 * Duas coisas que este botão diz e uma que ele NÃO diz:
 *
 *  - **Quando os dados foram gerados** (`geradoEm`, carimbado pelo servidor
 *    ao renderizar). Um painel sem hora afirma "agora" para um número que
 *    pode ter cinco minutos, e ninguém sabe se precisa atualizar.
 *  - **Que está atualizando**, enquanto a transição roda.
 *  - Ele não afirma que o dado MUDOU. Só que foi buscado de novo. Se nada
 *    chegou, a tela é a mesma, e a hora avança — que é a verdade.
 *
 * `aCadaSegundos` liga a atualização automática, só enquanto a aba está
 * visível: rodar com a aba escondida gasta conexão do pool por ninguém. É
 * para a espera do PRIMEIRO EVENTO (instalação e verificação), onde quem olha
 * a tela quer ver o evento chegar — e não para a Visão geral, onde uma tabela
 * que muda sozinha sob o cursor é pior que um botão.
 */
export function BotaoAtualizar({ geradoEm, aCadaSegundos }: { geradoEm: Date; aCadaSegundos?: number }) {
  const router = useRouter();
  const [atualizando, iniciar] = useTransition();
  // A hora é formatada DEPOIS da hidratação, no fuso do navegador: formatar no
  // servidor daria uma string por fuso, e o React acusaria a diferença.
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    setHora(geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }, [geradoEm]);

  const atualizar = () => iniciar(() => router.refresh());

  useEffect(() => {
    if (!aCadaSegundos) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') atualizar();
    }, aCadaSegundos * 1000);
    return () => clearInterval(id);
    // `router` é estável; `atualizar` só depende dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aCadaSegundos]);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {/* NÃO é região viva (`role="status"`). Anunciar "dados de 20:55:41" a
          cada atualização automática seria ruído para quem usa leitor de
          tela — e disputaria a única região de status das telas de cadastro,
          onde a confirmação do formulário precisa ser a única anunciada. */}
      <time
        dateTime={geradoEm.toISOString()}
        data-testid="dados-de"
        className="mono"
        style={{ fontSize: 'var(--tipo-micro)', letterSpacing: 'var(--trilha-media)', color: 'var(--tx3)', whiteSpace: 'nowrap' }}
      >
        {atualizando ? 'ATUALIZANDO…' : hora ? `DADOS DE ${hora}` : ''}
      </time>
      <button
        type="button"
        onClick={atualizar}
        disabled={atualizando}
        aria-label="Atualizar os dados desta tela"
        title={aCadaSegundos ? `Atualiza sozinho a cada ${aCadaSegundos} s enquanto a aba estiver aberta` : 'Buscar os dados de novo, sem recarregar a página'}
        className="mono"
        style={{
          cursor: atualizando ? 'progress' : 'pointer',
          fontSize: 'var(--tipo-legenda)',
          letterSpacing: 'var(--trilha-media)',
          padding: '8px 11px',
          borderRadius: 'var(--raio-p)',
          border: '1px solid var(--bd)',
          background: 'var(--elev)',
          color: atualizando ? 'var(--tx3)' : 'var(--tx2)',
        }}
      >
        {atualizando ? '…' : 'ATUALIZAR'}
      </button>
    </span>
  );
}
