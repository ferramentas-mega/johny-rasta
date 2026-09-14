-- Autorização no banco. Ocultar dados na interface não é suficiente: aqui a
-- restrição é do Postgres, e vale mesmo que o servidor da aplicação erre.
--
-- Três papéis, com privilégios diferentes:
--   app_user   → o painel. Enxerga apenas a própria conta, via RLS.
--   app_ingest → SOMENTE o endpoint público de analytics (/api/collect).
--                Não recebe nenhum privilégio sobre leads, usuários, clientes
--                ou integrações — nem para ler.
--   app_forms  → o endpoint público de formulários. Acrescenta submissões e
--                leads DO PRÓPRIO SITE, e nada de administrativo.
--
-- Os papéis são criados por scripts/db-setup.ts (são objetos do cluster, não do
-- banco). No Supabase, criam-se uma vez no projeto.

create schema if not exists app;

-- Conta da requisição atual, definida por SET LOCAL a cada transação.
-- Ausente => NULL => nenhuma política casa => nega tudo. O padrão é negar.
create or replace function app.current_account_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;

grant usage on schema public to app_user, app_ingest, app_forms;
grant usage on schema app    to app_user, app_ingest, app_forms;

-- ───────────────────────── RLS em todas as tabelas ─────────────────────────
-- FORCE para que nem o dono da tabela escape das políticas.

do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'users', 'clients', 'sites', 'pages', 'sessions', 'events',
    'leads', 'form_submissions', 'integrations', 'integration_sync_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;

-- ───────────────────────── app_user: só a própria conta ─────────────────────────

grant select, insert, update, delete on
  clients, sites, pages, sessions, events, leads, form_submissions,
  integrations, integration_sync_runs
  to app_user;
grant select on accounts, users to app_user;

create policy accounts_self on accounts for select to app_user
  using (id = app.current_account_id());

create policy users_tenant on users for select to app_user
  using (account_id = app.current_account_id());

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'sites', 'pages', 'sessions', 'events', 'leads',
    'form_submissions', 'integrations', 'integration_sync_runs'
  ] loop
    execute format($f$
      create policy %1$I_tenant on %1$I for all to app_user
        using (account_id = app.current_account_id())
        with check (account_id = app.current_account_id())
    $f$, t);
  end loop;
end $$;

-- ───────────────────────── app_ingest: analytics e nada mais ─────────────────────────
-- Resolve o site pelo identificador público, abre/atualiza sessão e grava
-- eventos. Deliberadamente SEM grant em leads, form_submissions, users,
-- clients, accounts e integrations: a tentativa falha por permissão.

grant select                 on sites    to app_ingest;
grant select, insert         on pages    to app_ingest;
grant select, insert, update on sessions to app_ingest;
grant select, insert         on events   to app_ingest;

create policy sites_ingest    on sites    for select to app_ingest using (archived_at is null);
create policy pages_ingest    on pages    for all    to app_ingest using (true) with check (true);
create policy sessions_ingest on sessions for all    to app_ingest using (true) with check (true);
create policy events_ingest   on events   for all    to app_ingest using (true) with check (true);

-- ───────────────────────── app_forms: submissões e leads do site ─────────────────────────

grant select                 on sites            to app_forms;
grant select, insert         on pages            to app_forms;
grant select, insert, update on sessions         to app_forms;
grant select, insert         on events           to app_forms;
grant select, insert, update on leads            to app_forms;
grant select, insert, update on form_submissions to app_forms;

create policy sites_forms     on sites            for select to app_forms using (archived_at is null);
create policy pages_forms     on pages            for all    to app_forms using (true) with check (true);
create policy sessions_forms  on sessions         for all    to app_forms using (true) with check (true);
create policy events_forms    on events           for all    to app_forms using (true) with check (true);
create policy leads_forms     on leads            for all    to app_forms using (true) with check (true);
create policy subs_forms      on form_submissions for all    to app_forms using (true) with check (true);
