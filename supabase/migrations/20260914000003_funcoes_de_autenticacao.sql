-- O login acontece ANTES de existir um contexto de conta, então a RLS de
-- `users` (que exige app.account_id) negaria a própria consulta de autenticação.
--
-- A saída não é afrouxar a política: são duas funções SECURITY DEFINER,
-- estreitas e auditáveis, que devolvem exatamente os campos necessários.
-- app_user continua sem SELECT livre sobre `users`.
--
-- `set search_path` é obrigatório em SECURITY DEFINER: sem isso, um schema
-- malicioso no caminho de busca poderia sequestrar os nomes das tabelas.

create or replace function app.find_user_for_login(p_email text)
  returns table (user_id uuid, password_hash text)
  language sql
  security definer
  stable
  set search_path = public, app
  as $$
    select u.id, u.password_hash
      from users u
     where lower(u.email) = lower(p_email)
  $$;

create or replace function app.find_user_for_session(p_user_id uuid)
  returns table (
    user_id uuid, account_id uuid, email text, name text,
    account_name text, is_demo boolean
  )
  language sql
  security definer
  stable
  set search_path = public, app
  as $$
    select u.id, u.account_id, u.email, u.name, a.name, a.is_demo
      from users u
      join accounts a on a.id = u.account_id
     where u.id = p_user_id
  $$;

revoke execute on function app.find_user_for_login(text)    from public;
revoke execute on function app.find_user_for_session(uuid)  from public;
grant  execute on function app.find_user_for_login(text)    to app_user;
grant  execute on function app.find_user_for_session(uuid)  to app_user;
