import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { getFunilDeLeads } from '@/server/metrics/queries';
import { num, dataHora, mascararEmail } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { Funil, ForaDoFunil } from '@/components/Funil';
import { Tabela, type Coluna } from '@/components/Tabela';
import { SeletorPeriodo, SeletorSite } from '@/components/filtros';

export const dynamic = 'force-dynamic';

type LinhaLead = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  site: string;
  cliente: string;
  primeiroEm: Date;
  envios: number;
  formularios: string;
  origem: string | null;
};

/**
 * Leads recebidos.
 *
 * Lead é submissão CONFIRMADA, deduplicada por e-mail ou telefone dentro do
 * site. Clique no WhatsApp não vira lead: o painel não tem como saber se a
 * conversa aconteceu, então não inventa.
 */
export default async function PaginaLeads({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const ctx = await contextoPainel(await searchParams);
  const periodo = ctx.periodo;
  const site = ctx.site;

  if (!site || !periodo) {
    return (
      <>
        <Cabecalho kicker="LEADS" titulo="Leads" />
        <div className="pagina">
          <Painel titulo="Nenhum site cadastrado" subtitulo="Leads chegam pelos formulários dos sites.">
            <Link href="/sites">Cadastrar um site →</Link>
          </Painel>
        </div>
      </>
    );
  }

  // Uma transação só, sequencial: as duas consultas compartilham a mesma conexão
  // e o driver `pg` não aceita duas simultâneas no mesmo client.
  const { linhas, funil } = await withAccount(ctx.usuario.accountId, async (db) => {
    const funil = await getFunilDeLeads(db, site, periodo);
    const linhas = await db.query<LinhaLead>(
      `select l.id,
              l.name  as nome,
              l.email,
              l.phone as telefone,
              s.name  as site,
              c.name  as cliente,
              l.first_seen_at as "primeiroEm",
              count(fs.id)::int as envios,
              coalesce(string_agg(distinct fs.form_name, ', '), '—') as formularios,
              max(ses.source) as origem
         from leads l
         join sites s   on s.id = l.site_id
         join clients c on c.id = l.client_id
         left join form_submissions fs on fs.lead_id = l.id and fs.status = 'confirmada' and not fs.is_test
         left join sessions ses on ses.id = fs.session_id
        where l.site_id = $1
          and l.first_seen_at >= $2
          and l.first_seen_at <  $3
        group by l.id, l.name, l.email, l.phone, s.name, c.name, l.first_seen_at
        order by l.first_seen_at desc
        limit 200`,
      [site.id, periodo.from, periodo.to],
    );
    return { linhas, funil };
  });

  const colunas: Coluna<LinhaLead>[] = [
    { chave: 'quando', titulo: 'Recebido em', mono: true, render: (l) => dataHora(l.primeiroEm),
      total: () => `${linhas.length} lead(s)` },
    { chave: 'nome', titulo: 'Contato',
      render: (l) => (
        <span>
          <span style={{ display: 'block' }}>{l.nome ?? '—'}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>
            {mascararEmail(l.email) }{l.telefone ? ` · ${l.telefone.replace(/\d(?=\d{4})/g, '*')}` : ''}
          </span>
        </span>
      ) },
    { chave: 'site', titulo: 'Site / cliente',
      render: (l) => (
        <span>
          <span style={{ display: 'block' }}>{l.site}</span>
          <span style={{ fontSize: 11, color: 'var(--tx3)' }}>{l.cliente}</span>
        </span>
      ) },
    { chave: 'origem', titulo: 'Origem', render: (l) => l.origem ?? 'Não identificada' },
    { chave: 'formularios', titulo: 'Formulário', render: (l) => l.formularios },
    { chave: 'envios', titulo: 'Envios', alinhamento: 'direita', mono: true,
      ajuda: 'Quantas submissões confirmadas este mesmo contato fez. Mais de uma não cria um segundo lead.',
      render: (l) => num(l.envios),
      total: (ls) => num(ls.reduce((t, l) => t + l.envios, 0)) },
  ];

  return (
    <>
      <Cabecalho
        kicker="LEADS"
        titulo="Leads recebidos"
        meta={`${site.name} · ${periodo.label}`}
        filtros={
          <>
            <SeletorSite sites={ctx.sites} atual={site.id} />
            <SeletorPeriodo atual={ctx.periodoInput.key} />
          </>
        }
      />

      <div className="pagina">
        <Painel
          kicker="QUALIDADE DOS LEADS"
          titulo="De visita a contato"
          subtitulo="Cada etapa está contida na anterior, e todas contam SESSÕES — não pessoas, não envios."
          acoes={
            <Link href={`/sites/${site.id}/comportamento${ctx.busca}`}>Ver comportamento →</Link>
          }
        >
          <Funil funil={funil} />
          <ForaDoFunil funil={funil} />
          {/* A ressalva não é rodapé legal: é o erro de leitura mais provável
              desta tela. Ver queda entre duas etapas e concluir "o formulário
              está ruim" é justamente o que o painel não pode afirmar. */}
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 14, lineHeight: 1.5 }}>
            O funil conta quantas sessões chegaram a cada ponto. Ele não diz por que as outras
            pararam — para isso é preciso olhar as páginas, os botões e a qualidade técnica do site,
            que ficam em abas próprias.
          </p>
        </Painel>

        <Painel
          titulo="Contatos recebidos"
          subtitulo={`Derivados das submissões confirmadas de ${site.name}`}
          acoes={<Link href={`/sites/${site.id}/desempenho${ctx.busca}`}>Ver desempenho do site →</Link>}
        >
          <Tabela
            colunas={colunas}
            linhas={linhas}
            vazio="Nenhum lead neste site e período."
          />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Contatos ficam mascarados nesta listagem. O total de envios pode ser maior que o número de leads: o
            mesmo contato enviando duas vezes continua sendo um lead só.
          </p>
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: FORMULÁRIOS CONFIRMADOS</Aviso>
          <Aviso>PERÍODO: {periodo.label.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
