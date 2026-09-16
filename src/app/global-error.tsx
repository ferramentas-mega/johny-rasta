'use client';

import { useEffect } from 'react';
import { inter, jetbrainsMono } from '@/fonts';
import { TelaDeErro } from '@/components/TelaDeErro';
import { estiloAcao } from '@/components/estilosDeErro';
import '@/styles/theme.css';

/**
 * A última rede: erro no **layout raiz**.
 *
 * `error.tsx` captura o que acontece abaixo dele, mas não o colapso do próprio
 * layout que o envolve. Quando isso acontece, o Next descarta a árvore inteira
 * — inclusive `<html>` e `<body>` — e renderiza este arquivo no lugar. Por isso
 * ele monta o documento do zero, importa o tema e as fontes por conta própria,
 * e repete o que o layout raiz faz.
 *
 * Sem ele, esse caso cai na página de erro embutida do Next: branca, em inglês
 * e sem nenhuma pista. Com ele, o usuário vê a mesma tela das outras falhas.
 *
 * Fora do ar de verdade este arquivo pode nunca renderizar — se o processo não
 * sobe, ninguém entrega HTML. Ele cobre o caso em que o servidor responde e o
 * layout é que falha, que é o mais comum: variável de ambiente ausente.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[painel] erro no layout raiz:', error);
  }, [error]);

  return (
    // Sem o script de preferências do layout raiz: ele não rodou, e aqui o
    // objetivo é entregar algo legível, não restaurar a escolha de tema. O
    // escuro é o padrão do projeto.
    <html lang="pt-BR" data-tema="escuro" data-fx="off" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <TelaDeErro
          codigo="500"
          titulo="O painel não conseguiu iniciar"
          descricao={
            <>
              <p>
                A falha aconteceu antes de qualquer tela ser montada — quase sempre por configuração
                do servidor: <code>DATABASE_URL</code> ou <code>SESSION_SECRET</code> ausentes, ou o
                banco recusando a conexão.
              </p>
              <p style={{ marginTop: 10 }}>
                O endereço <code>/api/diagnostico</code> verifica as conexões sem expor host, usuário
                ou senha, e diz qual variável falta.
              </p>
            </>
          }
          detalhe={
            error.digest ? (
              <p className="mono" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
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
            </>
          }
        />
      </body>
    </html>
  );
}
