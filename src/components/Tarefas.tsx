'use client';

import { useActionState, useState } from 'react';
import { Etiqueta } from '@/components/Tabela';
import {
  STATUS_TAREFA,
  STATUS_TAREFA_LABEL,
  STATUS_TAREFA_TOM,
  type Tarefa,
} from '@/lib/tarefas';
import type { ChaveDoSinal } from '@/lib/otimizacoes';
import { criarTarefaAction, mudarStatusTarefaAction, type EstadoTarefa } from '@/app/(painel)/otimizacoes/acoesTarefas';

const VAZIO: EstadoTarefa = {};

const campo = {
  background: 'var(--elev)', border: '1px solid var(--bd)', borderRadius: 'var(--raio-p)',
  padding: '7px 10px', fontSize: 'var(--tipo-apoio)', color: 'var(--tx)',
} as const;

/**
 * Criar tarefa a partir de um sinal (ou avulsa, sem `sinal`).
 *
 * Fechado por padrão: um formulário aberto em cada linha da tabela de
 * problemas viraria uma tela de formulários. Abre num clique, com o título já
 * sugerido pela próxima ação do sinal — que é, quase sempre, a tarefa.
 */
export function CriarTarefa({
  siteId,
  sinal,
  sugestao,
}: {
  siteId: string;
  sinal?: ChaveDoSinal;
  sugestao?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, pendente] = useActionState(criarTarefaAction, VAZIO);

  if (estado.ok && !aberto) {
    return <span role="status" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--pos-tx)' }}>{estado.ok}</span>;
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} style={{ ...campo, cursor: 'pointer', color: 'var(--gold-tx)' }}>
        + Criar tarefa
      </button>
    );
  }

  return (
    <form action={acao} onSubmit={() => setAberto(false)} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
      <input type="hidden" name="siteId" value={siteId} />
      {sinal && (
        <>
          <input type="hidden" name="sinalTipo" value={sinal.tipo} />
          <input type="hidden" name="sinalUrl" value={sinal.url ?? ''} />
          <input type="hidden" name="sinalDispositivo" value={sinal.dispositivo ?? ''} />
          <input type="hidden" name="sinalTitulo" value={sinal.titulo} />
        </>
      )}
      <input name="titulo" required maxLength={200} defaultValue={sugestao ?? ''} placeholder="O que vai ser feito" aria-label="Título da tarefa" style={campo} autoFocus />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select name="prioridade" defaultValue="2" aria-label="Prioridade" style={campo}>
          <option value="1">Alta</option>
          <option value="2">Média</option>
          <option value="3">Baixa</option>
        </select>
        <input name="prazo" type="date" aria-label="Prazo (opcional)" style={campo} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" disabled={pendente} style={{ ...campo, cursor: 'pointer', background: 'var(--gold)', color: 'var(--on-gold)', border: 'none', fontWeight: 600 }}>
          {pendente ? 'Criando…' : 'Criar'}
        </button>
        <button type="button" onClick={() => setAberto(false)} style={{ ...campo, cursor: 'pointer' }}>Cancelar</button>
      </div>
      {estado.erro && <span role="alert" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--neg-tx)' }}>{estado.erro}</span>}
    </form>
  );
}

/** Situação de uma tarefa; submete na troca. Concluir oferece a reanálise pelo servidor. */
export function SituacaoTarefa({ tarefa }: { tarefa: Tarefa }) {
  const [estado, acao] = useActionState(mudarStatusTarefaAction, VAZIO);
  return (
    <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="hidden" name="id" value={tarefa.id} />
      <select
        name="status"
        defaultValue={tarefa.status}
        // Prefixo diferente do seletor de PROBLEMA ("Situação de …"): são
        // dois controles de coisas distintas na mesma tela, e um seletor de
        // teste (ou leitor de tela) precisa distinguir tarefa de problema.
        aria-label={`Tarefa "${tarefa.titulo}": situação`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{ ...campo, maxWidth: 190 }}
      >
        {STATUS_TAREFA.map((s) => (
          <option key={s} value={s}>{STATUS_TAREFA_LABEL[s]}</option>
        ))}
      </select>
      {estado.erro && <span role="alert" style={{ fontSize: 'var(--tipo-micro)', color: 'var(--neg-tx)', maxWidth: 220, lineHeight: 1.5 }}>{estado.erro}</span>}
      {estado.aviso && <span role="status" style={{ fontSize: 'var(--tipo-micro)', color: 'var(--warn-tx)', maxWidth: 220, lineHeight: 1.5 }}>{estado.aviso}</span>}
      {estado.ok && <span role="status" style={{ fontSize: 'var(--tipo-micro)', color: 'var(--pos-tx)', maxWidth: 220, lineHeight: 1.5 }}>{estado.ok}</span>}
    </form>
  );
}

export function EtiquetaTarefa({ tarefa }: { tarefa: Tarefa }) {
  return <Etiqueta texto={STATUS_TAREFA_LABEL[tarefa.status]} tom={STATUS_TAREFA_TOM[tarefa.status]} />;
}
