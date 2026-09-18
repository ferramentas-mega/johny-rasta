'use client';

import { useEffect, useState } from 'react';

type Situacao =
  | { tipo: 'verificando' }
  | { tipo: 'incompativel'; motivo: string }
  | { tipo: 'indisponivel' }
  | { tipo: 'negada' }
  | { tipo: 'pronto'; inscrito: boolean; dispositivos: number }
  | { tipo: 'trabalhando'; texto: string }
  | { tipo: 'erro'; texto: string };

const CHAVE_ADIADO = 'painel:push:adiado';

function base64ParaBytes(b64: string): Uint8Array {
  const preenchido = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bruto = atob(preenchido);
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0));
}

/**
 * Opt-in de notificações — com contexto ANTES do pedido de permissão.
 *
 * O navegador só pergunta depois de um clique consciente; pedir ao carregar a
 * página é o jeito mais rápido de ganhar um "bloquear" permanente. E o
 * componente nunca promete o que não tem: sem PushManager, sem chave no
 * servidor ou com permissão negada, ele diz exatamente isso.
 */
export function AtivarNotificacoes() {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: 'verificando' });
  const [chave, setChave] = useState<string | null>(null);
  const [adiado, setAdiado] = useState(false);

  useEffect(() => {
    try {
      setAdiado(localStorage.getItem(CHAVE_ADIADO) === '1');
    } catch {
      /* navegação privativa */
    }
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setSituacao({ tipo: 'incompativel', motivo: 'Este navegador não oferece notificações push (no iPhone, só com o painel instalado na tela inicial).' });
        return;
      }
      const r = await fetch('/api/push');
      if (!r.ok) {
        setSituacao({ tipo: 'erro', texto: 'Não foi possível consultar o servidor.' });
        return;
      }
      const dados = (await r.json()) as { disponivel: boolean; chavePublica: string | null; dispositivos: { endpoint: string }[] };
      if (!dados.disponivel || !dados.chavePublica) {
        setSituacao({ tipo: 'indisponivel' });
        return;
      }
      setChave(dados.chavePublica);
      if (Notification.permission === 'denied') {
        setSituacao({ tipo: 'negada' });
        return;
      }
      const registro = await navigator.serviceWorker.getRegistration('/sw.js');
      const atual = await registro?.pushManager.getSubscription();
      const inscrito = !!atual && dados.dispositivos.some((d) => d.endpoint === atual.endpoint);
      setSituacao({ tipo: 'pronto', inscrito, dispositivos: dados.dispositivos.length });
    })().catch((e: unknown) => setSituacao({ tipo: 'erro', texto: String(e).slice(0, 160) }));
  }, []);

  async function ativar() {
    if (!chave) return;
    setSituacao({ tipo: 'trabalhando', texto: 'Pedindo permissão…' });
    try {
      // AGORA, depois do clique — nunca no carregamento.
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setSituacao(permissao === 'denied' ? { tipo: 'negada' } : { tipo: 'pronto', inscrito: false, dispositivos: 0 });
        return;
      }
      setSituacao({ tipo: 'trabalhando', texto: 'Registrando este dispositivo…' });
      const registro = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const inscricao =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave) as BufferSource }));
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inscricao.toJSON()),
      });
      if (!r.ok) throw new Error('O servidor recusou a inscrição.');
      try {
        localStorage.removeItem(CHAVE_ADIADO);
      } catch {
        /* idem */
      }
      setAdiado(false);
      setSituacao({ tipo: 'pronto', inscrito: true, dispositivos: 1 });
    } catch (e) {
      setSituacao({ tipo: 'erro', texto: String((e as Error).message ?? e).slice(0, 160) });
    }
  }

  async function desativar() {
    setSituacao({ tipo: 'trabalhando', texto: 'Removendo este dispositivo…' });
    try {
      const registro = await navigator.serviceWorker.getRegistration('/sw.js');
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: inscricao.endpoint }) });
        await inscricao.unsubscribe();
      }
      setSituacao({ tipo: 'pronto', inscrito: false, dispositivos: 0 });
    } catch (e) {
      setSituacao({ tipo: 'erro', texto: String((e as Error).message ?? e).slice(0, 160) });
    }
  }

  function agoraNao() {
    try {
      localStorage.setItem(CHAVE_ADIADO, '1');
    } catch {
      /* idem */
    }
    setAdiado(true);
  }

  const botao = (ativo: boolean) => ({
    cursor: ativo ? 'pointer' : 'not-allowed',
    background: ativo ? 'var(--gold)' : 'var(--elev)',
    color: ativo ? 'var(--on-gold)' : 'var(--tx3)',
    border: ativo ? 'none' : '1px solid var(--bd)',
    borderRadius: 'var(--raio-p)', padding: '9px 14px', fontWeight: 600, fontSize: 'var(--tipo-corpo)',
  });
  const secundario = { ...botao(true), background: 'var(--elev)', color: 'var(--tx2)', border: '1px solid var(--bd)', fontWeight: 400 } as const;

  return (
    <div data-testid="ativar-notificacoes" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 'var(--tipo-corpo)', color: 'var(--tx2)', lineHeight: 1.7 }}>
        Receba um aviso neste dispositivo quando um cliente entrar em gravidade alta — nota técnica ruim numa página
        monitorada ou erro de configuração — mesmo com o painel fechado. Um aviso por mudança de estado, agrupado por
        cliente; nunca o mesmo aviso todo dia. A central de avisos continua funcionando sem isto.
      </p>

      {situacao.tipo === 'verificando' && <span style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx3)' }}>Verificando este navegador…</span>}
      {situacao.tipo === 'incompativel' && <span role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx3)' }}>{situacao.motivo}</span>}
      {situacao.tipo === 'indisponivel' && (
        <span role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--warn-tx)' }}>
          Push não está configurado neste servidor (faltam as chaves VAPID). A central de avisos no painel continua valendo.
        </span>
      )}
      {situacao.tipo === 'negada' && (
        <span role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--warn-tx)' }}>
          Este navegador está com notificações bloqueadas para o painel. Libere nas permissões do site para ativar.
        </span>
      )}
      {situacao.tipo === 'trabalhando' && <span role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>{situacao.texto}</span>}
      {situacao.tipo === 'erro' && <span role="alert" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--neg-tx)' }}>{situacao.texto}</span>}

      {situacao.tipo === 'pronto' && situacao.inscrito && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--pos-tx)' }}>Notificações ativas neste dispositivo ✓</span>
          <button type="button" onClick={desativar} style={secundario}>Desativar neste dispositivo</button>
        </div>
      )}
      {situacao.tipo === 'pronto' && !situacao.inscrito && !adiado && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={ativar} style={botao(true)}>Ativar notificações</button>
          <button type="button" onClick={agoraNao} style={secundario}>Agora não</button>
        </div>
      )}
      {situacao.tipo === 'pronto' && !situacao.inscrito && adiado && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx3)' }}>Você adiou. Quando quiser:</span>
          <button type="button" onClick={ativar} style={secundario}>Ativar notificações</button>
        </div>
      )}
    </div>
  );
}
