import Link from 'next/link';
import { Tabela, type Coluna } from '@/components/Tabela';
import { EstadoVazio } from '@/components/EstadoVazio';
import { PaginaDoSinal, SiteInteiro } from '@/components/PaginaDoSinal';
import { SituacaoTarefa } from '@/components/Tarefas';
import { PRIORIDADE_LABEL, type Tarefa } from '@/lib/tarefas';
import { dataHora } from '@/lib/formato';

/**
 * Tabela de tarefas, compartilhada por Otimizações e pelo painel do cliente.
 * A coluna do cliente some quando a tela já é a de UM cliente.
 */
export function TabelaDeTarefas({ tarefas, comCliente = true }: { tarefas: Tarefa[]; comCliente?: boolean }) {
  const colunas: Coluna<Tarefa>[] = [
    {
      chave: 'prioridade', titulo: '!', mono: true,
      render: (t) => <span style={{ color: t.prioridade === 1 ? 'var(--neg-tx)' : 'var(--tx3)' }}>{PRIORIDADE_LABEL[t.prioridade]}</span>,
    },
    {
      chave: 'tarefa', titulo: 'Tarefa', quebraLinha: true,
      render: (t) => (
        <>
          <span>{t.titulo}</span>
          {t.descricao && <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{t.descricao}</span>}
        </>
      ),
    },
    {
      chave: 'onde', titulo: comCliente ? 'Cliente e site' : 'Site',
      render: (t) => (
        <>
          <Link href={`/sites/${t.siteId}/qualidade`}>{t.site}</Link>
          {comCliente && <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{t.cliente}</span>}
        </>
      ),
    },
    {
      chave: 'problema', titulo: 'Problema', quebraLinha: true,
      render: (t) =>
        t.sinal ? (
          <>
            <span style={{ fontSize: 'var(--tipo-legenda)' }}>{t.sinal.titulo}</span>
            <span style={{ display: 'block' }}>
              {t.sinal.url ? <PaginaDoSinal url={t.sinal.url} dispositivo={t.sinal.dispositivo} /> : <SiteInteiro />}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--tx3)', fontSize: 'var(--tipo-legenda)' }}>avulsa</span>
        ),
    },
    {
      chave: 'prazo', titulo: 'Prazo', mono: true,
      render: (t) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{t.prazo ? t.prazo.split('-').reverse().join('/') : '—'}</span>,
    },
    { chave: 'status', titulo: 'Situação', quebraLinha: true, render: (t) => <SituacaoTarefa tarefa={t} /> },
    {
      chave: 'quando', titulo: 'Criada',
      render: (t) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{dataHora(t.criadaEm)}</span>,
    },
  ];

  return (
    <Tabela
      colunas={colunas}
      linhas={tarefas}
      chave={(t) => t.id}
      vazio={
        <EstadoVazio
          icone="arquivo"
          titulo="Nenhuma tarefa aberta"
          explicacao="Tarefa é o que alguém decidiu fazer sobre um problema. Crie uma a partir de um item da lista de problemas — concluir a tarefa oferece a reanálise, e é a medição que fecha o problema."
        />
      }
    />
  );
}
