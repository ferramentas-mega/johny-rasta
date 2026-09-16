'use client';

import { useActionState } from 'react';
import { Etiqueta } from '@/components/Tabela';
import { ehStatusManual, STATUS_LABEL, STATUS_MANUAIS, type Otimizacao } from '@/lib/otimizacoes';
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

  /*
   * O item foi FECHADO pela medição e o sinal está aqui de novo.
   *
   * Só acontece de um jeito: a página foi corrigida, a medição confirmou, o
   * acompanhamento fechou — e depois regrediu. A linha volta pelo `left join`
   * com o status guardado, e sem este caso a tela mentia duas vezes: a etiqueta
   * dizia "Resolvida por verificação" com o problema de pé, e o `<select>` caía
   * em "Pendente" (porque `resolvida_por_verificacao` não é opção de ninguém),
   * mostrando duas situações contraditórias na mesma célula.
   */
  const reabertoPeloSinal = !ehStatusManual(item.status);

  return (
    <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="hidden" name="siteId" value={item.siteId} />
      <input type="hidden" name="tipo" value={item.tipo} />
      <input type="hidden" name="titulo" value={item.titulo} />
      <input type="hidden" name="url" value={item.url ?? ''} />
      {/* Parte da identidade do sinal: sem ele, celular e computador da mesma
          página compartilhariam uma linha de acompanhamento só. */}
      <input type="hidden" name="dispositivo" value={item.dispositivo ?? ''} />
      <input type="hidden" name="proximaAcao" value={item.proximaAcao} />
      {/* A evidência do momento da marcação vira o "antes" do par que o
          fechamento por verificação vai guardar. Depois não dá para lê-la: o
          que causou o sinal já não existe. */}
      <input type="hidden" name="evidencia" value={item.evidencia} />

      {/* A etiqueta só aparece quando diz algo que o seletor NÃO diz.
          Antes ela vinha sempre, e a célula mostrava "Pendente" duas vezes —
          uma na etiqueta, outra no `<select>` logo abaixo —, parecendo dois
          controles com o mesmo valor. O seletor já carrega a situação atual;
          "Voltou a ser detectada" é o único estado que ele não consegue
          exibir, porque não é opção de ninguém. */}
      {reabertoPeloSinal && <Etiqueta texto="Voltou a ser detectada" tom="warn" />}

      <select
        name="status"
        // Reaberto não tem opção correspondente: o seletor começa sem escolha,
        // em vez de exibir "Pendente" como se alguém tivesse decidido isso.
        defaultValue={reabertoPeloSinal ? '' : item.status}
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
        {reabertoPeloSinal && (
          <option value="" disabled>
            Escolha a situação
          </option>
        )}
        {STATUS_MANUAIS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>

      {reabertoPeloSinal && (
        <span style={{ fontSize: 10.5, color: 'var(--warn-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          Este item já tinha sido fechado por medição, e o sinal voltou a ser detectado. O
          fechamento anterior continua registrado em &quot;Fechadas pela medição&quot;, com a data —
          ele aconteceu; o problema é que voltou.
        </span>
      )}

      {resolvidaMasPersiste && (
        <span style={{ fontSize: 10.5, color: 'var(--warn-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          Marcada como resolvida, mas o sinal continua sendo detectado. Ela sai da lista sozinha
          quando a próxima medição não encontrar mais o problema.
        </span>
      )}

      {/* Três desfechos, três cores. O aviso existe porque "registrei a situação
          mas NÃO consegui enfileirar a análise" não é sucesso nem erro — e
          calar essa metade transformaria uma promessa quebrada em confirmação
          silenciosa. */}
      {estado.erro && (
        <span role="alert" style={{ fontSize: 10.5, color: 'var(--neg-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          {estado.erro}
        </span>
      )}
      {estado.aviso && (
        <span role="status" style={{ fontSize: 10.5, color: 'var(--warn-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          {estado.aviso}
        </span>
      )}
      {estado.ok && (
        <span role="status" style={{ fontSize: 10.5, color: 'var(--pos-tx)', lineHeight: 1.5, maxWidth: 190 }}>
          {estado.ok}
        </span>
      )}
    </form>
  );
}
