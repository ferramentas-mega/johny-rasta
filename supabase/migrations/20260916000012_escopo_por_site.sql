-- Os papéis públicos passam a enxergar UM site, não todos.
--
-- ─── O que estava aberto ─────────────────────────────────────────────────────
--
-- `app_ingest` e `app_forms` tinham políticas `using (true)` em `pages`,
-- `sessions`, `events`, `leads` e `form_submissions`. Traduzindo: o papel do
-- endpoint público de formulários podia ler os leads de TODAS as contas.
--
-- Não havia vazamento em curso — as consultas dos dois endpoints sempre
-- filtram por site, e são parametrizadas. Mas essa era a única parte do sistema
-- onde quem protegia era o código, e não a política. Em todo o resto, um erro de
-- consulta devolve vazio; ali, devolveria a base inteira.
--
-- ─── Como fica ───────────────────────────────────────────────────────────────
--
-- Mesmo mecanismo do painel, um nível abaixo: `set_config('app.site_id', …,
-- true)` a cada transação, e as políticas casam por `site_id`. Sem o ajuste,
-- `app.current_site_id()` devolve NULL, `site_id = NULL` é NULL, e o resultado é
-- vazio. **O padrão continua sendo negar.**
--
-- `sites` é a exceção necessária, e ela é estreita: é lendo `sites` que o
-- endpoint DESCOBRE qual site é o da requisição, pelo identificador público que
-- está no HTML de quem instalou. A política dela continua sendo "não arquivado",
-- e ela só concede SELECT — nenhum dos dois papéis escreve em `sites`.
--
-- ─── O que isto NÃO resolve ──────────────────────────────────────────────────
--
-- O identificador público continua público: quem o tem envia eventos daquele
-- site. Isso é da natureza de um coletor no navegador, e quem limita o abuso é o
-- rate limit por site, não a política. O que muda aqui é o alcance de um ERRO:
-- antes, um defeito de consulta podia expor a base; agora, no máximo um site.

create or replace function app.current_site_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.site_id', true), '')::uuid $$;

grant execute on function app.current_site_id() to app_ingest, app_forms;

-- ─── app_ingest ──────────────────────────────────────────────────────────────

drop policy pages_ingest    on pages;
drop policy sessions_ingest on sessions;
drop policy events_ingest   on events;

create policy pages_ingest on pages for all to app_ingest
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy sessions_ingest on sessions for all to app_ingest
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy events_ingest on events for all to app_ingest
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

-- ─── app_forms ───────────────────────────────────────────────────────────────

drop policy pages_forms    on pages;
drop policy sessions_forms on sessions;
drop policy events_forms   on events;
drop policy leads_forms    on leads;
drop policy subs_forms     on form_submissions;

create policy pages_forms on pages for all to app_forms
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy sessions_forms on sessions for all to app_forms
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy events_forms on events for all to app_forms
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy leads_forms on leads for all to app_forms
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());

create policy subs_forms on form_submissions for all to app_forms
  using (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());
