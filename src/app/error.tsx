'use client';

import { useEffect } from 'react';
import { TelaDeErro } from '@/components/TelaDeErro';
import { estiloAcao } from '@/components/estilosDeErro';

/**
 * Tela de erro da aplicação.
 *
 * Existe para que uma falha de servidor — banco fora do ar, variável de conexão
 * errada — não vire a página branca de digest do Next, que não diz nada a
 * ninguém.
 *
 * Fica na RAIZ, e não dentro de (painel), de propósito: um `error.tsx` captura
 * erros dos filhos do seu segmento, mas não do `layout.tsx` do próprio
 * segmento. Como é justamente o layout do painel que consulta o banco, uma
 * fronteira colocada ao lado dele não pegaria nada — o caso para o qual ela
 * existe seria o único que escaparia.
 *
 * O diagnóstico do texto é o que importa aqui, e foi preservado inteiro ao
 * trocar a moldura: ele aponta a causa mais provável e onde ler o motivo exato.
 * Uma tela bonita que só diz "algo deu errado" custa uma investigação.
 */
export default function ErroDaAplicacao({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[painel] erro de renderização:', error);
  }, [error]);

  return (
    <TelaDeErro
      codigo="500"
      titulo="Não foi possível carregar esta tela"
      descricao={
        <>
          <p>
            A causa mais comum é a conexão com o banco de dados: variável de ambiente ausente, senha
            incorreta, ou host inacessível a partir do servidor.
          </p>
          <p style={{ marginTop: 10 }}>
            O motivo exato está no log do servidor. Numa hospedagem, procure em{' '}
            <strong>Runtime Logs</strong>; rodando localmente, no terminal onde a aplicação subiu.
          </p>
        </>
      }
      detalhe={
        error.digest ? (
          <p className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>
            Identificador desta ocorrência: {error.digest}
          </p>
        ) : undefined
      }
      acoes={
        <>
          <button type="button" onClick={reset} style={estiloAcao(true)}>
            Tentar de novo
          </button>
          <a href="/api/diagnostico" style={estiloAcao(false)}>
            Abrir o diagnóstico
          </a>
          <a href="/entrar" style={estiloAcao(false)}>
            Voltar para o login
          </a>
        </>
      }
    />
  );
}
