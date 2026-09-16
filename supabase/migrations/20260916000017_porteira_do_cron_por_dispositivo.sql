-- A porteira do cron perguntava uma coisa e o trabalho era outra.
--
-- ─── O defeito, medido em produção ───────────────────────────────────────────
--
-- `/api/auditorias/agendar` funciona em dois passos: pergunta a
-- `app.contas_com_auditoria_vencida` QUAIS CONTAS têm trabalho e, dentro de uma
-- transação por conta, roda o `insert` que de fato enfileira.
--
-- O `insert` decide por (url, ESTRATÉGIA): ele cruza as URLs prioritárias com
-- mobile e desktop e enfileira o par que não tem análise recente. A função não
-- olhava estratégia nenhuma — bastava UMA análise da URL nos últimos sete dias,
-- de qualquer dispositivo, para ela considerar a conta em dia.
--
-- Então a conta nunca entrava na lista, a transação nunca abria, e o `insert`
-- que enfileiraria a análise que falta nunca rodava. Medido no banco de produção
-- em 16/09/2026:
--
--   url                              dispositivo  última análise        insert enfileiraria?
--   agenciaadrmarketing.com/         desktop      (nenhuma)             SIM
--   agenciaadrmarketing.com/         mobile       15/09 03:45           não
--   …
--   contas_com_auditoria_vencida(7):  0
--
-- Uma página prioritária sem NENHUMA medição de computador, e o agendador
-- respondendo que estava tudo em dia. O sintoma é o de sempre neste projeto: um
-- no-op que se declara bem-sucedido, e o relatório fica com metade das medições
-- sem nunca dizer que falta alguma.
--
-- ─── A correção ──────────────────────────────────────────────────────────────
--
-- A pergunta passa a ser a mesma que o trabalho faz: existe par (url,
-- dispositivo) prioritário sem análise daquele dispositivo nos últimos N dias?
--
-- É uma migração SEGURA nos dois sentidos, e por isso não tem a assimetria de
-- ordem das outras: a função nova devolve um SUPERCONJUNTO de contas, e quem
-- decide o que enfileirar continua sendo o `insert`, que já filtrava por
-- estratégia. Contra o código antigo, no pior caso ela abre uma transação que
-- não insere nada.
--
-- A lição, que vale além daqui: quando um processo pergunta "onde há trabalho"
-- e depois faz o trabalho com outro critério, os dois critérios têm de ser o
-- MESMO. Separados, a divergência não dá erro — ela dá silêncio.

create or replace function app.contas_com_auditoria_vencida(p_dias integer)
returns setof uuid
language sql
security definer
set search_path = app, public, pg_temp
as $$
  select distinct m.account_id
    from monitored_urls m
    cross join (values ('mobile'), ('desktop')) as d(strategy)
   where m.prioritaria
     and not exists (
       select 1
         from lighthouse_results r
        where r.site_id = m.site_id
          and r.url_solicitada = m.url
          and r.strategy = d.strategy
          and r.medido_em > now() - make_interval(days => p_dias)
     )
$$;

revoke all on function app.contas_com_auditoria_vencida(integer) from public;
grant execute on function app.contas_com_auditoria_vencida(integer) to app_user;
