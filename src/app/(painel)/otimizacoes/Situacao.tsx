'use client';

import { useActionState } from 'react';
import { Etiqueta } from '@/components/Tabela';
import { STATUS_LABEL, STATUS_MANUAIS, type Otimizacao } from '@/lib/otimizacoes';
import { marcarSituacao, type EstadoOtimizacao } from './acoes';

/**
 * A situação de um item, e como mudá-la.
 *
 * Antes isto era só uma etiqueta — e ela dizia "Pendente" para sempre, porque
 * nada no projeto escrevia em `optimizations`. Os outros quatro status existiam
 * no tipo, no rótulo e no `check` da tabela, e eram inalcançáveis.
 *
 * **A marcação não faz o item sumir**, e o texto abaixo diz isso quando alguém
 * marca resolvida com o sinal ainda de pé. Some quando a causa sumir, e aí a
 * própria ausência é a prova — esconder por decreto seria o mesmo
 * `configurado: true` que este projeto recusa em todo lugar.
 */
export function Situacao({ item }: { item: Otimizacao }) {
  const [estado, acao] = useActionState(marcarSituacao, {} as EstadoOtimizacao);

  const resolvidaMasPersiste = item.status === 'resolvida_manual';

  return (
    <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="hidden" name="siteId" value={item.siteId} />
      <input type="hidden" name="tipo" value={item.tipo} />
      <input type="hidden" name="titulo" value={item.titulo} />
      <input type="hidden" name="url" value={item.url ?? ''} />
      <input type="hidden" name="proximaAcao" value={item.proximaAcao} />

      <Etiqueta
        texto={STATUS_LABEL[item.status] ?? item.status}
        tom={item.status === 'pendente' ? 'soft' : 'ok'}
      />

      <select
        name="status"
        defaultValue={item.status}
        aria-label={`Situação de "${item.titulo}"`}
        // Submete na troca: um botão "salvar" por linha encheria a tabela de
        // controles para uma escolha que é sempre de um clique.
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        style={{
          background: 'var(--elev)',
          border: '1px solid var(--bd)',
          borderRadius: 6,
          padding: '4px 6px',
          fontSize: 11.5,
          color: 'var(--tx)',
          maxWidth: 190,
        }}
      >
        {STATUS_MANUAIS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      {resolvidaMasPersiste && (
        <span style={{ fontSize: 10.5, color: 'var(--warn-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          Marcada como resolvida, mas o sinal continua sendo detectado. Ela sai da lista sozinha
          quando a próxima medição não encontrar mais o problema.
        </span>
      )}

      {estado.erro && (
        <span role="alert" style={{ fontSize: 10.5, color: 'var(--neg)' }}>
          {estado.erro}
        </span>
      )}
    </form>
  );
}
