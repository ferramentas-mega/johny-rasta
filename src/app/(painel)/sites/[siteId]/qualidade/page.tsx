import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { obterSite, listarSites } from '@/server/services/sites';
import {
  historicoDeAnalises,
  historicoDeCampo,
  ultimasAnalises,
  ultimasAuditorias,
  ultimosCrux,
  type SnapshotCrux,
} from '@/server/qualidade/auditoria';
import { paraCem } from '@/server/qualidade/pagespeed';
import { dataHora, duracaoMs, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { SeletorSiteRota } from '@/components/filtros';
import { Correcoes } from '@/components/Correcoes';
import { Evidencias, type SerieDeEvidencia } from '@/components/Evidencias';
import { PainelDeAnalise } from './PainelDeAnalise';

export const dynamic = 'force-dynamic';

/**
 * Quantas medições cada série mostra.
 *
 * Teto para a tela não crescer sem limite num site monitorado há meses — e a
 * própria série diz "12 de 37" quando corta, porque lista cortada em silêncio
 * parece completa.
 */
const MEDICOES_NA_EVIDENCIA = 12;

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
  return <>{duracaoMs(Number(valor))}</>;
}

export default async function PaginaQualidade({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const usuario = await exigirSessao();
  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();
  const sites = await listarSites(usuario.accountId);

  const { urls, analises, auditorias, historico, campoHistorico, fila, campo } =
    await withAccount(usuario.accountId, async (db) => ({
    urls: await db.query<UrlMonitorada>(
      'select id, url, prioritaria from monitored_urls where site_id = $1 order by prioritaria desc, url',
      [siteId],
    ),
    analises: await ultimasAnalises(db, siteId),
    auditorias: await ultimasAuditorias(db, siteId),
    historico: await historicoDeAnalises(db, siteId, MEDICOES_NA_EVIDENCIA),
    campoHistorico: await historicoDeCampo(db, siteId, MEDICOES_NA_EVIDENCIA),
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

  /**
   * As séries de laboratório, uma por (URL, dispositivo) e por métrica.
   *
   * Nota e LCP viram séries separadas porque a direção de cada uma é oposta:
   * nota subindo é melhora, LCP subindo é piora. Uma série só, com as duas,
   * teria de escolher uma direção e mentir sobre a outra.
   */
  const dePar = new Map<string, typeof historico.pontos>();
  for (const p of historico.pontos) {
    const chave = `${p.url_solicitada}|${p.strategy}`;
    dePar.set(chave, [...(dePar.get(chave) ?? []), p]);
  }

  const caminho = (url: string) => url.replace(/^https?:\/\/[^/]+/, '') || '/';
  const aparelho = (s: string) => (s === 'mobile' ? 'celular' : 'computador');

  const seriesLaboratorio: SerieDeEvidencia[] = [...dePar.entries()].flatMap(([chave, pontos]) => {
    const [url, strategy] = chave.split('|') as [string, string];
    const total = historico.totais.get(chave);
    const base = { subtitulo: `${caminho(url)} · ${aparelho(strategy)}`, total };
    return [
      {
        ...base,
        chave: `${chave}|nota`,
        titulo: 'Desempenho',
        unidade: 'nota' as const,
        maiorEhMelhor: true,
        // `paraCem` e não `* 100` solto: a conversão de 0–1 para 0–100 mora num
        // lugar só, e ela devolve null quando não há nota.
        pontos: pontos.map((p) => ({
          valor: p.performance === null ? null : paraCem(Number(p.performance)),
          em: p.medido_em,
        })),
      },
      {
        ...base,
        chave: `${chave}|lcp`,
        titulo: 'LCP (laboratório)',
        unidade: 'ms' as const,
        maiorEhMelhor: false,
        pontos: pontos.map((p) => ({
          valor: p.lcp_ms === null ? null : Number(p.lcp_ms),
          em: p.medido_em,
        })),
      },
    ];
  });

  /** As de campo, separadas das de laboratório — e nunca no mesmo painel. */
  const deAlvo = new Map<string, typeof campoHistorico>();
  for (const p of campoHistorico) {
    const chave = `${p.alvo}|${p.escopo}|${p.form_factor}`;
    deAlvo.set(chave, [...(deAlvo.get(chave) ?? []), p]);
  }

  const seriesCampo: SerieDeEvidencia[] = [...deAlvo.entries()].flatMap(([chave, pontos]) => {
    const primeiro = pontos[0]!;
    const escopo = primeiro.escopo === 'url' ? 'esta página' : 'origem — site inteiro';
    const base = {
      subtitulo: `${caminho(primeiro.alvo)} · ${primeiro.form_factor === 'PHONE' ? 'celular' : 'computador'} · ${escopo}`,
      maiorEhMelhor: false,
      unidade: 'ms' as const,
    };
    return [
      {
        ...base,
        chave: `${chave}|lcp`,
        titulo: 'LCP (campo, p75)',
        pontos: pontos.map((p) => ({
          valor: p.lcp_p75_ms === null ? null : Number(p.lcp_p75_ms),
          em: p.coletado_em,
        })),
      },
      {
        ...base,
        chave: `${chave}|inp`,
        titulo: 'INP (campo, p75)',
        pontos: pontos.map((p) => ({
          valor: p.inp_p75_ms === null ? null : Number(p.inp_p75_ms),
          em: p.coletado_em,
        })),
      },
    ];
  });

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
          titulo="Evidências de desempenho"
          subtitulo="A série de medições por trás de cada afirmação — laboratório"
        >
          <Evidencias series={seriesLaboratorio} />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 12, lineHeight: 1.6 }}>
            Cada linha é a sequência de análises daquela página naquele dispositivo, do mais antigo
            para o mais recente. <strong>Medição ausente interrompe a linha</strong> em vez de descer
            até o chão: falta de medição não é desempenho zero.
            A régua vertical é a faixa da própria série, não 0–100 — é o que torna visível uma
            diferença de quatro pontos, e é por isso que os extremos vêm escritos embaixo.
            Uma medição só não tem variação: a resposta é &quot;sem base comparável&quot;, nunca 0.
            E a série <strong>não explica</strong> o que mudou entre duas medições — ela mostra que
            mudou, e quando.
          </p>
        </Painel>

        {seriesCampo.length > 0 && (
          <Painel
            titulo="Evidências de experiência real"
            subtitulo="A mesma série, do lado do campo — e nunca misturada com a de laboratório"
          >
            <Evidencias series={seriesCampo} />
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 12, lineHeight: 1.6 }}>
              Painel separado de propósito: neste projeto a mesma página deu LCP de 12,0 s no
              laboratório e 3,2 s no campo, e os dois estão certos. Pôr as duas séries no mesmo
              gráfico faria uma parecer correção da outra.
              Cada ponto é uma janela de cerca de 28 dias do CrUX, então pontos vizinhos
              <strong> compartilham visitantes</strong> — a linha se move mais devagar que a de
              laboratório, e isso é da medição, não do site.
            </p>
          </Painel>
        )}

        <Painel
          titulo="Correções elegíveis"
          subtitulo="O que o Lighthouse reprovou em cada página e dispositivo, e quanto ele estima de ganho"
        >
          <Correcoes
            analises={auditorias.map((a) => ({
              url: a.url_solicitada,
              dispositivo: a.strategy,
              auditorias: a.auditorias,
            }))}
          />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 12, lineHeight: 1.6 }}>
            <strong>As economias não se somam.</strong> Cada estimativa é o ganho daquela correção
            sozinha, contra esta mesma execução — corrigir duas coisas não economiza a soma das
            duas, porque elas disputam o mesmo caminho crítico. Por isso o resumo mostra a maior
            estimativa, nunca o total.
            Correção sem estimativa continua na lista, depois das quantificadas: o Lighthouse não
            estimou aquele ganho, e <strong>não estimar não é estimar zero</strong> — pode ser a
            correção mais importante da página.
            Tudo aqui é medição de laboratório daquela execução, como as notas acima: diz o que
            melhoraria no teste, não o que seus visitantes vão sentir.
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
