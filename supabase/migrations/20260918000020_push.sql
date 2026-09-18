-- Web Push: inscrições por usuário/dispositivo, e o registro do que já foi
-- avisado — para não avisar a mesma coisa todo dia.
--
-- Uma inscrição é UM navegador de UM usuário. O mesmo usuário tem várias
-- (PC, notebook, celular), e o envio vai para todas. A política de RLS casa
-- por conta, como tudo; o serviço filtra por `user_id` para o que é do
-- usuário (listar/remover as próprias), e o envio é para os usuários da
-- conta — nunca de outra.
--
-- Nenhum segredo aqui: `p256dh` e `auth` são as chaves PÚBLICAS de
-- criptografia da inscrição, que o navegador entrega ao servidor de propósito.
-- A chave privada VAPID vive só em variável de ambiente.

create table push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  user_id     uuid        not null references users(id)    on delete cascade,
  endpoint    text        not null unique,
  p256dh      text        not null,
  auth        text        not null,
  user_agent  text,
  criada_em   timestamptz not null default now(),
  ultimo_ok   timestamptz
);
create index push_subscriptions_conta on push_subscriptions (account_id, user_id);

-- O que já foi avisado, por conta e por chave de aviso. Uma linha existe
-- enquanto o aviso existe: some do banco quando o aviso some, e se o mesmo
-- fato voltar, avisa de novo — deduplicação por MUDANÇA DE ESTADO, não por
-- tempo.
create table push_enviados (
  account_id  uuid        not null references accounts(id) on delete cascade,
  chave       text        not null,
  enviado_em  timestamptz not null default now(),
  primary key (account_id, chave)
);

do $$
declare t text;
begin
  foreach t in array array['push_subscriptions','push_enviados']
  loop
    execute format('alter table %1$I enable row level security', t);
    execute format('alter table %1$I force  row level security', t);
    execute format($f$
      create policy %1$I_tenant on %1$I for all to app_user
        using (account_id = app.current_account_id())
        with check (account_id = app.current_account_id())
    $f$, t);
  end loop;
end $$;

grant select, insert, update, delete on push_subscriptions, push_enviados to app_user;

-- Porteira do cron: quais contas têm alguém inscrito. Mesma forma das outras
-- porteiras — SECURITY DEFINER estreita, devolve só identificadores, e o
-- cron processa cada conta dentro de withAccount.
create or replace function app.contas_com_push() returns setof uuid
  language sql stable security definer
  set search_path = public, pg_temp
  as $$ select distinct account_id from push_subscriptions $$;
grant execute on function app.contas_com_push() to app_user;
