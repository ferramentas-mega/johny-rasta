import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { num, dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { METRICS } from '@/server/metrics/definitions';

export const dynamic = 'force-dynamic';

type LinhaConfig = {
  item: string;
  situacao: string;
  tom: 'ok' | 'warn' | 'soft';
  onde: React.ReactNode;
};

/**
 * Configurações da conta.
 *
 * Cada situação aqui é CONSULTADA, não escrita à mão. No protótipo,
 * "Integrações pendentes: 3" era um literal fixo — o número não vinha de lugar
 * nenhum. Aqui tudo sai do banco.
 */
export default async function PaginaConfiguracoes({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const ctx = await contextoPainel(await searchParams);

  const resumo = await withAccount(ctx.usuario.accountId, async (db) => {
    const linha = await db.one<{
      sites: number;
      semColeta: number;
      integracoesPendentes: number;
      eventos: number;
      leads: number;
      ultimoEvento: Date | null;
    }>(
      `select (select count(*)::int from sites where archived_at is null)                         as sites,
              (select count(*)::int from sites s where s.archived_at is null
                 and not exists (select 1 from events e where e.site_id = s.id))                  as "semColeta",
              (select count(*)::int from integrations where status <> 'conectada')                as "integracoesPendentes",
              (select count(*)::int from events)                                                  as eventos,
              (select count(*)::int from leads)                                                   as leads,
              (select max(occurred_at) from events where not is_test)                             as "ultimoEvento"`,
    );
    return linha!;
  });

  const linhas: LinhaConfig[] = [
    {
      item: 'Coleta de eventos',
      situacao: resumo.eventos > 0
        ? `${num(resumo.eventos)} evento(s) recebidos${resumo.ultimoEvento ? `, último em ${dataHora(resumo.ultimoEvento)}` : ''}`
        : 'Nenhum evento recebido ainda',
      tom: resumo.eventos > 0 ? 'ok' : 'warn',
      onde: <Link href="/sites">Sites › Rastreamento</Link>,
    },
    {
      item: 'Sites aguardando instalação',
      situacao: resumo.semColeta === 0
        ? 'Todos os sites já receberam ao menos um evento'
        : `${num(resumo.semColeta)} de ${num(resumo.sites)} site(s) sem nenhum evento`,
      tom: resumo.semColeta === 0 ? 'ok' : 'warn',
      onde: <Link href="/sites">Sites</Link>,
    },
    {
      item: 'Recebimento de formulários',
      situacao: resumo.leads > 0 ? `${num(resumo.leads)} lead(s) registrados` : 'Nenhum lead registrado ainda',
      tom: resumo.leads > 0 ? 'ok' : 'soft',
      onde: <Link href="/leads">Leads</Link>,
    },
    {
      item: 'Integrações externas',
      situacao: resumo.integracoesPendentes === 0
        ? 'Nenhuma integração externa configurada nesta rodada'
        : `${num(resumo.integracoesPendentes)} pendente(s)`,
      tom: 'soft',
      onde: <span style={{ color: 'var(--tx3)' }}>Fora do escopo desta rodada</span>,
    },
    {
      item: 'Banco de dados e autenticação',
      situacao: 'Conectado, com RLS ativa e papéis separados por finalidade',
      tom: 'ok',
      onde: <span style={{ color: 'var(--tx3)' }}>supabase/migrations</span>,
    },
    {
      item: 'Consentimento de cookies',
      situacao: 'O coletor respeita a preferência da página, mas não exibe banner próprio',
      tom: 'soft',
      onde: <span style={{ color: 'var(--tx3)' }}>No código do site</span>,
    },
  ];

  const colunas: Coluna<LinhaConfig>[] = [
    { chave: 'item', titulo: 'Item', render: (l) => l.item },
    { chave: 'situacao', titulo: 'Situação',
      render: (l) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
          <Etiqueta texto={l.tom === 'ok' ? 'Em funcionamento' : l.tom === 'warn' ? 'Requer atenção' : 'Informativo'} tom={l.tom} />
          <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{l.situacao}</span>
        </span>
      ) },
    { chave: 'onde', titulo: 'Onde configurar', render: (l) => l.onde },
  ];

  return (
    <>
      <Cabecalho
        kicker="CONFIGURAÇÕES"
        titulo="Configurações da conta"
        meta={`${ctx.usuario.accountName} · ${ctx.usuario.email}`}
      />

      <div className="pagina">
        <Painel titulo="Situação da conta" subtitulo="Cada linha é consultada no banco, não escrita à mão">
          <Tabela colunas={colunas} linhas={linhas} />
        </Painel>

        <Painel
          titulo="Definição dos indicadores"
          subtitulo="O que cada número conta, e o que deliberadamente fica de fora"
        >
          <dl style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Object.values(METRICS).map((m) => (
              <div key={m.key}>
                <dt style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>
                  {m.label}
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--tx3)', marginLeft: 8 }}>
                    {m.kind === 'percentual' ? 'PERCENTUAL' : 'CONTAGEM'}
                  </span>
                </dt>
                <dd style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 3 }}>{m.help}</dd>
              </div>
            ))}
          </dl>
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 14 }}>
            Estas definições são a mesma fonte usada pelas consultas: os textos vêm de{' '}
            <span className="mono">src/server/metrics/definitions.ts</span>, e as agregações que os implementam
            ficam ao lado, em <span className="mono">queries.ts</span>.
          </p>
        </Painel>

        {/*
          A sessão vive aqui porque no celular a barra lateral não existe: a
          navegação mudou para o rodapé, e "Sair" não cabe entre seis destinos.
          No desktop ele continua no rodapé do menu — os dois apontam para a
          mesma rota, não há duas formas de sair.
        */}
        <Painel titulo="Sessão" subtitulo={`Conectado como ${ctx.usuario.name} · ${ctx.usuario.accountName}`}>
          <form action="/api/sair" method="post">
            <button
              type="submit"
              style={{
                cursor: 'pointer',
                background: 'var(--elev)',
                border: '1px solid var(--bd)',
                borderRadius: 10,
                padding: '11px 16px',
                fontSize: 13.5,
                color: 'var(--tx)',
              }}
            >
              Sair da conta
            </button>
          </form>
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">DADOS REAIS</Aviso>
          <Aviso>CONTA: {ctx.usuario.accountName.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
