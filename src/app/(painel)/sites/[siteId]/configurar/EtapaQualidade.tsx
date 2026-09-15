'use client';

import { useActionState } from 'react';
import { BotaoSubmeter, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { conferirQualidade } from './acoes';

/**
 * Etapa 6 — conferir se já existe análise técnica.
 *
 * Separada do painel de análise (que cadastra URLs e enfileira) porque faz uma
 * coisa só: procurar uma análise concluída COM NOTA e registrar a verificação.
 *
 * Uma auditoria que falhou, ou que ainda não rodou, **não bloqueia** as etapas
 * de visitas e contatos. São dois caminhos independentes, e o assistente trata
 * assim: esta etapa pendente não impede o resumo de dizer que o rastreamento
 * está verificado.
 */
export function EtapaQualidade({ siteId, configurada }: { siteId: string; configurada: boolean }) {
  const [estado, acao] = useActionState(conferirQualidade, ESTADO_VAZIO);

  if (!configurada) {
    return (
      <div
        role="alert"
        style={{
          border: '1px solid var(--warn-tx)', borderRadius: 10, padding: 14,
          background: 'var(--warn-bg)', fontSize: 13, lineHeight: 1.7,
        }}
      >
        <strong>A análise técnica não está configurada neste servidor.</strong>
        <p style={{ marginTop: 6, color: 'var(--tx2)' }}>
          Falta a chave do Google (<span className="mono">PAGESPEED_API_KEY</span>) nas variáveis de ambiente, com as
          APIs <em>PageSpeed Insights</em> e <em>Chrome UX Report</em> habilitadas. É uma pendência do servidor, não
          deste site — e não impede medir visitas, cliques e formulários.
        </p>
      </div>
    );
  }

  return (
    <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="siteId" value={siteId} />
      <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
        Cadastre a URL acima, execute a primeira análise e depois confira aqui. A verificação procura uma análise
        concluída <strong>com nota registrada</strong> — uma execução que falhou não conta como verificada.
      </p>
      <Retorno estado={estado} />
      <div>
        <BotaoSubmeter ocupado="Procurando…">Conferir análise concluída</BotaoSubmeter>
      </div>
    </form>
  );
}
