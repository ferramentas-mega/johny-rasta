import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarSites, obterSite, ESTADO_LABEL } from '@/server/services/sites';
import { getKpis, getDailySeries, getByPage, getByButton, getBySource, resolvePeriod } from '@/server/metrics/queries';
import { parsePeriodParams, periodLabel } from '@/lib/periodo';
import { METRICS } from '@/server/metrics/definitions';
import { num, pct, variacao, dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { CartaoIndicador, Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { Grafico } from '@/components/Grafico';
import { SeletorPeriodo, SeletorSiteRota, IntervaloPersonalizado } from '@/components/filtros';
import type { PageRow, ButtonRow, SourceRow } from '@/server/metrics/queries';

export const dynamic = 'force-dynamic';

const SUBTIPO_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  phone: 'Telefone',
  email: 'E-mail',
  form_open: 'Abertura de formulário',
  outro: 'Outro',
};

const soma = <T,>(linhas: T[], campo: (l: T) => number) => linhas.reduce((t, l) => t + campo(l), 0);

export default async function PaginaDesempenho({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirSessao();
  const { siteId } = await params;
  const busca = await searchParams;

  // Site de outra conta não existe para esta sessão: a RLS não devolve a linha.
  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();

  const sites = await listarSites(usuario.accountId);
  const entrada = parsePeriodParams({
    periodo: typeof busca.periodo === 'string' ? busca.periodo : null,
    de: typeof busca.de === 'string' ? busca.de : null,
    ate: typeof busca.ate === 'string' ? busca.ate : null,
  });

  const dados = await withAccount(usuario.accountId, async (db) => {
    const bruto = await resolvePeriod(db, site.timezone, entrada);
    const periodo = { ...bruto, label: periodLabel(bruto) };
    // Uma transação = uma conexão. As consultas vão em sequência.
    const kpis = await getKpis(db, site, periodo);
    const serie = await getDailySeries(db, site, periodo);
    const paginas = await getByPage(db, site, periodo);
    const botoes = await getByButton(db, site, periodo);
    const origens = await getBySource(db, site, periodo);
    return { periodo, kpis, serie, paginas, botoes, origens };
  });

  const { periodo, kpis, serie, paginas, botoes, origens } = dados;
  const { atual, anterior } = kpis;
  const semColeta = site.totalEventos === 0;

  const colunasPagina: Coluna<PageRow>[] = [
    { chave: 'path', titulo: 'Página', render: (l) => l.path, mono: true,
      total: () => `${paginas.length} página(s)` },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true,
      ajuda: 'Sessões que viram esta página. Uma sessão que passou por duas páginas conta nas duas linhas, por isso esta coluna não soma o total de sessões do período.',
      render: (l) => num(l.sessoes), total: (ls) => num(soma(ls, (l) => l.sessoes)) },
    { chave: 'visualizacoes', titulo: 'Visualizações', alinhamento: 'direita', mono: true,
      render: (l) => num(l.visualizacoes), total: (ls) => num(soma(ls, (l) => l.visualizacoes)) },
    { chave: 'cta', titulo: 'Cliques em CTA', alinhamento: 'direita', mono: true,
      ajuda: 'Todos os cliques em elementos marcados, incluindo abertura de formulário. Mesmo escopo da tabela por botão — os dois totais fecham.',
      render: (l) => num(l.cliquesCta), total: (ls) => num(soma(ls, (l) => l.cliquesCta)) },
    { chave: 'formularios', titulo: 'Formulários', alinhamento: 'direita', mono: true,
      render: (l) => num(l.formularios), total: (ls) => num(soma(ls, (l) => l.formularios)) },
  ];

  const colunasBotao: Coluna<ButtonRow>[] = [
    { chave: 'texto', titulo: 'Botão', render: (l) => <span title={`data-track-id: ${l.buttonId}`}>{l.texto}</span>,
      total: () => `${botoes.length} botão(ões)` },
    { chave: 'pagina', titulo: 'Página', mono: true, render: (l) => l.pagina },
    { chave: 'acao', titulo: 'Ação', render: (l) => <Etiqueta texto={SUBTIPO_LABEL[l.subtipo] ?? l.subtipo} tom={l.subtipo === 'form_open' ? 'warn' : 'ok'} /> },
    { chave: 'posicao', titulo: 'Posição', render: (l) => l.posicao },
    { chave: 'cliques', titulo: 'Cliques', alinhamento: 'direita', mono: true,
      ajuda: 'Mesmo escopo da coluna "Cliques em CTA" da tabela por página.',
      render: (l) => num(l.cliques), total: (ls) => num(soma(ls, (l) => l.cliques)) },
  ];

  const colunasOrigem: Coluna<SourceRow>[] = [
    { chave: 'origem', titulo: 'Origem / mídia', render: (l) => l.origem, total: () => 'Total' },
    { chave: 'campanha', titulo: 'Campanha', render: (l) => l.campanha },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true,
      render: (l) => num(l.sessoes), total: (ls) => num(soma(ls, (l) => l.sessoes)) },
    { chave: 'formularios', titulo: 'Formulários', alinhamento: 'direita', mono: true,
      render: (l) => num(l.formularios), total: (ls) => num(soma(ls, (l) => l.formularios)) },
  ];

  return (
    <>
      <Cabecalho
        kicker="DESEMPENHO DOS SEUS SITES"
        titulo={site.name}
        estado={{
          tipo: site.estado,
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento, site.timezone)}` : undefined,
        }}
        meta={`Fuso do site: ${site.timezone} · datas armazenadas em UTC`}
        filtros={
          <>
            <SeletorSiteRota sites={sites} atual={site.id} aba="desempenho" />
            <SeletorPeriodo atual={entrada.key} />
          </>
        }
      />

      <div className="abas">
        <Abas siteId={site.id} />
      </div>

      <div className="pagina">
        {entrada.key === 'personalizado' && (
          <IntervaloPersonalizado de={entrada.de ?? ''} ate={entrada.ate ?? ''} />
        )}

        {semColeta ? (
          <Painel
            titulo="Este site ainda não recebeu eventos"
            subtitulo={`Situação: ${ESTADO_LABEL[site.estado]}. Enquanto nenhum evento chegar, o painel não exibe números — nem zeros estimados.`}
          >
            <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
              Instale o script na aba <strong>Rastreamento</strong> e abra o site uma vez para validar a coleta.
            </p>
          </Painel>
        ) : (
          <>
            <div className="grade-cartoes">
              <CartaoIndicador chave="sessoes" rotulo={METRICS.sessoes.label} ajuda={METRICS.sessoes.help} icone="clientes"
                valor={num(atual.sessoes)} variacao={variacao(atual.sessoes, anterior.sessoes)} />
              <CartaoIndicador chave="cliquesWhatsapp" rotulo={METRICS.cliquesWhatsapp.label} ajuda={METRICS.cliquesWhatsapp.help} icone="mensagem"
                valor={num(atual.cliquesWhatsapp)} variacao={variacao(atual.cliquesWhatsapp, anterior.cliquesWhatsapp)} />
              <CartaoIndicador chave="formularios" rotulo={METRICS.formularios.label} ajuda={METRICS.formularios.help} icone="arquivo" destaque
                href={`/leads?site=${site.id}&periodo=${entrada.key}`}
                valor={num(atual.formularios)} variacao={variacao(atual.formularios, anterior.formularios)} />
              <CartaoIndicador chave="sessoesConvertidas" rotulo={METRICS.sessoesConvertidas.label} ajuda={METRICS.sessoesConvertidas.help} icone="tendencia"
                valor={pct(kpis.taxaSessoesConvertidas)}
                variacao={{ texto: `${num(atual.sessoesConvertidasAbs)} de ${num(atual.sessoes)} sessões`, tom: 'neutro' }} />

              <CartaoIndicador chave="visitantesUnicos" rotulo={METRICS.visitantesUnicos.label} ajuda={METRICS.visitantesUnicos.help} icone="pessoa"
                valor={num(atual.visitantesUnicos)} variacao={variacao(atual.visitantesUnicos, anterior.visitantesUnicos)} />
              <CartaoIndicador chave="visualizacoes" rotulo={METRICS.visualizacoes.label} ajuda={METRICS.visualizacoes.help} icone="olho"
                valor={num(atual.visualizacoes)} variacao={variacao(atual.visualizacoes, anterior.visualizacoes)} />
              <CartaoIndicador chave="cliquesContato" rotulo={METRICS.cliquesContato.label} ajuda={METRICS.cliquesContato.help} icone="telefone"
                valor={num(atual.cliquesContato)} variacao={variacao(atual.cliquesContato, anterior.cliquesContato)} />
              <CartaoIndicador chave="enviosPorSessao" rotulo={METRICS.enviosPorSessao.label} ajuda={METRICS.enviosPorSessao.help} icone="pessoaOk"
                valor={pct(kpis.taxaEnviosPorSessao)}
                variacao={{ texto: `${num(atual.formularios)} envios ÷ ${num(atual.sessoes)} sessões`, tom: 'neutro' }} />
            </div>

            <p style={{ fontSize: 12, color: 'var(--tx2)' }}>
              Cliques e formulários não são somados: a mesma pessoa pode fazer as duas coisas.{' '}
              <strong>Sessões convertidas</strong> e <strong>envios por sessão</strong> são contas diferentes — a
              segunda pode passar de 100%, porque uma sessão pode enviar mais de um formulário.
            </p>

            <Painel
              kicker="01 / EVOLUÇÃO"
              titulo="Evolução do desempenho"
              subtitulo={`${periodo.label} · fonte: rastreamento próprio`}
            >
              <Grafico pontos={serie} periodo={periodo.label} />
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
                A soma da série de formulários é {num(soma(serie, (p) => p.formularios))}, exatamente o valor do
                cartão de formulários recebidos. As duas leituras vêm da mesma consulta.
              </p>
            </Painel>

            <Painel
              titulo="Desempenho por página"
              subtitulo="Taxa e volumes por página visitada dentro do período"
            >
              <Tabela colunas={colunasPagina} linhas={paginas} />
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
                Uma sessão que visitou duas páginas aparece nas duas linhas. Por isso a coluna de sessões soma mais
                que o total de sessões do período.
              </p>
            </Painel>

            <div className="grade-dupla">
              <Painel titulo="Desempenho dos botões" subtitulo="Passe o cursor sobre o nome para ver o identificador">
                <Tabela colunas={colunasBotao} linhas={botoes} />
                <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
                  Total de {num(soma(botoes, (l) => l.cliques))} cliques — o mesmo total da coluna "Cliques em CTA"
                  da tabela por página, porque as duas contam o mesmo conjunto de eventos.
                </p>
              </Painel>

              <Painel titulo="Origem dos acessos" subtitulo="UTMs e referenciador da primeira página da sessão">
                <Tabela colunas={colunasOrigem} linhas={origens} />
                <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
                  "Não identificado" cobre acessos diretos e sessões sem UTM legível. Não atribuímos origem por
                  inferência.
                </p>
              </Painel>
            </div>
          </>
        )}

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', paddingTop: 6 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO</Aviso>
          <Aviso>PERÍODO: {periodo.label.toUpperCase()}</Aviso>
          <Aviso>FUSO: {site.timezone.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
