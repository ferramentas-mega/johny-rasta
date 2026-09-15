'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cadastrarUrl, solicitarAnalise, removerUrl, type EstadoAnalise } from './acoes';
import { Painel } from '@/components/Cartoes';

const VAZIO: EstadoAnalise = {};

/**
 * Cadastro de URLs e pedido de análise.
 *
 * O pedido é em duas etapas de propósito: a Server Action apenas ENFILEIRA, e
 * então o navegador chama o endpoint de processamento. Fazer a chamada ao
 * PageSpeed dentro da Action prenderia o formulário por 11 a 48 segundos — e
 * numa página pesada estouraria o tempo máximo da função, perdendo o trabalho.
 */
export function PainelDeAnalise({
  siteId,
  urls,
  configurada,
  dominio,
}: {
  siteId: string;
  urls: { id: string; url: string; prioritaria: boolean }[];
  configurada: boolean;
  dominio: string;
}) {
  const [estadoCadastro, acaoCadastro, cadastrando] = useActionState(cadastrarUrl, VAZIO);
  const [estadoAnalise, acaoAnalise, enfileirando] = useActionState(solicitarAnalise, VAZIO);
  const [estadoRemocao, acaoRemocao] = useActionState(removerUrl, VAZIO);
  const router = useRouter();
  const [processando, iniciarProcessamento] = useTransition();
  const [resultado, setResultado] = useState<string | null>(null);

  /**
   * Puxa a fila uma vez. O endpoint processa UMA análise por chamada — é o que
   * cabe no tempo máximo da função.
   */
  function processarAgora() {
    iniciarProcessamento(async () => {
      setResultado('Executando análise…');
      try {
        const r = await fetch('/api/auditorias/processar', { method: 'POST' });
        const corpo = await r.json();
        if (corpo.processado) {
          setResultado(
            `Análise concluída: ${corpo.url} (${corpo.strategy === 'mobile' ? 'celular' : 'computador'}).`,
          );
          // Antes a mensagem terminava em "Recarregue para ver" — o painel
          // admitindo que não sabia se atualizar, com a nota recém-medida já no
          // banco e a tabela ao lado mostrando a anterior.
          router.refresh();
        } else {
          setResultado(corpo.erro ?? corpo.motivo ?? 'Nada a processar.');
        }
      } catch {
        setResultado('Não foi possível falar com o servidor.');
      }
    });
  }

  const campo = {
    background: 'var(--elev)', border: '1px solid var(--bd)', borderRadius: 8,
    padding: '9px 11px', fontSize: 13, color: 'var(--tx)',
  } as const;

  const botao = (ativo: boolean) => ({
    cursor: ativo ? 'pointer' : 'not-allowed',
    background: ativo ? 'var(--gold)' : 'var(--elev)',
    color: ativo ? 'var(--on-gold)' : 'var(--tx3)',
    border: ativo ? 'none' : '1px solid var(--bd)',
    borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13,
  });

  return (
    <Painel titulo="URLs monitoradas" subtitulo={`Uma análise da Home não representa as demais páginas de ${dominio}`}>
      <form action={acaoCadastro} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="hidden" name="siteId" value={siteId} />
        <input
          name="url" type="url" required placeholder={`https://${dominio}/planos`}
          aria-label="URL para monitorar" style={{ ...campo, flex: '1 1 260px' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
          <input type="checkbox" name="prioritaria" defaultChecked /> Prioritária
        </label>
        <button type="submit" disabled={cadastrando} style={botao(!cadastrando)}>
          {cadastrando ? 'Salvando…' : 'Monitorar URL'}
        </button>
      </form>
      {estadoCadastro.erro && <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 8 }}>{estadoCadastro.erro}</p>}
      {estadoCadastro.ok && <p role="status" style={{ fontSize: 12.5, color: 'var(--pos)', marginTop: 8 }}>{estadoCadastro.ok}</p>}

      <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {urls.length === 0 && (
          <li style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
            Nenhuma URL monitorada. Cadastre ao menos a Home e as landing pages que importam.
          </li>
        )}
        {urls.map((u) => (
          <li key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
            borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
            <span className="mono" style={{ fontSize: 12, flex: '1 1 220px', wordBreak: 'break-all' }}>{u.url}</span>
            {u.prioritaria && <span style={{ fontSize: 10.5, color: 'var(--gold)' }}>PRIORITÁRIA</span>}
            <form action={acaoRemocao} style={{ display: 'inline' }}>
              <input type="hidden" name="siteId" value={siteId} />
              <input type="hidden" name="url" value={u.url} />
              <button
                type="submit"
                title="Deixar de monitorar esta URL"
                style={{
                  background: 'none', border: 'none', padding: '6px 4px', cursor: 'pointer',
                  fontSize: 12, color: 'var(--tx3)', textDecoration: 'underline',
                }}
              >
                Remover
              </button>
            </form>
            {(['mobile', 'desktop'] as const).map((s) => (
              <form key={s} action={acaoAnalise} style={{ display: 'inline' }}>
                <input type="hidden" name="siteId" value={siteId} />
                <input type="hidden" name="url" value={u.url} />
                <input type="hidden" name="strategy" value={s} />
                <button type="submit" disabled={!configurada || enfileirando} style={{ ...botao(configurada && !enfileirando), padding: '6px 10px', fontSize: 12 }}>
                  {s === 'mobile' ? 'Celular' : 'Computador'}
                </button>
              </form>
            ))}
          </li>
        ))}
      </ul>

      {estadoAnalise.erro && <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 10 }}>{estadoAnalise.erro}</p>}
      {estadoRemocao.erro && <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 10 }}>{estadoRemocao.erro}</p>}
      {estadoRemocao.ok && <p role="status" style={{ fontSize: 12.5, color: 'var(--pos)', marginTop: 10 }}>{estadoRemocao.ok}</p>}

      {/*
        O botão aparece nos DOIS casos: tarefa criada agora, e tarefa que já
        estava na fila. Mostrar só no primeiro fazia quem clicasse duas vezes
        perder a forma de executar — a segunda resposta é "já existia", e a
        tarefa continua lá esperando alguém puxá-la.
      */}
      {(estadoAnalise.ok || estadoAnalise.aviso) && (
        <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="status" style={{ fontSize: 12.5, color: estadoAnalise.ok ? 'var(--pos)' : 'var(--warn-tx)' }}>
            {estadoAnalise.ok ?? estadoAnalise.aviso}
          </span>
          <button type="button" onClick={processarAgora} disabled={processando} style={{ ...botao(!processando), padding: '7px 12px', fontSize: 12.5 }}>
            {processando ? 'Executando…' : 'Executar agora'}
          </button>
        </div>
      )}
      {resultado && <p style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 8 }}>{resultado}</p>}

      <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 14, lineHeight: 1.6 }}>
        Cada análise leva de 10 a 50 segundos, dependendo do peso da página, e roda uma por vez.
        As URLs prioritárias são reanalisadas automaticamente a cada sete dias.
      </p>
    </Painel>
  );
}
