import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel } from '@/components/Cartoes';
import { Tabela, type Coluna } from '@/components/Tabela';
import { SeletorPeriodo } from '@/components/filtros';
import { FormularioCliente } from './FormularioCliente';

export const dynamic = 'force-dynamic';

type LinhaCliente = {
  id: string;
  nome: string;
  sites: number;
  sessoes: number;
  leads: number;
};

export default async function PaginaClientes({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const busca = await searchParams;
  const ctx = await contextoPainel(busca);

  const editandoId = typeof busca.editar === 'string' ? busca.editar : null;
  const emEdicao = ctx.clientes.find((c) => c.id === editandoId);

  // Agregado por cliente, no período selecionado, somando os sites do cliente.
  // Sai da mesma base que as telas de site — não é uma segunda contabilidade.
  const periodo = ctx.periodo;
  const linhas = periodo
    ? await withAccount(ctx.usuario.accountId, async (db) =>
        db.query<LinhaCliente>(
          `select c.id,
                  c.name as nome,
                  count(distinct s.id)::int as sites,
                  count(distinct ses.id)::int as sessoes,
                  count(distinct l.id)::int  as leads
             from clients c
             left join sites s   on s.client_id = c.id and s.archived_at is null
             left join sessions ses on ses.site_id = s.id
                                   and ses.started_at >= $1 and ses.started_at < $2
                                   and not ses.is_test
             left join leads l   on l.site_id = s.id
                                   and l.first_seen_at >= $1 and l.first_seen_at < $2
            where c.archived_at is null
            group by c.id, c.name
            order by c.name`,
          [periodo.from, periodo.to],
        ),
      )
    : [];

  const colunas: Coluna<LinhaCliente>[] = [
    { chave: 'nome', titulo: 'Cliente',
      render: (l) => (
        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'baseline' }}>
          {/* O nome leva ao painel do cliente. Antes só "editar" era link, e a
              única porta para o painel ficava na Carteira da Visão geral — a
              aba chamada Clientes não levava ao cliente. */}
          <Link href={`/clientes/${l.id}?periodo=${ctx.periodoInput.key}`}>{l.nome}</Link>
          <Link href={`/clientes?editar=${l.id}`} style={{ fontSize: 'var(--tipo-legenda)' }}>
            editar
          </Link>
        </span>
      ),
      total: () => 'Total' },
    { chave: 'sites', titulo: 'Sites', alinhamento: 'direita', mono: true,
      render: (l) => (l.sites ? <Link href={`/sites?cliente=${l.id}`}>{num(l.sites)}</Link> : '—'),
      total: (ls) => num(ls.reduce((t, l) => t + l.sites, 0)) },
    { chave: 'sessoes', titulo: 'Sessões no período', alinhamento: 'direita', mono: true,
      render: (l) => (l.sites === 0 ? <span style={{ color: 'var(--tx3)' }}>Indisponível</span> : num(l.sessoes)),
      total: (ls) => num(ls.reduce((t, l) => t + l.sessoes, 0)) },
    { chave: 'leads', titulo: 'Leads no período', alinhamento: 'direita', mono: true,
      render: (l) => (l.sites === 0 ? <span style={{ color: 'var(--tx3)' }}>Indisponível</span> : num(l.leads)),
      total: (ls) => num(ls.reduce((t, l) => t + l.leads, 0)) },
  ];

  return (
    <>
      <Cabecalho
        kicker="CLIENTES"
        titulo="Clientes"
        meta={`${ctx.clientes.length} cliente(s) · ${ctx.periodo?.label ?? ''}`}
        filtros={<SeletorPeriodo atual={ctx.periodoInput.key} />}
      />

      <div className="pagina">
        <Painel
          titulo="Carteira de clientes"
          subtitulo="Cada site pertence a um cliente. Cadastre o cliente primeiro."
          acoes={
            <FormularioCliente
              key={emEdicao?.id ?? 'novo'}
              emEdicao={emEdicao ? { id: emEdicao.id, name: emEdicao.name, notes: emEdicao.notes } : undefined}
            />
          }
        >
          <Tabela colunas={colunas} linhas={linhas} vazio="Nenhum cliente cadastrado ainda." />
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
            Clientes sem site aparecem como "Indisponível": não há o que medir antes de existir um site com
            rastreamento. O vínculo cliente → site é validado no servidor e no banco.
          </p>
        </Painel>
      </div>
    </>
  );
}
