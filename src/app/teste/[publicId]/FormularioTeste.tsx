'use client';

import { useRef, useState } from 'react';

type Retorno = { tipo: 'ocioso' | 'enviando' | 'ok' | 'erro'; texto?: string; campos?: Record<string, string> };

declare global {
  interface Window {
    painel?: { evento: (subtipo: string, extras?: Record<string, string>) => void; visitante: () => string };
  }
}

/**
 * Formulário da página de teste.
 *
 * Exercita o caminho real: valida no servidor, grava, cria o lead e só então
 * confirma. Quando o servidor devolve erro, esta tela mostra erro — não existe
 * "recebemos com sucesso" sem gravação correspondente.
 */
export function FormularioTeste({ publicId }: { publicId: string }) {
  const [retorno, setRetorno] = useState<Retorno>({ tipo: 'ocioso' });
  // Uma chave por formulário PREENCHIDO, não por tentativa de envio: é o que
  // faz o reenvio após uma falha de rede não criar um segundo lead.
  const idempotencia = useRef<string>(crypto.randomUUID());
  const formRef = useRef<HTMLFormElement>(null);

  const enviar = async (evento: React.FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setRetorno({ tipo: 'enviando' });

    const dados = new FormData(evento.currentTarget);
    try {
      const resposta = await fetch(`/api/forms/${publicId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: dados.get('nome'),
          email: dados.get('email'),
          telefone: dados.get('telefone'),
          mensagem: dados.get('mensagem'),
          formulario: 'Fale conosco (página de teste)',
          caminho: location.pathname,
          visitante: window.painel?.visitante() ?? 'sem-coletor',
          idempotencia: idempotencia.current,
        }),
      });

      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        setRetorno({ tipo: 'erro', texto: corpo.erro ?? `O servidor respondeu ${resposta.status}.`, campos: corpo.campos });
        return;
      }

      setRetorno({
        tipo: 'ok',
        texto: corpo.duplicada
          ? 'Este envio já havia sido registrado. Nenhum lead duplicado foi criado.'
          : 'Envio registrado. O lead já aparece no painel.',
      });
      // Nova chave só depois de um envio confirmado: agora é outro preenchimento.
      idempotencia.current = crypto.randomUUID();
      formRef.current?.reset();
    } catch (erro) {
      setRetorno({ tipo: 'erro', texto: erro instanceof Error ? erro.message : 'Falha de rede.' });
    }
  };

  const campo: React.CSSProperties = {
    width: '100%',
    background: 'var(--elev)',
    border: '1px solid var(--bd)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13.5,
    color: 'var(--tx)',
  };

  return (
    <form ref={formRef} onSubmit={enviar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
        Nome
        <input name="nome" required style={campo} />
        {retorno.campos?.nome && <span style={{ color: 'var(--neg-tx)', fontSize: 11.5 }}>{retorno.campos.nome}</span>}
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
        E-mail
        <input name="email" type="email" style={campo} />
        {retorno.campos?.email && <span style={{ color: 'var(--neg-tx)', fontSize: 11.5 }}>{retorno.campos.email}</span>}
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
        Telefone
        <input name="telefone" style={campo} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--tx2)' }}>
        Mensagem
        <textarea name="mensagem" rows={3} style={campo} />
      </label>

      <button
        type="submit"
        disabled={retorno.tipo === 'enviando'}
        style={{
          cursor: 'pointer',
          background: 'var(--gold)',
          color: 'var(--on-gold)',
          border: 'none',
          borderRadius: 8,
          padding: '11px 16px',
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {retorno.tipo === 'enviando' ? 'Enviando…' : 'Enviar'}
      </button>

      {retorno.texto && (
        <p
          role={retorno.tipo === 'erro' ? 'alert' : 'status'}
          data-testid="retorno-formulario"
          style={{ fontSize: 12.5, color: retorno.tipo === 'erro' ? 'var(--neg-tx)' : 'var(--ok-tx)' }}
        >
          {retorno.texto}
        </p>
      )}
    </form>
  );
}

/**
 * Botão que abre o formulário.
 *
 * Registra `form_open` — que é um evento de INTERESSE, não de envio. O painel
 * mostra os dois separados justamente para que ninguém confunda abrir com enviar.
 */
export function BotaoAbrirFormulario() {
  return (
    <button
      type="button"
      data-track-id="cta-form-teste"
      data-track-sub="form_open"
      data-track-pos="Conteúdo"
      onClick={() => {
        document.getElementById('formulario')?.scrollIntoView({ behavior: 'smooth' });
      }}
      style={{
        cursor: 'pointer',
        background: 'var(--elev)',
        border: '1px solid var(--bd)',
        color: 'var(--tx)',
        borderRadius: 8,
        padding: '11px 16px',
        fontSize: 14,
      }}
    >
      Solicitar proposta
    </button>
  );
}
