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
import { Tabela, Etiqueta, TOM_DA_ACAO, type Coluna } from '@/components/Tabela';
import { Grafico } from '@/components/Grafico';
import { Donut } from '@/components/Donut';
import { EstadoVazio } from '@/components/EstadoVazio';
import { SeletorSiteRota, IntervaloPersonalizado } from '@/components/filtros';
import { parseOrdem } from '@/lib/ordenacao';
import { fatiasDaOrigem, corDaLinha } from '@/lib/origens';
import type { PageRow, ButtonRow, SourceRow, DailyPoint } from '@/server/metrics/queries';
import type { Ponto } from '@/lib/evidencias';

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
    // O período ANTERIOR, dia a dia, para a linha cinza de comparação do
    // gráfico. Mesma consulta, janela deslocada — não é uma segunda definição.
    const serieAnterior = await getDailySeries(db, site, {
      ...periodo,
      from: periodo.previousFrom,
      to: periodo.previousTo,
    });
    const paginas = await getByPage(db, site, periodo);
    const botoes = await getByButton(db, site, periodo);
    const origens = await getBySource(db, site, periodo);
    return { periodo, kpis, serie, serieAnterior, paginas, botoes, origens };
  });

  const { periodo, kpis, serie, serieAnterior, paginas, botoes, origens } = dados;
  const { atual, anterior } = kpis;
  const semColeta = site.totalEventos === 0;

  // A série de cada cartão sai da MESMA consulta do gráfico. `Ponto` é o tipo
  // puro das evidências; o valor nunca é nulo aqui porque a consulta gera a
  // grade de dias e devolve zero para dia sem movimento — zero é afirmação.
  const serieDe = (campo: keyof Omit<DailyPoint, 'dia'>): Ponto[] =>
    serie.map((p) => ({ valor: p[campo], em: new Date(`${p.dia}T12:00:00`) }));

  // Ordenação das três tabelas, cada uma com o próprio parâmetro na URL. O
  // padrão é o da consulta (maior primeiro na coluna que dá nome à tabela).
  const ordemPaginas = parseOrdem(busca.ordem_paginas, ['path', 'sessoes', 'visualizacoes', 'cta', 'formularios'], { coluna: 'sessoes', direcao: 'desc' });
  const ordemBotoes = parseOrdem(busca.ordem_botoes, ['texto', 'pagina', 'acao', 'posicao', 'cliques'], { coluna: 'cliques', direcao: 'desc' });
  const ordemOrigens = parseOrdem(busca.ordem_origens, ['origem', 'campanha', 'sessoes', 'formularios'], { coluna: 'sessoes', direcao: 'desc' });

  // As fatias do anel e a cor de cada linha da tabela de origem vêm da MESMA
  // lista: o anel mostra as quatro maiores e "Outras"; a tabela lista todas.
  const fatias = fatiasDaOrigem(origens, (o) => ({ rotulo: o.origem, valor: o.sessoes }));

  const colunasPagina: Coluna<PageRow>[] = [
    { chave: 'path', titulo: 'Página', render: (l) => l.path, mono: true, valor: (l) => l.path,
      total: () => `${paginas.length} página(s)` },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true, valor: (l) => l.sessoes, barra: (l) => l.sessoes,
      ajuda: 'Sessões que viram esta página. Uma sessão que passou por duas páginas conta nas duas linhas, por isso esta coluna não soma o total de sessões do período.',
      render: (l) => num(l.sessoes), total: (ls) => num(soma(ls, (l) => l.sessoes)) },
    { chave: 'visualizacoes', titulo: 'Visualizações', alinhamento: 'direita', mono: true, valor: (l) => l.visualizacoes,
      render: (l) => num(l.visualizacoes), total: (ls) => num(soma(ls, (l) => l.visualizacoes)) },
    { chave: 'cta', titulo: 'Cliques em CTA', alinhamento: 'direita', mono: true, valor: (l) => l.cliquesCta,
      ajuda: 'Todos os cliques em elementos marcados, incluindo abertura de formulário. Mesmo escopo da tabela por botão — os dois totais fecham.',
      render: (l) => num(l.cliquesCta), total: (ls) => num(soma(ls, (l) => l.cliquesCta)) },
    { chave: 'formularios', titulo: 'Formulários', alinhamento: 'direita', mono: true, valor: (l) => l.formularios,
      render: (l) => num(l.formularios), total: (ls) => num(soma(ls, (l) => l.formularios)) },
  ];

  const colunasBotao: Coluna<ButtonRow>[] = [
    { chave: 'texto', titulo: 'Botão', render: (l) => <span title={`data-track-id: ${l.buttonId}`}>{l.texto}</span>, valor: (l) => l.texto,
      total: () => `${botoes.length} botão(ões)` },
    { chave: 'pagina', titulo: 'Página', mono: true, render: (l) => l.pagina, valor: (l) => l.pagina },
    // A etiqueta da ação usa a cor de DADOS da ação — a mesma da pilha do gráfico.
    { chave: 'acao', titulo: 'Ação', valor: (l) => SUBTIPO_LABEL[l.subtipo] ?? l.subtipo,
      render: (l) => <Etiqueta texto={SUBTIPO_LABEL[l.subtipo] ?? l.subtipo} tom={TOM_DA_ACAO[l.subtipo] ?? 'soft'} /> },
    { chave: 'posicao', titulo: 'Posição', render: (l) => l.posicao, valor: (l) => l.posicao },
    { chave: 'cliques', titulo: 'Cliques', alinhamento: 'direita', mono: true, valor: (l) => l.cliques, barra: (l) => l.cliques,
      ajuda: 'Mesmo escopo da coluna "Cliques em CTA" da tabela por página.',
      render: (l) => num(l.cliques), total: (ls) => num(soma(ls, (l) => l.cliques)) },
  ];

  const colunasOrigem: Coluna<SourceRow>[] = [
    { chave: 'origem', titulo: 'Origem / mídia', valor: (l) => l.origem, total: () => 'Total',
      render: (l) => {
        const cor = corDaLinha(fatias, l);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 'var(--raio-p)', background: cor === null ? 'var(--bd)' : `var(--c${cor + 1})`, flex: 'none' }} />
            {l.origem}
          </span>
        );
      } },
    { chave: 'campanha', titulo: 'Campanha', render: (l) => l.campanha, valor: (l) => l.campanha },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true, valor: (l) => l.sessoes, barra: (l) => l.sessoes, corDaBarra: 'c2',
      render: (l) => num(l.sessoes), total: (ls) => num(soma(ls, (l) => l.sessoes)) },
    { chave: 'formularios', titulo: 'Formulários', alinhamento: 'direita', mono: true, valor: (l) => l.formularios,
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
        // O período mora na linha das abas (`Abas`), à direita, em todas as
        // seções do site — não mais no cabeçalho.
        filtros={<SeletorSiteRota sites={sites} atual={site.id} aba="desempenho" />}
      />

      <div className="abas">
        <Abas siteId={site.id} />
      </div>

      <div className="pagina">
        {entrada.key === 'personalizado' && (
          <IntervaloPersonalizado de={entrada.de ?? ''} ate={entrada.ate ?? ''} />
        )}

        {semColeta ? (
          // Vermelho quando o script nunca foi instalado; amarelo quando está
          // instalado e o primeiro evento real ainda não chegou. Nunca um zero:
          // sem evento não há medição, e a tela diz isso.
          <EstadoVazio
            tom={site.estado === 'aguardando_instalacao' ? 'erro' : 'aguardando'}
            kicker={ESTADO_LABEL[site.estado]}
            titulo="Este site ainda não recebeu eventos"
            explicacao="Enquanto nenhum evento chegar, o painel não exibe números — nem zeros estimados. Instale o script e abra o site uma vez pelo link do diagnóstico para validar a coleta."
            acao={{ rotulo: 'Ir para a configuração', href: `/sites/${site.id}/configurar` }}
          />
        ) : (
          <>
            <div className="grade-cartoes">
              {/* Primários: cor da MÉTRICA (visitas verde, WhatsApp verde,
                  formulários amarelo, taxa azul) e sparkline da série diária.
                  A taxa não tem série — é razão entre duas contagens, e uma
                  série de razão com denominador pequeno mentiria por dia. */}
              <CartaoIndicador chave="sessoes" rotulo={METRICS.sessoes.label} ajuda={METRICS.sessoes.help} icone="clientes" cor="c1"
                serie={serieDe('sessoes')}
                valor={num(atual.sessoes)} variacao={variacao(atual.sessoes, anterior.sessoes)} />
              <CartaoIndicador chave="cliquesWhatsapp" rotulo={METRICS.cliquesWhatsapp.label} ajuda={METRICS.cliquesWhatsapp.help} icone="mensagem" cor="c1"
                serie={serieDe('cliquesWhatsapp')}
                valor={num(atual.cliquesWhatsapp)} variacao={variacao(atual.cliquesWhatsapp, anterior.cliquesWhatsapp)} />
              <CartaoIndicador chave="formularios" rotulo={METRICS.formularios.label} ajuda={METRICS.formularios.help} icone="arquivo" cor="c3" destaque
                href={`/leads?site=${site.id}&periodo=${entrada.key}`}
                serie={serieDe('formularios')}
                valor={num(atual.formularios)} variacao={variacao(atual.formularios, anterior.formularios)} />
              <CartaoIndicador chave="sessoesConvertidas" rotulo={METRICS.sessoesConvertidas.label} ajuda={METRICS.sessoesConvertidas.help} icone="tendencia" cor="c2"
                valor={pct(kpis.taxaSessoesConvertidas)}
                variacao={{ texto: `${num(atual.sessoesConvertidasAbs)} de ${num(atual.sessoes)} sessões`, tom: 'neutro' }} />

              <CartaoIndicador chave="visitantesUnicos" rotulo={METRICS.visitantesUnicos.label} ajuda={METRICS.visitantesUnicos.help} icone="pessoa" cor="c2" secundario
                serie={serieDe('visitantesUnicos')}
                valor={num(atual.visitantesUnicos)} variacao={variacao(atual.visitantesUnicos, anterior.visitantesUnicos)} />
              <CartaoIndicador chave="visualizacoes" rotulo={METRICS.visualizacoes.label} ajuda={METRICS.visualizacoes.help} icone="olho" cor="c2" secundario
                serie={serieDe('visualizacoes')}
                valor={num(atual.visualizacoes)} variacao={variacao(atual.visualizacoes, anterior.visualizacoes)} />
              <CartaoIndicador chave="cliquesContato" rotulo={METRICS.cliquesContato.label} ajuda={METRICS.cliquesContato.help} icone="telefone" cor="c3" secundario
                serie={serie.map((p) => ({ valor: p.cliquesTelefone + p.cliquesEmail, em: new Date(`${p.dia}T12:00:00`) }))}
                valor={num(atual.cliquesContato)} variacao={variacao(atual.cliquesContato, anterior.cliquesContato)} />
              <CartaoIndicador chave="enviosPorSessao" rotulo={METRICS.enviosPorSessao.label} ajuda={METRICS.enviosPorSessao.help} icone="pessoaOk" cor="c2" secundario
                valor={pct(kpis.taxaEnviosPorSessao)}
                variacao={{ texto: `${num(atual.formularios)} envios ÷ ${num(atual.sessoes)} sessões`, tom: 'neutro' }} />
            </div>

            <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
              Cliques e formulários não são somados: a mesma pessoa pode fazer as duas coisas.{' '}
              <strong>Sessões convertidas</strong> e <strong>envios por sessão</strong> são contas diferentes — a
              segunda pode passar de 100%, porque uma sessão pode enviar mais de um formulário.
            </p>

            <Painel
              kicker="01 / EVOLUÇÃO"
              titulo="Evolução do desempenho"
              subtitulo={`${periodo.label} · fonte: rastreamento próprio`}
            >
              <Grafico pontos={serie} anteriores={serieAnterior} periodo={periodo.label} />
              <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
                A soma da série de formulários é {num(soma(serie, (p) => p.formularios))}, exatamente o valor do
                cartão de formulários recebidos. As duas leituras vêm da mesma consulta.
              </p>
            </Painel>

            <Painel
              titulo="Desempenho por página"
              subtitulo="Taxa e volumes por página visitada dentro do período"
            >
              <Tabela colunas={colunasPagina} linhas={paginas} chave={(l) => l.path} ordenacao={{ parametro: 'ordem_paginas', atual: ordemPaginas }} />
              <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
                Uma sessão que visitou duas páginas aparece nas duas linhas. Por isso a coluna de sessões soma mais
                que o total de sessões do período.
              </p>
            </Painel>

            <div className="grade-dupla">
              <Painel titulo="Desempenho dos botões" subtitulo="Passe o cursor sobre o nome para ver o identificador">
                <Tabela colunas={colunasBotao} linhas={botoes} chave={(l) => l.buttonId} ordenacao={{ parametro: 'ordem_botoes', atual: ordemBotoes }} />
                <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
                  Total de {num(soma(botoes, (l) => l.cliques))} cliques — o mesmo total da coluna "Cliques em CTA"
                  da tabela por página, porque as duas contam o mesmo conjunto de eventos.
                </p>
              </Painel>

              <Painel titulo="Origem dos acessos" subtitulo="UTMs e referenciador da primeira página da sessão">
                {origens.length > 0 && (
                  <div style={{ marginBottom: 'var(--esp-4)' }}>
                    <Donut fatias={fatias} rotuloDoTotal="sessões" />
                  </div>
                )}
                <Tabela colunas={colunasOrigem} linhas={origens} chave={(l) => l.origem} ordenacao={{ parametro: 'ordem_origens', atual: ordemOrigens }} />
                <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
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
