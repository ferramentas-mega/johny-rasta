-- Onboarding guiado e estado POR RECURSO.
--
-- O problema que esta migração resolve: até aqui o site tinha um estado só,
-- `EstadoRastreamento`, derivado de "chegou algum evento?". Isso não responde as
-- perguntas que o operador realmente faz — o WhatsApp está sendo medido? o
-- formulário chega? a análise técnica roda? — e forçava tratar um site que mede
-- visitas mas não tem formulário como "incompleto" para sempre.
--
-- Aditiva: nenhuma tabela existente perde coluna, e nada do que já funciona
-- muda de significado.

-- ─── cadastro do site: o que o assistente precisa saber ──────────────────────

alter table sites
  -- A plataforma decide QUAIS instruções de instalação mostrar. `desconhecida`
  -- é um valor legítimo ("não sei informar"), não um buraco: quem não sabe
  -- recebe a instrução genérica de HTML, que funciona em qualquer lugar.
  add column platform text not null default 'desconhecida'
    check (platform in ('wordpress', 'react_next', 'html', 'desconhecida')),
  -- URL principal, com esquema. `domain` continua sendo a autoridade sobre qual
  -- origem pode enviar evento; esta é o endereço que se abre e se audita.
  add column primary_url text,
  -- Como o formulário do site funciona. NULL = ainda não perguntado, que é
  -- diferente de 'sem' = perguntado e não existe formulário.
  add column form_mode text check (form_mode in ('proprio', 'externo', 'sem')),
  -- Carimbo da etapa 2 do assistente. Existe para distinguir "não selecionou
  -- nada ainda" de "selecionou e nenhum recurso ficou marcado" — sem ele, os
  -- dois estados são indistinguíveis e o assistente não sabe onde retomar.
  add column recursos_escolhidos_em timestamptz;

-- Domínio duplicado dentro da mesma conta é quase sempre um segundo cadastro
-- por engano — e dois cadastros do mesmo site partem a medição em dois lugares,
-- sem que ninguém perceba. A regra vive no banco porque a verificação na
-- aplicação tem uma janela entre o SELECT e o INSERT.
--
-- Conferido antes de escrever: não há domínio repetido na base de produção.
create unique index sites_conta_dominio_ativo
  on sites (account_id, lower(domain))
  where archived_at is null;

-- ─── estado por recurso ──────────────────────────────────────────────────────
--
-- Uma linha por (site, recurso). NÃO existe `configurado: true` para o site
-- inteiro: um site pode ter visitas verificadas, WhatsApp verificado e nenhum
-- formulário — e isso é uma configuração completa, não uma pendente.
--
-- O que esta tabela guarda é APENAS o que não dá para derivar: a escolha do
-- operador (`selecionado`) e o fato histórico de uma verificação ter dado certo
-- (`verificado_em` + `evidencia`). O estado exibido é calculado a partir disso
-- somado aos dados reais — veja `src/server/services/onboarding.ts`.
create table site_features (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id)    on delete cascade,
  feature       text        not null check (feature in
                              ('visitas', 'whatsapp', 'contatos', 'formularios', 'qualidade')),
  selecionado   boolean     not null default false,
  -- Quando a verificação passou. É um fato do passado: "funcionou durante o
  -- teste". NÃO é o mesmo que "está recebendo eventos agora" — essa segunda
  -- pergunta é respondida por max(occurred_at), e um site de pouco tráfego sem
  -- visita hoje continua verificado.
  verificado_em timestamptz,
  -- A prova. Guardada porque uma verificação sem evidência é indistinguível de
  -- um booleano que alguém marcou.
  evidencia     jsonb,
  -- Erro identificado na última tentativa. Limpo quando a verificação passa.
  erro          text,
  atualizado_em timestamptz not null default now(),
  unique (site_id, feature)
);
create index site_features_site on site_features (site_id);

-- ─── sessão de diagnóstico ───────────────────────────────────────────────────
--
-- Sem isto, "recebemos um clique no WhatsApp" pode ser o clique do operador
-- testando ou o de um visitante de verdade que passou no mesmo minuto. A sessão
-- carrega um token que vai na URL, o coletor devolve o token no evento, e o
-- painel casa os dois.
create table diagnostic_sessions (
  id           uuid        primary key default gen_random_uuid(),
  account_id   uuid        not null references accounts(id) on delete cascade,
  site_id      uuid        not null references sites(id)    on delete cascade,
  -- Vai na URL do site sendo testado. Não é credencial: só marca eventos como
  -- pertencentes a este diagnóstico, e todo evento com token nasce `is_test`.
  token        text        not null,
  aberta_em    timestamptz not null default now(),
  encerrada_em timestamptz
);
create unique index diagnostic_sessions_token on diagnostic_sessions (token);
create index diagnostic_sessions_site on diagnostic_sessions (site_id, aberta_em desc);

-- O token é gravado como TEXTO no evento, sem chave estrangeira, de propósito:
-- resolver a FK exigiria dar SELECT em `diagnostic_sessions` ao papel
-- `app_ingest`, que hoje não enxerga nada além do necessário para gravar. Um
-- token inexistente vira uma string que não casa com nada — e o evento já
-- nasceu marcado como teste, então não entra em relatório algum.
alter table events           add column diagnostic_token text;
alter table form_submissions add column diagnostic_token text;
create index events_diagnostico on events (site_id, diagnostic_token)
  where diagnostic_token is not null;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['site_features', 'diagnostic_sessions']
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

-- Somente o painel. O coletor grava o token no evento, mas não lê nem escreve
-- estas tabelas.
grant select, insert, update, delete on site_features, diagnostic_sessions to app_user;
