'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Campo, Selecao, BotaoSubmeter, BotaoSecundario, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { salvarSite } from './acoes';
import { FUSOS } from '@/lib/fusos';

export type SiteEditavel = { id: string; name: string; domain: string; timezone: string; clientId: string };


export function FormularioSite({
  clientes,
  emEdicao,
}: {
  clientes: { id: string; name: string }[];
  emEdicao?: SiteEditavel;
}) {
  const [estado, acao] = useActionState(salvarSite, ESTADO_VAZIO);
  const [aberto, setAberto] = useState(!!emEdicao);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok && !emEdicao) formRef.current?.reset();
  }, [estado.ok, emEdicao]);

  if (clientes.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
        Cadastre um cliente antes: todo site pertence a um cliente.
      </p>
    );
  }

  if (!aberto) {
    return <BotaoSecundario onClick={() => setAberto(true)}>+ Novo site</BotaoSecundario>;
  }

  return (
    <form
      ref={formRef}
      action={acao}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: '1px solid var(--bd)',
        borderRadius: 10,
        padding: 16,
        background: 'var(--elev)',
        minWidth: 300,
      }}
    >
      {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
      <Selecao
        nome="clienteId"
        rotulo="Cliente"
        padrao={emEdicao?.clientId}
        erro={estado.campos?.clienteId}
        opcoes={clientes.map((c) => ({ valor: c.id, texto: c.name }))}
      />
      <Campo nome="nome" rotulo="Nome do site" required defaultValue={emEdicao?.name} erro={estado.campos?.nome} />
      <Campo
        nome="dominio"
        rotulo="Domínio"
        required
        placeholder="meucliente.com.br"
        defaultValue={emEdicao?.domain}
        dica="Sem http:// e sem barra final. Só este domínio pode enviar eventos."
        erro={estado.campos?.dominio}
      />
      <Selecao
        nome="fuso"
        rotulo="Fuso horário"
        padrao={emEdicao?.timezone ?? 'America/Sao_Paulo'}
        erro={estado.campos?.fuso}
        opcoes={FUSOS.map((f) => ({ valor: f, texto: f }))}
      />
      <Retorno estado={estado} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BotaoSubmeter>{emEdicao ? 'Salvar alterações' : 'Cadastrar site'}</BotaoSubmeter>
        {emEdicao ? (
          /*
           * Em edição a saída é um LINK, não um botão de estado local.
           *
           * O alvo da edição vem da URL (`?editar=<id>`), então fechar só no
           * cliente não resolve: bastaria recarregar para o formulário reabrir
           * no mesmo site. Pior, era assim que a tela ficava depois de salvar —
           * a mensagem de sucesso aparecia e o formulário continuava aberto no
           * mesmo lugar, sem nada para clicar. Parecia que a edição não tinha
           * pegado.
           */
          <Link href="/sites" style={{ fontSize: 13, color: 'var(--tx2)' }}>
            {estado.ok ? 'Voltar para a lista' : 'Cancelar'}
          </Link>
        ) : (
          <BotaoSecundario onClick={() => setAberto(false)}>Cancelar</BotaoSecundario>
        )}
      </div>
    </form>
  );
}
