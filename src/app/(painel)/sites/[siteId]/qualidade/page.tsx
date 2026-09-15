import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { obterSite, listarSites } from '@/server/services/sites';
import { ultimasAnalises, ultimosCrux, type SnapshotCrux } from '@/server/qualidade/auditoria';
import { paraCem } from '@/server/qualidade/pagespeed';
import { dataHora, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { SeletorSiteRota } from '@/components/filtros';
import { PainelDeAnalise } from './PainelDeAnalise';

export const dynamic = 'force-dynamic';

type UrlMonitorada = { id: string; url: string; prioritaria: boolean };
type Job = { id: string; url: string; strategy: string; status: string; erro: string | null; criado_em: Date };

/** 0–100 com o rótulo certo quando não há nota. Zero seria uma afirmação diferente. */
function Nota({ valor }: { valor: string | null }) {
  const n = valor === null ? null : paraCem(Number(valor));
  if (n === null) return <span style={{ color: 'var(--tx3)' }}>Indisponível</span>;
  const cor = n >= 90 ? 'var(--pos)' : n >= 50 ? 'var(--warn-tx)' : 'var(--neg)';
  return <span style={{ color: cor }}>{n}</span>;
}

function ms(valor: string | null) {
  if (valor === null) return <span style={{ color: 'var(--tx3)' }}>—</span>;
  const n = Number(valor);
  return <>{n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`}</>;
}

export default async function PaginaQualidade({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const usuario = await exigirSessao();
  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();
  const sites = await listarSites(usuario.accountId);

  const { urls, analises, fila, campo } = await withAccount(usuario.accountId, async (db) => ({
    urls: await db.query<UrlMonitorada>(
      'select id, url, prioritaria from monitored_urls where site_id = $1 order by prioritaria desc, url',
      [siteId],
    ),
    analises: await ultimasAnalises(db, siteId),
    campo: await ultimosCrux(db, siteId),
    fila: await db.query<Job>(
      `select id, url, strategy, status, erro, criado_em from audit_jobs
        where site_id = $1 order by criado_em desc limit 10`,
      [siteId],
    ),
  }));

  const configurada = !!process.env.PAGESPEED_API_KEY;

  const colunas: Coluna<(typeof analises)[number]>[] = [
    { chave: 'url', titulo: 'URL', render: (a) => <span className="mono" style={{ fontSize: 12 }}>{a.url_solicitada.replace(/^https?:\/\/[^/]+/, '') || '/'}</span> },
    { chave: 'dispositivo', titulo: 'Dispositivo', render: (a) => <Etiqueta texto={a.strategy === 'mobile' ? 'Celular' : 'Computador'} tom="soft" /> },
    { chave: 'perf', titulo: 'Desempenho', alinhamento: 'direita', mono: true, render: (a) => <Nota valor={a.performance} /> },
    { chave: 'aces', titulo: 'Acessibilidade', alinhamento: 'direita', mono: true, render: (a) => <Nota valor={a.acessibilidade} /> },
    { chave: 'bp', titulo: 'Boas práticas', alinhamento: 'direita', mono: true, render: (a) => <Nota valor={a.boas_praticas} /> },
    { chave: 'seo', titulo: 'SEO', alinhamento: 'direita', mono: true, render: (a) => <Nota valor={a.seo} /> },
    { chave: 'lcp', titulo: 'LCP', alinhamento: 'direita', mono: true, render: (a) => ms(a.lcp_ms) },
    { chave: 'tbt', titulo: 'TBT', alinhamento: 'direita', mono: true, render: (a) => ms(a.tbt_ms) },
    { chave: 'quando', titulo: 'Medido em', render: (a) => <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{dataHora(a.medido_em, site.timezone)}</span> },
  ];

  const colunasCampo: Coluna<SnapshotCrux>[] = [
    { chave: 'alvo', titulo: 'Alvo', render: (c) => (
        <>
          <span className="mono" style={{ fontSize: 11.5 }}>{c.alvo.replace(/^https?:\/\/[^/]+/, '') || c.alvo}</span>
          <span style={{ display: 'block', fontSize: 10.5, color: 'var(--tx3)' }}>
            {c.escopo === 'url' ? 'esta página' : 'origem — média do site inteiro'}
          </span>
        </>
      ) },
    { chave: 'disp', titulo: 'Dispositivo', render: (c) => <Etiqueta texto={c.form_factor === 'PHONE' ? 'Celular' : 'Computador'} tom="soft" /> },
    { chave: 'lcp', titulo: 'LCP (p75)', alinhamento: 'direita', mono: true, render: (c) => ms(c.lcp_p75_ms) },
    { chave: 'inp', titulo: 'INP (p75)', alinhamento: 'direita', mono: true, render: (c) => ms(c.inp_p75_ms) },
    { chave: 'cls', titulo: 'CLS (p75)', alinhamento: 'direita', mono: true,
      render: (c) => (c.cls_p75 === null ? <span style={{ color: 'var(--tx3)' }}>—</span> : Number(c.cls_p75).toFixed(3)) },
    { chave: 'janela', titulo: 'Janela medida', render: (c) => (
        <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>
          {c.janela_inicio && c.janela_fim
            ? `${new Date(c.janela_inicio).toLocaleDateString('pt-BR')} – ${new Date(c.janela_fim).toLocaleDateString('pt-BR')}`
            : 'Não informada'}
        </span>
      ) },
  ];

  const colunasFila: Coluna<Job>[] = [
    { chave: 'url', titulo: 'URL', render: (j) => <span className="mono" style={{ fontSize: 12 }}>{j.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span> },
    { chave: 'disp', titulo: 'Dispositivo', render: (j) => (j.strategy === 'mobile' ? 'Celular' : 'Computador') },
    { chave: 'status', titulo: 'Situação', render: (j) => (
        <Etiqueta
          texto={{ pendente: 'Na fila', executando: 'Executando', sucesso: 'Concluída', erro: 'Falhou' }[j.status] ?? j.status}
          tom={j.status === 'sucesso' ? 'ok' : j.status === 'erro' ? 'warn' : 'soft'}
        />
      ) },
    { chave: 'erro', titulo: 'Detalhe', render: (j) => <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{j.erro ?? '—'}</span> },
    { chave: 'quando', titulo: 'Pedida em', render: (j) => <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{dataHora(j.criado_em, site.timezone)}</span> },
  ];

  return (
    <>
      <Cabecalho
        kicker="QUALIDADE TÉCNICA"
        titulo={site.name}
        meta={`${num(urls.length)} URL(s) monitorada(s)`}
        filtros={<SeletorSiteRota sites={sites} atual={siteId} aba="qualidade" />}
      />
      <div className="abas"><Abas siteId={siteId} /></div>

      <div className="pagina">
        {!configurada && (
          <Painel titulo="Análise técnica não configurada" subtitulo="Falta a chave do Google neste servidor">
            <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6 }}>
              Defina <span className="mono">PAGESPEED_API_KEY</span> nas variáveis de ambiente da hospedagem.
              Enquanto não estiver definida, o botão de executar fica desligado — esta tela não exibe nota
              estimada nem resultado de exemplo.
            </p>
          </Painel>
        )}

        <PainelDeAnalise siteId={siteId} urls={urls} configurada={configurada} dominio={site.domain} />

        <Painel
          titulo="Última análise por URL e dispositivo"
          subtitulo="Celular e computador são medições distintas; uma não substitui a outra"
        >
          <Tabela colunas={colunas} linhas={analises} vazio="Nenhuma análise executada ainda." />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            As notas vêm do Lighthouse, em teste sintético — não da experiência dos seus visitantes.
            <strong> TBT não é INP</strong>: o INP real só existe em dado de campo, que depende da API do CrUX.
            A nota de SEO do Lighthouse é uma checagem técnica, não posição no Google nem auditoria completa.
            Uma análise da Home não representa as demais páginas: monitore cada URL que importa.
          </p>
        </Painel>

        <Painel
          titulo="Experiência real dos visitantes"
          subtitulo="Dado de campo do Chrome, independente das notas acima"
        >
          {campo.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--tx2)', lineHeight: 1.6 }}>
              Nenhuma leitura ainda. A experiência real é buscada junto com a análise técnica —
              execute uma análise para coletá-la.
            </p>
          ) : (
            <Tabela colunas={colunasCampo} linhas={campo} vazio="Sem leitura." />
          )}
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            Estes números vêm de visitantes reais do Chrome, não de teste sintético — e por isso o
            <strong> INP só aparece aqui</strong>: o Lighthouse não o mede.
            A janela é a que o Google devolveu (cerca de 28 dias corridos) e <strong>não muda</strong> com o
            período escolhido no painel. Leitura marcada como <em>origem</em> é a média do site inteiro, não
            daquela página: serve de referência quando a página não tem amostra própria, e está rotulada
            para não ser confundida com ela. Sem amostra em nenhum dos dois níveis, a resposta é
            "Dados insuficientes" — nunca zero.
          </p>
        </Painel>

        {fila.length > 0 && (
          <Painel titulo="Fila" subtitulo="As dez solicitações mais recentes deste site">
            <Tabela colunas={colunasFila} linhas={fila} vazio="Nenhuma solicitação." />
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
              Uma análise que falha não apaga a anterior: a última medição válida continua na tabela acima,
              com a data em que foi feita.
            </p>
          </Painel>
        )}

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom={configurada ? 'ok' : 'warn'}>
            {configurada ? 'FONTE: PAGESPEED INSIGHTS (LIGHTHOUSE)' : 'INTEGRAÇÃO NÃO CONFIGURADA'}
          </Aviso>
          <Aviso tom={campo.length ? 'ok' : 'soft'}>
            {campo.length ? 'EXPERIÊNCIA REAL: CrUX (CAMPO)' : 'EXPERIÊNCIA REAL: SEM LEITURA AINDA'}
          </Aviso>
        </footer>
      </div>
    </>
  );
}
