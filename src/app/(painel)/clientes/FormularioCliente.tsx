'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Campo, BotaoSubmeter, BotaoSecundario, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { salvarCliente } from './acoes';

export type ClienteEditavel = { id: string; name: string; notes: string | null };

export function FormularioCliente({ emEdicao }: { emEdicao?: ClienteEditavel }) {
  const [estado, acao] = useActionState(salvarCliente, ESTADO_VAZIO);
  const [aberto, setAberto] = useState(!!emEdicao);
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa o formulário depois de um cadastro novo, para não reenviar o mesmo
  // cliente por engano ao clicar de novo.
  useEffect(() => {
    if (estado.ok && !emEdicao) formRef.current?.reset();
  }, [estado.ok, emEdicao]);

  if (!aberto) {
    return <BotaoSecundario onClick={() => setAberto(true)}>+ Novo cliente</BotaoSecundario>;
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
        borderRadius: 'var(--raio-m)',
        padding: 16,
        background: 'var(--elev)',
        minWidth: 280,
      }}
    >
      {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
      <Campo nome="nome" rotulo="Nome do cliente" required defaultValue={emEdicao?.name} erro={estado.campos?.nome} />
      <Campo
        nome="observacoes"
        rotulo="Observações"
        defaultValue={emEdicao?.notes ?? ''}
        dica="Opcional. Contexto interno sobre a conta."
        erro={estado.campos?.observacoes}
      />
      <Retorno estado={estado} />
      <div style={{ display: 'flex', gap: 8 }}>
        <BotaoSubmeter>{emEdicao ? 'Salvar alterações' : 'Cadastrar cliente'}</BotaoSubmeter>
        {!emEdicao && <BotaoSecundario onClick={() => setAberto(false)}>Cancelar</BotaoSecundario>}
      </div>
    </form>
  );
}
