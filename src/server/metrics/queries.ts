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

/** Submissões confirmadas recebidas na janela. */
const SUBMISSIONS = `
  subs as (
    select fs.id, fs.session_id, fs.page_id, fs.form_name, fs.created_at
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
