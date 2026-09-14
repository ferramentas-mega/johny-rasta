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
  const ctx = await contextoPainel(await searchParams);

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
    { chave: 'nome', titulo: 'Cliente', render: (l) => l.nome, total: () => 'Total' },
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

      <div className="pagina" style={{ padding: '22px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Painel
          titulo="Carteira de clientes"
          subtitulo="Cada site pertence a um cliente. Cadastre o cliente primeiro."
          acoes={<FormularioCliente />}
        >
          <Tabela colunas={colunas} linhas={linhas} vazio="Nenhum cliente cadastrado ainda." />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Clientes sem site aparecem como "Indisponível": não há o que medir antes de existir um site com
            rastreamento. O vínculo cliente → site é validado no servidor e no banco.
          </p>
        </Painel>
      </div>
    </>
  );
}
