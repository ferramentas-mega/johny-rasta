-- Qualidade técnica: URLs monitoradas, fila de auditorias, resultados do
-- Lighthouse, leituras do CrUX e acompanhamento de otimizações.
--
-- Aditiva: nenhuma tabela existente muda. Tudo carimbado com account_id, com
-- RLS forçada e GRANT apenas para app_user — a coleta e os formulários, que
-- rodam com credencial pública, não têm motivo algum para enxergar isto.

-- ─── URLs monitoradas ────────────────────────────────────────────────────────
-- Uma auditoria da Home não representa o site inteiro. Monitorar é decisão
-- explícita, por URL.
create table monitored_urls (
  id         uuid primary key default gen_random_uuid(),
  account_id uuid        not null references accounts(id) on delete cascade,
  site_id    uuid        not null references sites(id)    on delete cascade,
  url        text        not null,
  label      text,
  prioritaria boolean    not null default false,
  created_at timestamptz not null default now(),
  constraint monitored_url_absoluta check (url ~ '^https?://'),
  unique (site_id, url)
);
create index monitored_urls_site on monitored_urls (site_id) where prioritaria;

-- ─── Fila de auditorias ──────────────────────────────────────────────────────
-- O estado é real, não decorativo: 'executando' significa que alguém pegou a
-- tarefa, e 'erro' preserva o motivo.
create table audit_jobs (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id)    on delete cascade,
  url           text        not null,
  strategy      text        not null check (strategy in ('mobile', 'desktop')),
  status        text        not null default 'pendente'
                            check (status in ('pendente','executando','sucesso','erro')),
  tentativas    smallint    not null default 0,
  erro          text,
  origem        text        not null default 'manual' check (origem in ('manual','agendada')),
  criado_em     timestamptz not null default now(),
  iniciado_em   timestamptz,
  concluido_em  timestamptz
);

-- É ESTE índice que impede clique repetido virar tarefa duplicada. A regra vive
-- no banco, não na interface: um botão desabilitado no navegador não impede
-- duas abas, nem uma requisição repetida.
create unique index audit_jobs_sem_duplicata
  on audit_jobs (site_id, url, strategy)
  where status in ('pendente', 'executando');

create index audit_jobs_fila on audit_jobs (status, criado_em) where status = 'pendente';

-- ─── Resultados do Lighthouse ────────────────────────────────────────────────
-- Uma linha por execução. Nova medição NUNCA sobrescreve a anterior: o
-- histórico é o que permite comparar execuções e é o que sustenta "falha
-- externa preserva a última análise válida".
create table lighthouse_results (
  id                 uuid        primary key default gen_random_uuid(),
  account_id         uuid        not null references accounts(id) on delete cascade,
  site_id            uuid        not null references sites(id)    on delete cascade,
  job_id             uuid        references audit_jobs(id) on delete set null,
  url_solicitada     text        not null,
  url_final          text        not null,
  strategy           text        not null check (strategy in ('mobile','desktop')),
  lighthouse_version text,

  -- 0–1 como a API devolve. A conversão para 0–100 é de APRESENTAÇÃO.
  -- `null` significa "a categoria não veio", que não é zero.
  performance        numeric(4,3) check (performance     between 0 and 1),
  acessibilidade     numeric(4,3) check (acessibilidade  between 0 and 1),
  boas_praticas      numeric(4,3) check (boas_praticas   between 0 and 1),
  seo                numeric(4,3) check (seo             between 0 and 1),

  -- Numéricas, para cálculo. Texto formatado ("3,9 s") não entra em conta.
  lcp_ms             numeric,
  fcp_ms             numeric,
  tbt_ms             numeric,           -- NÃO é INP. INP real só existe no CrUX.
  cls                numeric,
  speed_index_ms     numeric,
  tti_ms             numeric,

  -- Diagnósticos realmente retornados, sem lista fixa de ids: a versão do
  -- Lighthouse muda e os ids com ela. Guardado sem as partes pesadas
  -- (capturas de tela), que respondem pela maior parte dos ~880 KB do payload.
  auditorias         jsonb       not null default '{}'::jsonb,
  avisos             jsonb       not null default '[]'::jsonb,
  medido_em          timestamptz not null default now()
);
create index lighthouse_ultima on lighthouse_results (site_id, url_solicitada, strategy, medido_em desc);

-- ─── CrUX ────────────────────────────────────────────────────────────────────
-- Separado do Lighthouse de propósito: um é laboratório, o outro é campo. E o
-- próprio Google já avisa que vai parar de devolver CrUX dentro do PageSpeed.
create table crux_snapshots (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references accounts(id) on delete cascade,
  site_id      uuid        not null references sites(id)    on delete cascade,
  -- 'url' e 'origem' não podem ser confundidos na tela: dado da origem não é
  -- dado da página.
  escopo       text        not null check (escopo in ('url','origem')),
  alvo         text        not null,
  form_factor  text        not null check (form_factor in ('PHONE','DESKTOP','TABLET','ALL')),
  lcp_p75_ms   numeric,
  inp_p75_ms   numeric,
  cls_p75      numeric,
  -- A janela é a que a API devolveu, não o período comercial escolhido na tela.
  janela_inicio date,
  janela_fim    date,
  coletado_em  timestamptz not null default now()
);
create index crux_ultimo on crux_snapshots (site_id, alvo, escopo, form_factor, coletado_em desc);

-- ─── Otimizações ─────────────────────────────────────────────────────────────
-- Marcar como resolvida NÃO altera nenhuma medição: o status vive aqui, as
-- notas vivem em lighthouse_results, e só uma nova execução muda aquelas.
create table optimizations (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id)    on delete cascade,
  url           text,
  tipo          text        not null check (tipo in ('tecnico','comercial','coleta','atualizacao')),
  titulo        text        not null,
  evidencia     jsonb       not null default '{}'::jsonb,
  prioridade    smallint    not null default 2 check (prioridade between 1 and 3),
  status        text        not null default 'pendente'
                            check (status in ('pendente','em_andamento','aguardando_nova_analise',
                                              'resolvida_manual','resolvida_por_verificacao')),
  proxima_acao  text,
  detectado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index optimizations_abertas on optimizations (account_id, prioridade, detectado_em desc)
  where status not in ('resolvida_manual','resolvida_por_verificacao');

-- ─── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['monitored_urls','audit_jobs','lighthouse_results',
                           'crux_snapshots','optimizations']
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

-- Somente o painel. app_ingest e app_forms não recebem GRANT algum aqui.
grant select, insert, update, delete on
  monitored_urls, audit_jobs, lighthouse_results, crux_snapshots, optimizations
  to app_user;
