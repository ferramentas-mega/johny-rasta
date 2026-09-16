import 'server-only';
import type { Queryable } from '@/server/db';

/**
 * "Onde atuar primeiro".
 *
 * **A lista é o SINAL; a tabela é só o acompanhamento.** É a espinha dorsal
 * deste arquivo.
 *
 *  - O que aparece é sempre derivado dos dados, calculado na hora. Some sozinho
 *    quando a causa some — nunca porque alguém disse que resolveu.
 *  - `optimizations` guarda o que o operador marcou, e só isso. Entra por
 *    `left join`, contribuindo a situação. Nunca cria linha na lista.
 *
 * Antes, a tabela era um `union all` com as derivadas — e **nada no projeto
 * escrevia nela**, então aquele ramo nunca devolvia linha e a coluna "Situação"
 * mostrava "Pendente" para sempre. Pior: se alguém tivesse escrito, o item
 * apareceria DUAS vezes, uma pela tabela e outra pelo sinal.
 *
 * **Marcar como resolvida não apaga o sinal.** Se a nota continua baixa, o item
 * continua na lista — com a marcação ao lado, e dizendo que o sinal persiste.
 * Esconder seria o mesmo `configurado: true` que este projeto recusa em todo
 * lugar: estado é derivado, não declarado.
 *
 * Duas coisas que esta lista NÃO faz, de propósito:
 *
 *  1. Não conclui que o rastreamento quebrou porque um site ficou sem eventos.
 *     Site de pouco tráfego passa dias sem visita, e isso é normal. O aviso só
 *     aparece quando o site JÁ coletou com regularidade e parou.
 *  2. Não afirma que lentidão causou queda de conversão. Os dois sinais podem
 *     aparecer juntos sem um causar o outro; a lista mostra os dois separados e
 *     deixa a conclusão para quem investiga.
 */

import type { ChaveDoSinal, Otimizacao, StatusManual, TipoOtimizacao } from '@/lib/otimizacoes';

/** Reexporta o módulo puro para quem consome ter um import só. */
export * from '@/lib/otimizacoes';

/** Nota abaixo disto, numa URL monitorada, vira item da lista. */
const DESEMPENHO_RUIM = 0.5;
/** Depois disto, a análise é velha o bastante para não sustentar decisão. */
const DIAS_ANALISE_VENCIDA = 14;
/** Sem evento por mais tempo que isto, num site que coletava, é suspeito. */
const DIAS_SEM_EVENTO = 3;

type LinhaBruta = {
  id: string | null;
  site_id: string;
  site: string;
  cliente: string;
  url: string | null;
  tipo: TipoOtimizacao;
  titulo: string;
  evidencia: string;
  prioridade: number;
  status: string;
  proxima_acao: string;
  detectado_em: Date;
};

/**
 * A definição dos sinais, em SQL, num lugar só.
 *
 * Duas consultas precisam dela: a que LISTA o que está acontecendo agora, e a
 * que FECHA por verificação o que deixou de acontecer. Com uma cópia em cada,
 * elas divergiriam na primeira correção feita só numa — e o modo de falhar
 * seria péssimo: item fechado como resolvido enquanto a lista continua
 * mostrando o problema, ou o contrário.
 *
 * Parâmetros, na ordem: $1 nota ruim, $2 dias para análise vencida, $3 dias sem
 * evento.
 */
const SINAIS_SQL = `
    -- 1. Desempenho ruim numa URL monitorada. Compara a análise MAIS RECENTE de
    --    cada par (url, dispositivo): uma medição antiga não sustenta alerta.
    select r.site_id, s.name, c.name, r.url_solicitada, 'tecnico',
           'Desempenho baixo em página monitorada',
           'Nota ' || round(r.performance * 100) || '/100 no ' ||
             case r.strategy when 'mobile' then 'celular' else 'computador' end,
           1, 'Abrir Qualidade técnica e ver os diagnósticos', r.medido_em
      from (
        select distinct on (site_id, url_solicitada, strategy)
               site_id, url_solicitada, strategy, performance, medido_em
          from lighthouse_results
         order by site_id, url_solicitada, strategy, medido_em desc
      ) r
      join sites s   on s.id = r.site_id
      join clients c on c.id = s.client_id
     where r.performance is not null and r.performance < $1

    union all

    -- 2. URL prioritária sem análise, ou com análise velha.
    select m.site_id, s.name, c.name, m.url, 'atualizacao',
           case when ultima.medido_em is null
                then 'URL prioritária nunca analisada'
                else 'Análise desatualizada' end,
           coalesce('Última análise em ' || to_char(ultima.medido_em,'DD/MM/YYYY'),
                    'Nenhuma análise registrada'),
           2, 'Executar análise', coalesce(ultima.medido_em, m.created_at)
      from monitored_urls m
      join sites s   on s.id = m.site_id
      join clients c on c.id = s.client_id
      left join lateral (
        select max(medido_em) as medido_em from lighthouse_results r
         where r.site_id = m.site_id and r.url_solicitada = m.url
      ) ultima on true
     where m.prioritaria
       and (ultima.medido_em is null
            or ultima.medido_em < now() - make_interval(days => $2::int))

    union all

    -- 3. Site que COLETAVA e parou.
    --
    --    A condição de ter mais de 30 eventos é o que separa "parou de coletar"
    --    de "site de pouco tráfego". Sem ela, todo site pequeno viraria alarme
    --    falso — e alarme falso treina o usuário a ignorar a lista.
    select s.id, s.name, c.name, null, 'coleta',
           'Sem eventos recentes num site que coletava',
           'Último evento em ' || to_char(e.ultimo,'DD/MM/YYYY') ||
             ' · ' || e.total || ' eventos no histórico',
           1, 'Conferir se o script continua instalado', e.ultimo
      from sites s
      join clients c on c.id = s.client_id
      join lateral (
        select max(occurred_at) as ultimo, count(*) as total
          from events ev where ev.site_id = s.id and not ev.is_test
      ) e on true
     where s.archived_at is null
       and e.total > 30
       and e.ultimo < now() - make_interval(days => $3::int)
`;

/** As colunas de `SINAIS_SQL`, na ordem em que ele as devolve. */
const SINAIS_COLUNAS =
  'site_id, site, cliente, url, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em';

export async function listarOtimizacoes(db: Queryable): Promise<Otimizacao[]> {
  const linhas = await db.query<LinhaBruta>(
    `
    with sinais (${SINAIS_COLUNAS}) as (${SINAIS_SQL})
    -- O acompanhamento entra por LEFT JOIN: acrescenta situação a um sinal que
    -- existe, e nunca cria linha. Um registro cujo sinal sumiu simplesmente não
    -- aparece — a ausência do sinal é a prova de que acabou.
    select o.id, sinais.site_id, sinais.site, sinais.cliente, sinais.url, sinais.tipo,
           sinais.titulo, sinais.evidencia, sinais.prioridade,
           coalesce(o.status, 'pendente') as status,
           sinais.proxima_acao, sinais.detectado_em
      from sinais
      left join optimizations o
        on o.site_id = sinais.site_id
       and o.tipo    = sinais.tipo
       and coalesce(o.url, '') = coalesce(sinais.url, '')
       and o.titulo  = sinais.titulo
    order by sinais.prioridade, sinais.detectado_em desc
    `,
    [DESEMPENHO_RUIM, DIAS_ANALISE_VENCIDA, DIAS_SEM_EVENTO],
  );

  return linhas.map((l) => ({
    id: l.id,
    siteId: l.site_id,
    site: l.site,
    cliente: l.cliente,
    url: l.url,
    tipo: l.tipo,
    titulo: l.titulo,
    evidencia: l.evidencia,
    prioridade: l.prioridade,
    status: l.status,
    proximaAcao: l.proxima_acao,
    detectadoEm: l.detectado_em,
  }));
}

/**
 * Registra o acompanhamento de um sinal.
 *
 * A guarda de dono não é redundante com a RLS. A política de `optimizations`
 * casa por `account_id`, e o valor gravado vem de `app.current_account_id()`:
 * o de quem escreve. A conta A conseguiria gravar uma linha apontando para um
 * site da conta B — a política aprova, porque a linha É da conta A. Com o
 * índice único por sinal, isso trancaria o dono legítimo contra um registro que
 * ele nem enxerga. Mesma armadilha de `site_features`, já no CLAUDE.md: o
 * índice garante integridade, não autorização.
 */
export async function marcarOtimizacao(
  db: Queryable,
  sinal: ChaveDoSinal,
  status: StatusManual,
  proximaAcao: string,
  evidencia: string,
): Promise<void> {
  const dono = await db.one<{ id: string }>('select id from sites where id = $1', [sinal.siteId]);
  if (!dono) throw new Error('Site não encontrado nesta conta.');

  // A evidência do momento da marcação é o "antes" do par. Guardada agora
  // porque depois não dá: quando o sinal some, o que o causou já não existe
  // para ser lido. `coalesce` na atualização preserva a primeira — a marcação
  // original é o fato datado, e reescrevê-la a cada troca de status apagaria de
  // onde se partiu.
  await db.query(
    `insert into optimizations
       (account_id, site_id, url, tipo, titulo, prioridade, status, proxima_acao,
        evidencia, atualizado_em)
     values (app.current_account_id(), $1, $2, $3, $4, 2, $5, $6,
             jsonb_build_object('texto', $7::text, 'em', now()), now())
     on conflict (site_id, tipo, coalesce(url, ''), titulo) do update
        set status    = excluded.status,
            evidencia = case
                          when optimizations.evidencia ? 'texto' then optimizations.evidencia
                          else excluded.evidencia
                        end,
            atualizado_em = now()`,
    [sinal.siteId, sinal.url, sinal.tipo, sinal.titulo, status, proximaAcao, evidencia],
  );
}

/**
 * Fecha, por VERIFICAÇÃO, o acompanhamento cujo sinal deixou de ser detectado.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 *
 * `resolvida_por_verificacao` era um status que ninguém alcançava. Quando o
 * sinal sumia, a linha de acompanhamento simplesmente parava de aparecer — e
 * ficava no banco para sempre com o último status que o operador tinha posto,
 * "em andamento" inclusive. Não sobrava registro de que **a medição** resolveu,
 * nem quando, nem partindo de quanto.
 *
 * ── Onde roda, e por quê ─────────────────────────────────────────────────────
 *
 * No momento em que uma análise nova é gravada (`registrarSucesso`), e na mesma
 * transação dela. É o único instante em que um sinal técnico pode ter acabado de
 * desaparecer, e amarrar as duas escritas juntas evita o estado intermediário em
 * que a medição existe e o fechamento não.
 *
 * Não roda na leitura da tela, de propósito: escrever durante o render de uma
 * página é o caminho para um `revalidatePath` proibido e para gravação disparada
 * por quem só estava olhando.
 *
 * ── O que ele NÃO afirma ─────────────────────────────────────────────────────
 *
 * Que a correção do operador causou a melhora. Ele guarda as duas medições — a
 * de quando foi marcado e a de agora — e a data. Quem lê tira a conclusão; o
 * painel não conclui causalidade, aqui como em todo o resto.
 */
export async function fecharPorVerificacao(db: Queryable, siteId: string): Promise<number> {
  const fechadas = await db.query<{ id: string }>(
    `
    with sinais (${SINAIS_COLUNAS}) as (${SINAIS_SQL})
    update optimizations o
       set status = 'resolvida_por_verificacao',
           evidencia = coalesce(o.evidencia, '{}'::jsonb) || jsonb_build_object(
             'resolvidoEm', to_jsonb(now()),
             'resolvidoPor', 'nova medição',
             -- O "depois". Nulo quando o tipo não tem URL (o sinal de coleta
             -- vale para o site inteiro), e nulo é honesto: não havia número.
             'notaDepois', (
               select round(r.performance * 100)
                 from lighthouse_results r
                where r.site_id = o.site_id
                  and r.url_solicitada = o.url
                  and r.performance is not null
                order by r.medido_em desc
                limit 1
             )
           ),
           atualizado_em = now()
     where o.site_id = $4
       and o.status <> 'resolvida_por_verificacao'
       and not exists (
         select 1 from sinais s
          where s.site_id = o.site_id
            and s.tipo    = o.tipo
            and coalesce(s.url, '') = coalesce(o.url, '')
            and s.titulo  = o.titulo
       )
    returning o.id`,
    [DESEMPENHO_RUIM, DIAS_ANALISE_VENCIDA, DIAS_SEM_EVENTO, siteId],
  );
  return fechadas.length;
}

export type ResolvidaPorVerificacao = {
  site: string;
  url: string | null;
  titulo: string;
  antes: string | null;
  notaDepois: number | null;
  resolvidoEm: Date;
};

/** As que a medição fechou, para a tela poder mostrar que o ciclo se fecha. */
export async function resolvidasPorVerificacao(
  db: Queryable,
  dias: number,
): Promise<ResolvidaPorVerificacao[]> {
  return db.query<ResolvidaPorVerificacao>(
    `select s.name as site, o.url, o.titulo,
            o.evidencia->>'texto'                     as antes,
            (o.evidencia->>'notaDepois')::int         as "notaDepois",
            (o.evidencia->>'resolvidoEm')::timestamptz as "resolvidoEm"
       from optimizations o
       join sites s on s.id = o.site_id
      where o.status = 'resolvida_por_verificacao'
        and (o.evidencia->>'resolvidoEm')::timestamptz > now() - make_interval(days => $1::int)
      order by (o.evidencia->>'resolvidoEm')::timestamptz desc
      limit 20`,
    [dias],
  );
}
