import 'server-only';
import type { Queryable } from '@/server/db';
import type { PeriodInput, ResolvedPeriod } from '@/lib/periodo';

/**
 * FONTE ÚNICA das agregações.
 *
 * Cards, gráfico e tabelas chamam estas funções. Nenhum componente visual
 * calcula número, e por isso não existe a possibilidade de duas telas
 * discordarem sobre o mesmo indicador.
 *
 * Duas regras de atribuição valem para tudo aqui, e estão documentadas em
 * docs/metricas.md:
 *
 *  1. SESSÕES são atribuídas pela data de INÍCIO. Eventos pertencem à sessão,
 *     não ao seu próprio dia — uma sessão que começa 23:50 e recebe um clique
 *     às 00:10 conta os dois no dia em que começou. É o que faz o total da
 *     tabela por página bater com o da tabela por botão.
 *  2. FORMULÁRIOS são atribuídos pela data de RECEBIMENTO. Por isso a soma da
 *     série diária do gráfico é exatamente igual ao card de formulários.
 *
 * Eventos marcados como teste ficam fora de todas as agregações: aparecem
 * apenas na aba de Rastreamento, para confirmar a instalação.
 */

/** Sessões do site dentro da janela. Base de quase todo o resto. */
const ELIGIBLE = `
  eligible as (
    select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign,
           s.device, s.entry_page_id
      from sessions s
     where s.site_id = $1
       and s.started_at >= $2
       and s.started_at <  $3
       and not s.is_test
  )`;

/** Eventos das sessões elegíveis. */
const EVENTS = `
  ev as (
    select e.type, e.subtype, e.page_id, e.button_id, e.button_text,
           e.button_position, e.session_id
      from events e
      join eligible es on es.id = e.session_id
     where not e.is_test
  )`;

/**
 * Submissões confirmadas recebidas na janela.
 *
 * `lead_id` entra aqui porque o funil de qualidade precisa ligar a submissão ao
 * contato. As demais consultas ignoram a coluna — mas manter UMA definição de
 * "submissões elegíveis" é o que impede duas telas discordarem sobre quantos
 * formulários chegaram.
 */
const SUBMISSIONS = `
  subs as (
    select fs.id, fs.session_id, fs.page_id, fs.form_name, fs.created_at, fs.lead_id
      from form_submissions fs
     where fs.site_id = $1
       and fs.created_at >= $2
       and fs.created_at <  $3
       and fs.status = 'confirmada'
       and not fs.is_test
  )`;

export type SiteContext = { id: string; timezone: string };

// ───────────────────────────── período ─────────────────────────────

/**
 * Converte a escolha de período em instantes UTC, recortando no fuso do site.
 * O cálculo é feito pelo Postgres porque `AT TIME ZONE` acerta horário de
 * verão e bordas de dia que aritmética de milissegundos erra.
 */
export async function resolvePeriod(
  db: Queryable,
  timezone: string,
  input: PeriodInput,
): Promise<ResolvedPeriod> {
  const days = input.key === 'hoje' ? 1 : input.key === '7d' ? 7 : input.key === '30d' ? 30 : 0;

  const row = input.key === 'personalizado'
    ? await db.one<{ from: Date; to: Date; days: number }>(
        `select ($2::date)::timestamp at time zone $1              as "from",
                (($3::date + 1))::timestamp at time zone $1        as "to",
                (($3::date - $2::date) + 1)                        as days`,
        [timezone, input.de, input.ate],
      )
    : await db.one<{ from: Date; to: Date; days: number }>(
        `with hoje as (select date_trunc('day', now() at time zone $1) as d)
         select (d - make_interval(days => $2::int - 1)) at time zone $1 as "from",
                (d + interval '1 day')                  at time zone $1 as "to",
                $2::int                                                as days
           from hoje`,
        [timezone, days],
      );

  if (!row) throw new Error('Não foi possível resolver o período.');

  const span = row.to.getTime() - row.from.getTime();
  return {
    key: input.key,
    label: '',
    days: row.days,
    from: row.from,
    to: row.to,
    // Período anterior de mesma duração, imediatamente antes.
    previousFrom: new Date(row.from.getTime() - span),
    previousTo: row.from,
  };
}

// ───────────────────────────── indicadores ─────────────────────────────

export type KpiTotals = {
  sessoes: number;
  visitantesUnicos: number;
  visualizacoes: number;
  cliquesCta: number;
  cliquesWhatsapp: number;
  cliquesContato: number;
  aberturasFormulario: number;
  formularios: number;
  leads: number;
  /** Sessões distintas com ao menos uma submissão confirmada. */
  sessoesConvertidasAbs: number;
};

export type Kpis = {
  atual: KpiTotals;
  anterior: KpiTotals;
  /** Sessões convertidas ÷ sessões. `null` quando não há sessões. */
  taxaSessoesConvertidas: number | null;
  /** Submissões ÷ sessões. Pode passar de 1. `null` quando não há sessões. */
  taxaEnviosPorSessao: number | null;
};

const TOTALS_SQL = `
  with ${ELIGIBLE}, ${EVENTS}, ${SUBMISSIONS}
  select
    (select count(*) from eligible)::int                                                as "sessoes",
    (select count(distinct visitor_id) from eligible)::int                              as "visitantesUnicos",
    (select count(*) from ev where type = 'page_view')::int                             as "visualizacoes",
    (select count(*) from ev where type = 'cta_click')::int                             as "cliquesCta",
    (select count(*) from ev where type = 'cta_click' and subtype = 'whatsapp')::int     as "cliquesWhatsapp",
    (select count(*) from ev where type = 'cta_click'
        and subtype in ('phone', 'email'))::int                                          as "cliquesContato",
    (select count(*) from ev where type = 'cta_click' and subtype = 'form_open')::int    as "aberturasFormulario",
    (select count(*) from subs)::int                                                     as "formularios",
    (select count(*) from leads l
      where l.site_id = $1 and l.first_seen_at >= $2 and l.first_seen_at < $3)::int      as "leads",
    (select count(distinct session_id) from subs where session_id is not null)::int      as "sessoesConvertidasAbs"
`;

export async function getKpis(db: Queryable, site: SiteContext, period: ResolvedPeriod): Promise<Kpis> {
  // Sequencial de propósito: as duas consultas compartilham a MESMA conexão do
  // pool (estamos dentro de uma transação). Um `Promise.all` aqui dispara duas
  // queries simultâneas no mesmo client, que o driver pg não suporta.
  const atual = await db.one<KpiTotals>(TOTALS_SQL, [site.id, period.from, period.to]);
  const anterior = await db.one<KpiTotals>(TOTALS_SQL, [site.id, period.previousFrom, period.previousTo]);
  if (!atual || !anterior) throw new Error('Falha ao agregar indicadores.');

  return {
    atual,
    anterior,
    // Divisão por zero devolve null, e a tela mostra estado explícito em vez de 0%.
    taxaSessoesConvertidas: atual.sessoes > 0 ? atual.sessoesConvertidasAbs / atual.sessoes : null,
    taxaEnviosPorSessao: atual.sessoes > 0 ? atual.formularios / atual.sessoes : null,
  };
}

// ───────────────────────────── série diária ─────────────────────────────

export type DailyPoint = {
  dia: string;
  sessoes: number;
  cliquesCta: number;
  formularios: number;
};

/**
 * Uma linha por dia local do período, inclusive dias sem movimento.
 * A soma da coluna `formularios` é idêntica ao card de formulários — há teste
 * automatizado afirmando isso, porque no protótipo as duas discordavam.
 */
export async function getDailySeries(
  db: Queryable,
  site: SiteContext,
  period: ResolvedPeriod,
): Promise<DailyPoint[]> {
  return db.query<DailyPoint>(
    `with ${ELIGIBLE}, ${EVENTS}, ${SUBMISSIONS},
     dias as (
       select generate_series(
         date_trunc('day', $2::timestamptz at time zone $4),
         date_trunc('day', ($3::timestamptz - interval '1 microsecond') at time zone $4),
         interval '1 day'
       )::date as dia
     ),
     ses as (
       select (started_at at time zone $4)::date as dia, count(*)::int as n
         from eligible group by 1
     ),
     cli as (
       select (e.started_at at time zone $4)::date as dia, count(*)::int as n
         from ev join eligible e on e.id = ev.session_id
        where ev.type = 'cta_click' group by 1
     ),
     frm as (
       select (created_at at time zone $4)::date as dia, count(*)::int as n
         from subs group by 1
     )
     select to_char(d.dia, 'YYYY-MM-DD')      as dia,
            coalesce(ses.n, 0)                as "sessoes",
            coalesce(cli.n, 0)                as "cliquesCta",
            coalesce(frm.n, 0)                as "formularios"
       from dias d
       left join ses on ses.dia = d.dia
       left join cli on cli.dia = d.dia
       left join frm on frm.dia = d.dia
      order by d.dia`,
    [site.id, period.from, period.to, site.timezone],
  );
}

// ───────────────────────────── tabelas ─────────────────────────────

export type PageRow = {
  path: string;
  sessoes: number;
  visualizacoes: number;
  cliquesCta: number;
  formularios: number;
};

/**
 * Desempenho por página.
 *
 * Uma sessão que visitou duas páginas conta em DUAS linhas — por isso a coluna
 * de sessões não soma o total de sessões do período. Está documentado na tela.
 * A coluna de cliques cobre todos os cta_click, o mesmo escopo da tabela por
 * botão, de modo que os dois totais fecham.
 */
export async function getByPage(db: Queryable, site: SiteContext, period: ResolvedPeriod): Promise<PageRow[]> {
  return db.query<PageRow>(
    `with ${ELIGIBLE}, ${EVENTS}, ${SUBMISSIONS}
     select coalesce(p.path, 'Não identificado')                                as "path",
            count(distinct ev.session_id) filter (where ev.type = 'page_view')::int as "sessoes",
            count(*)       filter (where ev.type = 'page_view')::int            as "visualizacoes",
            count(*)       filter (where ev.type = 'cta_click')::int            as "cliquesCta",
            (select count(*)::int from subs where subs.page_id is not distinct from ev.page_id) as "formularios"
       from ev
       left join pages p on p.id = ev.page_id
      group by ev.page_id, p.path
      having count(*) filter (where ev.type = 'page_view') > 0
         or  count(*) filter (where ev.type = 'cta_click') > 0
      order by 2 desc, 3 desc`,
    [site.id, period.from, period.to],
  );
}

export type ButtonRow = {
  buttonId: string;
  texto: string;
  pagina: string;
  subtipo: string;
  posicao: string;
  cliques: number;
};

export async function getByButton(db: Queryable, site: SiteContext, period: ResolvedPeriod): Promise<ButtonRow[]> {
  return db.query<ButtonRow>(
    `with ${ELIGIBLE}, ${EVENTS}
     select ev.button_id                                        as "buttonId",
            coalesce(max(ev.button_text), ev.button_id)         as "texto",
            case when count(distinct ev.page_id) > 1 then 'todas'
                 else coalesce(max(p.path), '—') end            as "pagina",
            max(ev.subtype)                                     as "subtipo",
            coalesce(max(ev.button_position), '—')              as "posicao",
            count(*)::int                                       as "cliques"
       from ev
       left join pages p on p.id = ev.page_id
      where ev.type = 'cta_click' and ev.button_id is not null
      group by ev.button_id
      order by 6 desc`,
    [site.id, period.from, period.to],
  );
}

export type SourceRow = {
  origem: string;
  campanha: string;
  sessoes: number;
  formularios: number;
};

export async function getBySource(db: Queryable, site: SiteContext, period: ResolvedPeriod): Promise<SourceRow[]> {
  return db.query<SourceRow>(
    `with ${ELIGIBLE}, ${SUBMISSIONS}
     select e.source                                            as "origem",
            coalesce(nullif(max(e.campaign), ''), '—')          as "campanha",
            count(distinct e.id)::int                           as "sessoes",
            count(distinct s.id)::int                           as "formularios"
       from eligible e
       left join subs s on s.session_id = e.id
      group by e.source
      order by 3 desc`,
    [site.id, period.from, period.to],
  );
}

// ───────────────────────── comportamento ─────────────────────────

export type ComportamentoRow = { rotulo: string; sessoes: number };

export type Comportamento = {
  /** Média de páginas vistas por sessão. `null` quando não há sessões. */
  paginasPorSessao: number | null;
  /** Sessões que viram uma única página e não clicaram em nada. */
  sessoesDeUmaPagina: number;
  dispositivos: ComportamentoRow[];
  entradas: ComportamentoRow[];
  profundidade: ComportamentoRow[];
  porHora: ComportamentoRow[];
};

/**
 * Leitura de comportamento a partir do rastreamento próprio.
 *
 * Tudo aqui sai dos mesmos eventos que alimentam o Desempenho — não há segunda
 * fonte nem provedor externo envolvido. As horas são as do fuso do site.
 */
export async function getBehavior(
  db: Queryable,
  site: SiteContext,
  period: ResolvedPeriod,
): Promise<Comportamento> {
  const resumo = await db.one<{ paginas: string | null; umaPagina: number; sessoes: number }>(
    `with ${ELIGIBLE}, ${EVENTS},
     porSessao as (
       select e.id,
              count(*) filter (where ev.type = 'page_view')::int as vistas,
              count(*) filter (where ev.type = 'cta_click')::int  as cliques
         from eligible e
         left join ev on ev.session_id = e.id
        group by e.id
     )
     select avg(vistas)::numeric(10,2)                          as paginas,
            count(*) filter (where vistas <= 1 and cliques = 0)::int as "umaPagina",
            count(*)::int                                        as sessoes
       from porSessao`,
    [site.id, period.from, period.to],
  );

  const dispositivos = await db.query<ComportamentoRow>(
    `with ${ELIGIBLE}
     select device as rotulo, count(*)::int as sessoes
       from eligible group by device order by 2 desc`,
    [site.id, period.from, period.to],
  );

  const entradas = await db.query<ComportamentoRow>(
    `with ${ELIGIBLE}
     select coalesce(p.path, 'Não identificada') as rotulo, count(*)::int as sessoes
       from eligible e
       left join pages p on p.id = e.entry_page_id
      group by p.path order by 2 desc limit 10`,
    [site.id, period.from, period.to],
  );

  const profundidade = await db.query<ComportamentoRow>(
    `with ${ELIGIBLE}, ${EVENTS},
     porSessao as (
       select e.id, count(*) filter (where ev.type = 'page_view')::int as vistas
         from eligible e left join ev on ev.session_id = e.id
        group by e.id
     )
     select case when vistas <= 1 then '1 página'
                 when vistas = 2  then '2 páginas'
                 when vistas = 3  then '3 páginas'
                 else '4 ou mais' end as rotulo,
            count(*)::int as sessoes
       from porSessao
      group by 1
      order by 1`,
    [site.id, period.from, period.to],
  );

  // Hora local do site, não do servidor: um pico às 20h em São Paulo precisa
  // aparecer às 20h, mesmo com o banco gravando tudo em UTC.
  const porHora = await db.query<ComportamentoRow>(
    `with ${ELIGIBLE}
     select lpad(extract(hour from (started_at at time zone $4))::text, 2, '0') || 'h' as rotulo,
            count(*)::int as sessoes
       from eligible group by 1 order by 1`,
    [site.id, period.from, period.to, site.timezone],
  );

  return {
    paginasPorSessao: resumo && resumo.paginas !== null ? Number(resumo.paginas) : null,
    sessoesDeUmaPagina: resumo?.umaPagina ?? 0,
    dispositivos,
    entradas,
    profundidade,
    porHora,
  };
}

// ───────────────────────── funil de leads ─────────────────────────

export type EtapaDoFunil = {
  chave: 'sessoes' | 'interagiram' | 'enviaram' | 'contatoNovo';
  rotulo: string;
  /** O que esta etapa afirma, palavra por palavra. Vai para a tela. */
  definicao: string;
  sessoes: number;
};

export type FunilDeLeads = {
  etapas: EtapaDoFunil[];
  /**
   * Leads DISTINTOS originados das submissões da janela.
   *
   * Fica fora das etapas de propósito: a unidade é outra. Uma etapa do funil
   * conta sessões; um lead pode nascer de duas sessões (a pessoa voltou) e duas
   * sessões podem virar um lead só. Misturar as duas unidades numa barra faria a
   * última etapa parecer menor do que a anterior por um motivo que não é perda.
   */
  leadsDistintos: number;
  /**
   * Submissões confirmadas SEM sessão associada.
   *
   * O endpoint de formulários aceita contato sem identificador de visitante —
   * quem bloqueia analytics, recusou consentimento ou está com o coletor fora do
   * ar continua virando lead. Esses envios não cabem em nenhuma etapa deste
   * funil, que é medido por sessão. Omiti-los faria o painel afirmar menos leads
   * do que existem, então o número aparece ao lado, nomeado.
   */
  enviosSemSessao: number;
  /**
   * Envios de quem o site JÁ conhecia — contato visto pela primeira vez antes
   * desta janela.
   *
   * Não é perda, e por isso não é etapa: é o mesmo cliente voltando. Aparece
   * separado porque explica a diferença entre "enviaram" e "contato novo" sem
   * que ela pareça uma falha do formulário.
   */
  enviosDeContatoConhecido: number;
  /**
   * Leads da janela com e-mail **e** telefone.
   *
   * O único indicador aqui que fala de qualidade do dado em si. Um contato com
   * os dois caminhos abertos vale mais para quem vai atender do que um com só
   * um — e é a diferença entre os dois números que diz se vale a pena pedir o
   * segundo campo no formulário.
   */
  leadsComOsDoisContatos: number;
};

/**
 * Funil da qualidade dos leads, medido em sessões.
 *
 * **Cada etapa é um subconjunto estrito da anterior**, e isso é a única razão de
 * o desenho em funil não mentir. A tentação era montar as etapas com os
 * indicadores que já existem — sessões, aberturas de formulário, formulários
 * enviados, leads — mas "abriu o formulário" e "enviou o formulário" são
 * conjuntos que se cruzam sem um conter o outro: um formulário visível na página
 * é enviado sem nunca disparar o evento de abertura. Um funil cuja segunda etapa
 * pode ser menor que a terceira desenha uma perda que não aconteceu.
 *
 * Por isso a etapa de interesse é "clicou em algo OU enviou", que contém a de
 * envio por construção, e a última é "o envio virou contato identificável", que
 * é um recorte dos envios.
 *
 * O que o funil NÃO afirma: que a queda entre duas etapas tem uma causa. Ele
 * conta quantas sessões chegaram a cada ponto. Por que pararam é outra pergunta,
 * e o painel não a responde.
 */
export async function getFunilDeLeads(
  db: Queryable,
  site: SiteContext,
  period: ResolvedPeriod,
): Promise<FunilDeLeads> {
  const linha = await db.one<{
    sessoes: number;
    interagiram: number;
    enviaram: number;
    contatoNovo: number;
    leadsDistintos: number;
    enviosSemSessao: number;
    enviosDeContatoConhecido: number;
    leadsComOsDoisContatos: number;
  }>(
    `with ${ELIGIBLE}, ${EVENTS}, ${SUBMISSIONS},
     -- Sessões com submissão confirmada. Base das duas últimas etapas.
     comEnvio as (
       select distinct session_id from subs where session_id is not null
     ),
     -- Sessões cujo envio trouxe um contato que o site ainda não conhecia.
     -- first_seen_at é gravado na criação do lead e o upsert NÃO o toca, então
     -- ele continua sendo a primeira vez, mesmo depois de dez envios.
     comContatoNovo as (
       select distinct s.session_id
         from subs s
         join leads l on l.id = s.lead_id
        where s.session_id is not null
          and l.first_seen_at >= $2
     ),
     -- Clicou em qualquer CTA. Une-se aos envios para formar a etapa de
     -- interesse, que precisa conter a de envio.
     comClique as (
       select distinct session_id from ev where type = 'cta_click'
     )
     select
       (select count(*) from eligible)::int                                      as "sessoes",
       (select count(*) from eligible e
         where e.id in (select session_id from comClique)
            or e.id in (select session_id from comEnvio))::int                   as "interagiram",
       (select count(*) from eligible e
         where e.id in (select session_id from comEnvio))::int                   as "enviaram",
       (select count(*) from eligible e
         where e.id in (select session_id from comContatoNovo))::int             as "contatoNovo",
       (select count(distinct lead_id) from subs where lead_id is not null)::int as "leadsDistintos",
       (select count(*) from subs where session_id is null)::int                 as "enviosSemSessao",
       (select count(*) from subs s join leads l on l.id = s.lead_id
         where l.first_seen_at < $2)::int                          as "enviosDeContatoConhecido",
       (select count(distinct l.id) from subs s join leads l on l.id = s.lead_id
         where nullif(trim(l.email), '') is not null
           and nullif(trim(l.phone), '') is not null)::int          as "leadsComOsDoisContatos"`,
    [site.id, period.from, period.to],
  );

  if (!linha) throw new Error('Falha ao montar o funil de leads.');

  return {
    etapas: [
      {
        chave: 'sessoes',
        rotulo: 'Sessões',
        definicao: 'Visitas registradas no período, sem contar acessos de teste.',
        sessoes: linha.sessoes,
      },
      {
        chave: 'interagiram',
        rotulo: 'Interagiram',
        definicao:
          'Sessões que clicaram em algum CTA ou enviaram um formulário. Conter o envio é ' +
          'proposital: um formulário na própria página é enviado sem clique de abertura, e ' +
          'sem isso esta etapa poderia ficar menor que a seguinte.',
        sessoes: linha.interagiram,
      },
      {
        chave: 'enviaram',
        rotulo: 'Enviaram formulário',
        definicao:
          'Sessões com ao menos uma submissão confirmada pelo servidor. Tentativa que ' +
          'falhou ao gravar não entra aqui.',
        sessoes: linha.enviaram,
      },
      {
        chave: 'contatoNovo',
        rotulo: 'Trouxeram contato novo',
        definicao:
          'Sessões cujo envio trouxe um contato que este site ainda não conhecia. A ' +
          'diferença para a etapa anterior é gente voltando, não formulário falhando.',
        sessoes: linha.contatoNovo,
      },
    ],
    leadsDistintos: linha.leadsDistintos,
    enviosSemSessao: linha.enviosSemSessao,
    enviosDeContatoConhecido: linha.enviosDeContatoConhecido,
    leadsComOsDoisContatos: linha.leadsComOsDoisContatos,
  };
}

// ───────────────────────────── carteira ─────────────────────────────

export type LinhaCarteira = {
  clienteId: string;
  cliente: string;
  sites: number;
  /** Sites que já receberam ao menos um evento real. Cadastrar não é coletar. */
  sitesComColeta: number;
  sessoes: number;
  cliquesWhatsapp: number;
  leads: number;
  formularios: number;
  sessoesConvertidasAbs: number;
  sessoesAnterior: number;
  leadsAnterior: number;
  ultimoEvento: Date | null;
};

/**
 * Uma linha por cliente, agregando todos os sites dele.
 *
 * Duas decisões que mudam o número e por isso estão explícitas:
 *
 * 1. **A janela é calculada no fuso de CADA site.** Sem isso, a carteira
 *    discordaria do painel individual sempre que dois sites estivessem em
 *    fusos diferentes — e o requisito é que o geral seja exatamente a soma dos
 *    individuais sob os mesmos filtros.
 *
 * 2. **Visitantes únicos NÃO são somados.** Somar únicos de sites diferentes e
 *    chamar de "pessoas únicas da carteira" contaria duas vezes quem visitou
 *    dois sites. Aqui a carteira devolve sessões, que somam sem mentir.
 */
const CARTEIRA_SQL = `
  with janela as (
    select s.id, s.client_id, s.timezone,
           (date_trunc('day', now() at time zone s.timezone)
             - make_interval(days => $1::int - 1)) at time zone s.timezone as inicio,
           (date_trunc('day', now() at time zone s.timezone)
             + interval '1 day')                   at time zone s.timezone as fim
      from sites s
     where s.archived_at is null
  ),
  periodos as (
    select j.*, j.inicio - (j.fim - j.inicio) as inicio_ant, j.inicio as fim_ant
      from janela j
  ),
  por_site as (
    select p.id, p.client_id,
      (select count(*) from sessions se
        where se.site_id = p.id and not se.is_test
          and se.started_at >= p.inicio and se.started_at < p.fim)::int            as sessoes,
      (select count(*) from sessions se
        where se.site_id = p.id and not se.is_test
          and se.started_at >= p.inicio_ant and se.started_at < p.fim_ant)::int    as sessoes_ant,
      (select count(*) from events e join sessions se on se.id = e.session_id
        where se.site_id = p.id and not se.is_test and not e.is_test
          and se.started_at >= p.inicio and se.started_at < p.fim
          and e.type = 'cta_click' and e.subtype = 'whatsapp')::int                as whatsapp,
      (select count(*) from form_submissions fs
        where fs.site_id = p.id and fs.status = 'confirmada' and not fs.is_test
          and fs.created_at >= p.inicio and fs.created_at < p.fim)::int            as formularios,
      (select count(distinct fs.session_id) from form_submissions fs
        where fs.site_id = p.id and fs.status = 'confirmada' and not fs.is_test
          and fs.session_id is not null
          and fs.created_at >= p.inicio and fs.created_at < p.fim)::int            as convertidas,
      (select count(*) from leads l
        where l.site_id = p.id
          and l.first_seen_at >= p.inicio and l.first_seen_at < p.fim)::int        as leads,
      (select count(*) from leads l
        where l.site_id = p.id
          and l.first_seen_at >= p.inicio_ant and l.first_seen_at < p.fim_ant)::int as leads_ant,
      (select max(e.occurred_at) from events e
        where e.site_id = p.id and not e.is_test)                                  as ultimo_evento
      from periodos p
  )
  select c.id                                       as "clienteId",
         c.name                                     as "cliente",
         count(ps.id)::int                          as "sites",
         count(ps.ultimo_evento)::int               as "sitesComColeta",
         coalesce(sum(ps.sessoes), 0)::int          as "sessoes",
         coalesce(sum(ps.whatsapp), 0)::int         as "cliquesWhatsapp",
         coalesce(sum(ps.leads), 0)::int            as "leads",
         coalesce(sum(ps.formularios), 0)::int      as "formularios",
         coalesce(sum(ps.convertidas), 0)::int      as "sessoesConvertidasAbs",
         coalesce(sum(ps.sessoes_ant), 0)::int      as "sessoesAnterior",
         coalesce(sum(ps.leads_ant), 0)::int        as "leadsAnterior",
         max(ps.ultimo_evento)                      as "ultimoEvento"
    from clients c
    left join por_site ps on ps.client_id = c.id
   group by c.id, c.name
   order by c.name
`;

export async function getCarteira(db: Queryable, dias: number): Promise<LinhaCarteira[]> {
  return db.query<LinhaCarteira>(CARTEIRA_SQL, [dias]);
}

/**
 * Totais da carteira. São a soma das linhas, e não uma consulta paralela —
 * duas consultas independentes podem divergir; esta não tem como.
 */
export type TotaisCarteira = {
  clientes: number;
  sites: number;
  sitesComColeta: number;
  sessoes: number;
  cliquesWhatsapp: number;
  leads: number;
  /** Σ convertidas ÷ Σ sessões. NUNCA a média das taxas por cliente. */
  taxaConversao: number | null;
  variacaoSessoes: number | null;
  variacaoLeads: number | null;
};

/** `null` quando não há base: crescimento sobre zero não é infinito, é indefinido. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / anterior;
}

export function totalizarCarteira(linhas: LinhaCarteira[]): TotaisCarteira {
  const soma = (f: (l: LinhaCarteira) => number) => linhas.reduce((t, l) => t + f(l), 0);
  const sessoes = soma((l) => l.sessoes);
  const convertidas = soma((l) => l.sessoesConvertidasAbs);
  const sessoesAnt = soma((l) => l.sessoesAnterior);
  const leads = soma((l) => l.leads);

  return {
    clientes: linhas.length,
    sites: soma((l) => l.sites),
    sitesComColeta: soma((l) => l.sitesComColeta),
    sessoes,
    cliquesWhatsapp: soma((l) => l.cliquesWhatsapp),
    leads,
    taxaConversao: sessoes > 0 ? convertidas / sessoes : null,
    variacaoSessoes: variacao(sessoes, sessoesAnt),
    variacaoLeads: variacao(leads, soma((l) => l.leadsAnterior)),
  };
}
