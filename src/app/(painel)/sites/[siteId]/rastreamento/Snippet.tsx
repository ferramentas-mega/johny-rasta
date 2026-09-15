'use client';

import { useRef, useState } from 'react';

/**
 * Bloco de código copiável.
 *
 * ── Por que não basta `navigator.clipboard.writeText` ────────────────────────
 *
 * A API falha em mais situações do que parece: sem contexto seguro, sem
 * permissão concedida, em navegador antigo, e — descoberto pelo CI — em certas
 * versões de Chromium headless, onde a promessa simplesmente rejeita.
 *
 * O `catch` daqui devolvia o botão para "Copiar" **em silêncio**. Do lado de
 * quem usa, isso é indistinguível de um botão quebrado: você clica, nada muda,
 * e não há como saber se o código foi para a área de transferência ou não. Pior
 * que não copiar é não dizer que não copiou — o operador cola um snippet vazio
 * no site do cliente e vai procurar o defeito no lugar errado.
 *
 * Agora a falha tem saída E aviso: o texto do bloco é SELECIONADO na tela, e o
 * rótulo passa a pedir Ctrl+C. A recuperação é uma tecla, e ela é dita.
 */

type Estado = 'ocioso' | 'copiado' | 'selecionado';

const ROTULO: Record<Estado, string> = {
  ocioso: 'Copiar',
  copiado: 'Copiado',
  // Diz o que fazer, não o que falhou: "erro ao copiar" não ajuda ninguém a
  // terminar a tarefa.
  selecionado: 'Selecionado — use Ctrl+C',
};

export function Snippet({ codigo, rotulo }: { codigo: string; rotulo: string }) {
  const [estado, setEstado] = useState<Estado>('ocioso');
  const bloco = useRef<HTMLPreElement | null>(null);

  /** Seleciona o conteúdo do bloco, para o atalho do teclado funcionar. */
  const selecionarNaTela = () => {
    const alvo = bloco.current;
    const selecao = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!alvo || !selecao) return false;

    const intervalo = document.createRange();
    intervalo.selectNodeContents(alvo);
    selecao.removeAllRanges();
    selecao.addRange(intervalo);
    return true;
  };

  const copiar = async () => {
    try {
      // `navigator.clipboard` pode nem existir — em contexto inseguro o objeto
      // não é definido, e ler `.writeText` dele lançaria.
      if (!navigator.clipboard?.writeText) throw new Error('sem área de transferência');
      await navigator.clipboard.writeText(codigo);
      setEstado('copiado');
      setTimeout(() => setEstado('ocioso'), 2000);
    } catch {
      setEstado(selecionarNaTela() ? 'selecionado' : 'ocioso');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{rotulo}</span>
        <button
          type="button"
          onClick={copiar}
          /**
           * Âncora estável para os testes.
           *
           * O rótulo deste botão MUDA ao ser clicado — é essa a função dele. Um
           * teste que o localize por texto passa a apontar para outro elemento
           * logo depois do clique (com dois snippets na tela, `.first()` cai no
           * segundo), e a asserção seguinte mede a coisa errada sem falhar de
           * um jeito que revele o engano.
           */
          data-testid="botao-copiar"
          data-estado={estado}
          style={{
            marginLeft: 'auto',
            cursor: 'pointer',
            fontSize: 11.5,
            padding: '5px 10px',
            borderRadius: 7,
            background: 'var(--elev)',
            border: '1px solid var(--bd)',
            color: estado === 'ocioso' ? 'var(--tx2)' : 'var(--gold)',
          }}
        >
          {ROTULO[estado]}
        </button>
      </div>
      <pre
        ref={bloco}
        className="mono"
        style={{
          margin: 0,
          padding: '12px 14px',
          borderRadius: 8,
          border: '1px solid var(--bd)',
          background: 'var(--bg)',
          color: 'var(--tx)',
          fontSize: 12,
          lineHeight: 1.6,
          overflowX: 'auto',
          whiteSpace: 'pre',
        }}
      >
        {codigo}
      </pre>
    </div>
  );
}
