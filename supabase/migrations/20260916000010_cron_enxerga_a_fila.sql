-- O cron não enxergava a fila. Nem uma linha.
--
-- ─── O defeito ───────────────────────────────────────────────────────────────
--
-- `audit_jobs`, `monitored_urls`, `lighthouse_results` e `crux_snapshots` têm
-- RLS FORCE com política `using (account_id = app.current_account_id())`. Os
-- dois endpoints de cron rodavam com `withoutAccount`, que abre a transação SEM
-- `set_config('app.account_id', …)`. Sem isso `app.current_account_id()` devolve
-- NULL, `account_id = NULL` é NULL, nenhuma linha casa — e o padrão é negar.
--
-- Medido contra o banco de testes, com um job pendente inserido como
-- superusuário:
--
--   Jobs pendentes (superusuário):                    1
--   Jobs pendentes (app_user sem conta, = cron hoje): 0
--   Jobs pendentes (app_user COM conta):              1
--
-- Consequência: `/api/auditorias/agendar` enfileirava zero e respondia
-- `{"enfileiradas": 0}`; `/api/auditorias/processar` devolvia "fila vazia" todo
-- dia. Nenhum erro em lugar nenhum — os dois endpoints eram um no-op que se
-- declarava bem-sucedido. E, se a reivindicação tivesse funcionado,
-- `registrarSucesso` gravaria `account_id = app.current_account_id()`, que é
-- NULL numa coluna NOT NULL: falha na hora de salvar o trabalho já feito.
--
-- ─── A correção, e por que esta ──────────────────────────────────────────────
--
-- A tentação é dar BYPASSRLS ao papel do cron, ou rodar a fila inteira numa
-- consulta sem conta. As duas trocam um endpoint quebrado por um endpoint que
-- enxerga TODAS as contas de uma vez — e qualquer defeito ali vira vazamento
-- entre clientes, que é a única coisa que este projeto não pode errar.
--
-- Em vez disso, o cron pergunta ao banco QUAIS CONTAS têm trabalho, e depois
-- processa cada uma dentro de `withAccount`, exatamente como um usuário logado
-- daquela conta. A política continua valendo o tempo todo; o raio de um erro no
-- cron é uma conta, não a base.
--
-- É o mesmo desenho do login (`app.find_user_for_login`): uma função
-- `SECURITY DEFINER` estreita, que devolve o mínimo necessário, em vez de
-- afrouxar a política. Estas devolvem apenas identificadores de conta — nenhum
-- dado de cliente, nenhuma URL, nenhuma nota.

-- ─────────────────────────────────────────────────────────────────────────────
-- Contas com trabalho pendente na fila, mais antigo primeiro.
--
-- Devolve `setof uuid` e não um uuid só: o processador pega a primeira, mas o
-- chamador precisa saber se há outras para relatar honestamente quanto sobrou.
create or replace function app.contas_com_job_pendente(p_minutos_abandono integer)
returns setof uuid
language sql
security definer
set search_path = app, public, pg_temp
as $$
  select account_id
    from audit_jobs
   where status = 'pendente'
      or (status = 'executando' and iniciado_em < now() - make_interval(mins => p_minutos_abandono))
   group by account_id
   order by min(criado_em)
$$;

revoke all on function app.contas_com_job_pendente(integer) from public;
grant execute on function app.contas_com_job_pendente(integer) to app_user;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contas com URL prioritária vencida, esperando entrar na fila.
--
-- A regra de vencimento (sete dias sem análise) fica aqui e na consulta do
-- endpoint, que é a que de fato enfileira. Esta função só responde "onde há
-- trabalho", para o endpoint abrir uma transação por conta.
create or replace function app.contas_com_auditoria_vencida(p_dias integer)
returns setof uuid
language sql
security definer
set search_path = app, public, pg_temp
as $$
  select distinct m.account_id
    from monitored_urls m
   where m.prioritaria
     and not exists (
       select 1
         from lighthouse_results r
        where r.site_id = m.site_id
          and r.url_solicitada = m.url
          and r.medido_em > now() - make_interval(days => p_dias)
     )
$$;

revoke all on function app.contas_com_auditoria_vencida(integer) from public;
grant execute on function app.contas_com_auditoria_vencida(integer) to app_user;
