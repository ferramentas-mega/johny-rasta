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

export async function listarOtimizacoes(db: Queryable): Promise<Otimizacao[]> {
  const linhas = await db.query<LinhaBruta>(
    `
    with sinais (
      site_id, site, cliente, url, tipo, titulo, evidencia,
      prioridade, proxima_acao, detectado_em
    ) as (
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
    )
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
): Promise<void> {
  const dono = await db.one<{ id: string }>('select id from sites where id = $1', [sinal.siteId]);
  if (!dono) throw new Error('Site não encontrado nesta conta.');

  await db.query(
    `insert into optimizations
       (account_id, site_id, url, tipo, titulo, prioridade, status, proxima_acao, atualizado_em)
     values (app.current_account_id(), $1, $2, $3, $4, 2, $5, $6, now())
     on conflict (site_id, tipo, coalesce(url, ''), titulo) do update
        set status = excluded.status, atualizado_em = now()`,
    [sinal.siteId, sinal.url, sinal.tipo, sinal.titulo, status, proximaAcao],
  );
}
