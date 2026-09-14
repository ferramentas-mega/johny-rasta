-- Painel Matrix — schema inicial.
-- Escrito para rodar igual no Postgres local e num projeto Supabase.
-- Autorização vive em DUAS camadas: o app filtra por conta, e o banco força RLS.

-- `gen_random_uuid()` é função do núcleo desde o PostgreSQL 13, então não há
-- extensão a instalar. Isso também evita pedir privilégio de extensão em
-- ambientes gerenciados, como o Supabase.

-- ───────────────────────── contas e usuários ─────────────────────────

create table accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  -- Dados de demonstração são uma conta REAL semeada no banco, percorrendo as
  -- mesmas consultas. Não existe caminho paralelo de números fictícios.
  is_demo     boolean     not null default false,
  created_at  timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  email         text        not null,
  password_hash text        not null,
  name          text        not null,
  role          text        not null default 'owner' check (role in ('owner', 'member')),
  created_at    timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create index users_account_idx on users (account_id);

-- ───────────────────────── clientes e sites ─────────────────────────

create table clients (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  name        text        not null,
  notes       text,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index clients_account_idx on clients (account_id);
create unique index clients_account_name_key on clients (account_id, lower(name)) where archived_at is null;

create table sites (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  client_id   uuid        not null references clients(id) on delete restrict,
  name        text        not null,
  domain      text        not null,
  timezone    text        not null default 'America/Sao_Paulo',
  -- Identificador PÚBLICO: endereça o site no coletor, não é credencial.
  public_id   text        not null,
  -- Marca o momento em que o snippet foi exibido ao operador. Serve para
  -- distinguir "aguardando instalação" de "aguardando primeiro evento".
  snippet_seen_at timestamptz,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index sites_public_id_key on sites (public_id);
create index sites_account_idx on sites (account_id);
create index sites_client_idx on sites (client_id);

-- ───────────────────────── coleta ─────────────────────────

create table pages (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id) on delete cascade,
  path          text        not null,
  first_seen_at timestamptz not null default now()
);
create unique index pages_site_path_key on pages (site_id, path);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id) on delete cascade,
  -- Identificador do navegador, rotativo. Não é identidade pessoal.
  visitor_id    text        not null,
  started_at    timestamptz not null,
  -- Sessão expira após 30 min de inatividade; a regra é aplicada na ingestão.
  last_seen_at  timestamptz not null,
  source        text        not null default 'direto',
  medium        text,
  campaign      text,
  referrer_host text,
  device        text        not null default 'Desconhecido',
  entry_page_id uuid        references pages(id) on delete set null,
  is_test       boolean     not null default false
);
create index sessions_site_started_idx on sessions (site_id, started_at desc);
create index sessions_site_visitor_idx on sessions (site_id, visitor_id, last_seen_at desc);

create table events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  site_id     uuid        not null references sites(id) on delete cascade,
  session_id  uuid        not null references sessions(id) on delete cascade,
  page_id     uuid        references pages(id) on delete set null,
  type        text        not null check (type in ('page_view', 'cta_click', 'form_submit_success')),
  -- Subtipo é obrigatório para cta_click e proibido nos demais.
  subtype     text        check (subtype in ('whatsapp', 'phone', 'email', 'form_open', 'outro')),
  button_id   text,
  button_text text,
  button_position text,
  occurred_at timestamptz not null,
  -- IDEMPOTÊNCIA: o coletor gera um uid por gesto do usuário. Reenvio de rede,
  -- script instalado duas vezes e retry do sendBeacon colapsam nesta chave.
  event_uid   uuid        not null,
  is_test     boolean     not null default false,
  received_at timestamptz not null default now(),
  constraint events_subtype_matches_type check (
    (type = 'cta_click' and subtype is not null) or
    (type <> 'cta_click' and subtype is null)
  )
);
create unique index events_event_uid_key on events (event_uid);
create index events_site_occurred_idx on events (site_id, occurred_at desc);
create index events_session_idx on events (session_id);
create index events_site_type_idx on events (site_id, type, occurred_at desc);

-- ───────────────────────── formulários e leads ─────────────────────────

create table leads (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id) on delete cascade,
  client_id     uuid        not null references clients(id) on delete restrict,
  name          text,
  email         text,
  phone         text,
  -- e-mail normalizado, ou telefone só com dígitos. Dedup por site.
  dedupe_key    text        not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create unique index leads_site_dedupe_key on leads (site_id, dedupe_key);
create index leads_site_seen_idx on leads (site_id, first_seen_at desc);
create index leads_client_idx on leads (client_id);

create table form_submissions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  site_id     uuid        not null references sites(id) on delete cascade,
  session_id  uuid        references sessions(id) on delete set null,
  page_id     uuid        references pages(id) on delete set null,
  lead_id     uuid        references leads(id) on delete set null,
  form_name   text        not null,
  -- 'confirmada' só é gravado depois que a transação persiste. Falha de
  -- persistência nunca vira sucesso nem conversão.
  status      text        not null default 'confirmada' check (status in ('confirmada', 'rejeitada')),
  payload     jsonb       not null default '{}'::jsonb,
  idempotency_key uuid    not null,
  is_test     boolean     not null default false,
  created_at  timestamptz not null
);
create unique index form_submissions_idempotency_key on form_submissions (idempotency_key);
create index form_submissions_site_created_idx on form_submissions (site_id, created_at desc);
create index form_submissions_session_idx on form_submissions (session_id);

-- ───────────────────────── integrações (estrutura, sem provedor) ─────────────────────────
-- Nenhum provedor externo é implementado nesta rodada. As tabelas existem para
-- que adicionar um depois seja trabalho aditivo, sem reestruturar o schema.

create table integrations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid        not null references accounts(id) on delete cascade,
  site_id     uuid        not null references sites(id) on delete cascade,
  provider    text        not null,
  status      text        not null default 'pendente' check (status in ('pendente', 'conectada', 'erro')),
  config      jsonb       not null default '{}'::jsonb,
  last_error  text,
  created_at  timestamptz not null default now()
);
create unique index integrations_site_provider_key on integrations (site_id, provider);

create table integration_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid        not null references accounts(id) on delete cascade,
  integration_id uuid        not null references integrations(id) on delete cascade,
  window_start   timestamptz not null,
  window_end     timestamptz not null,
  status         text        not null check (status in ('sucesso', 'erro')),
  message        text,
  ran_at         timestamptz not null default now(),
  -- Impede contabilizar a mesma janela duas vezes como períodos independentes.
  constraint sync_window_ordered check (window_end > window_start)
);
create unique index sync_runs_window_key on integration_sync_runs (integration_id, window_start, window_end);
