-- O linter de segurança do Supabase apontou, com razão, que
-- `app.current_account_id()` não fixa o search_path.
--
-- A função é SECURITY INVOKER e só lê um parâmetro de sessão, então o risco
-- prático é pequeno — mas ela é chamada por TODAS as políticas de RLS, e é
-- barato torná-la imune a um search_path manipulado.

create or replace function app.current_account_id() returns uuid
  language sql
  stable
  set search_path = pg_catalog, public
  as $$ select nullif(current_setting('app.account_id', true), '')::uuid $$;
