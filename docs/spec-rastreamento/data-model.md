# Modelo de dados

O esquema mínimo para o rastreamento de botões. SQL como **referência concreta** 🔧; o que cada
restrição garante está em prosa, para quem for traduzir para outro armazenamento.

Regra de leitura: onde diz "**NÃO é**", é correção de uma interpretação que já causou defeito.

---

## Visão geral

```
accounts ──┬── sites ──┬── pages ──────┐
           │           ├── sessions ───┼── events
           │           └───────────────┘
           └── (demais tabelas do produto)
```

Quatro tabelas participam do rastreamento de botões. `events` é a única que guarda clique.

---

## `sites`

O que o identificador público endereça.

```sql
create table sites (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  name        text not null,
  domain      text not null,
  timezone    text not null default 'America/Sao_Paulo',
  public_id   text not null,      -- endereça o site no coletor
  snippet_seen_at timestamptz,    -- quando o snippet foi EXIBIDO ao operador
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create unique index sites_public_id_key on sites (public_id);
```

**`public_id` NÃO é credencial.** Ele está no HTML de quem instalou; qualquer um pode lê-lo e enviar
eventos daquele site. É da natureza de um coletor no navegador. Quem contém abuso é o limite por
site (D-10).

**`timezone` é do site, não do servidor.** Todo recorte por dia usa o fuso do site. Renderizar em
UTC no servidor foi defeito real: o horário não batia com o relógio de quem olhava.

**`snippet_seen_at` NÃO é "instalado".** Marca que o operador **viu** o código. Serve só para
separar "aguardando instalação" de "aguardando primeiro evento" — a instalação continua sendo
provada por evento recebido (P-4).

**`domain` é usado para conferir a origem** das requisições de coleta, aceitando subdomínios.

---

## `pages`

```sql
create table pages (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  path          text not null,
  first_seen_at timestamptz not null default now()
);
create unique index pages_site_path_key on pages (site_id, path);
```

**`path` já chega normalizado** (D-14). A normalização acontece na ingestão, nunca na leitura.

O índice único é o que permite "insere, ignora conflito" — que evita conceder escrita de atualização
ao papel público (D-15).

---

## `sessions`

```sql
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  site_id       uuid not null references sites(id) on delete cascade,
  visitor_id    text not null,          -- rotativo. NÃO é identidade pessoal
  started_at    timestamptz not null,
  last_seen_at  timestamptz not null,   -- expira com 30 min de inatividade
  source        text not null default 'direto',
  medium        text,
  campaign      text,
  referrer_host text,
  device        text not null default 'Desconhecido',
  entry_page_id uuid references pages(id) on delete set null,
  is_test       boolean not null default false
);
create index sessions_site_started_idx on sessions (site_id, started_at desc);
create index sessions_site_visitor_idx on sessions (site_id, visitor_id, last_seen_at desc);
```

**`visitor_id` NÃO é identidade pessoal.** É um valor gerado no navegador. Some quando a pessoa
limpa o armazenamento, e não existe entre dispositivos: a mesma pessoa no celular e no computador
são dois visitantes, e o sistema não finge o contrário.

**`is_test` participa da busca por sessão aberta.** Uma sessão de diagnóstico e uma sessão real do
mesmo navegador não podem se misturar.

**`source` diz "direto" quando não há UTM nem referenciador** — é uma afirmação. "Não identificado"
fica para o que chega ilegível. Não são a mesma coisa (P-7).

**A janela de 30 minutos é regra da aplicação, não do esquema.** A coluna guarda o instante; a
decisão de expirar vive na ingestão, num lugar só.

**O índice composto começa por `site_id`** — prefixo mais à esquerda: serve "tudo do site" e "do
site por visitante". O inverso só serviria a busca por visitante.

---

## `events`

A tabela do clique.

```sql
create table events (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  site_id     uuid not null references sites(id) on delete cascade,
  session_id  uuid not null references sessions(id) on delete cascade,
  page_id     uuid references pages(id) on delete set null,

  type        text not null check (type in ('page_view', 'cta_click', 'form_submit_success')),
  subtype     text check (subtype in ('whatsapp', 'phone', 'email', 'form_open', 'outro')),

  button_id       text,   -- nome no relatório, ou 'auto:<subtipo>'
  button_text     text,   -- rótulo visível no momento do clique
  button_position text,   -- RÓTULO de lugar. NUNCA coordenada

  occurred_at timestamptz not null,
  event_uid   uuid not null,          -- idempotência: um gesto, um evento
  is_test     boolean not null default false,
  received_at timestamptz not null default now(),
  diagnostic_token text,

  constraint events_subtype_matches_type check (
    (type =  'cta_click' and subtype is not null) or
    (type <> 'cta_click' and subtype is null)
  )
);
create unique index events_event_uid_key   on events (event_uid);
create index events_site_occurred_idx      on events (site_id, occurred_at desc);
create index events_session_idx            on events (session_id);
create index events_site_type_idx          on events (site_id, type, occurred_at desc);
create index events_diagnostico            on events (site_id, diagnostic_token)
  where diagnostic_token is not null;
```

### Coluna por coluna, o que ela NÃO é

**`event_uid`** — o cumprimento de P-1. O índice único **é** o mecanismo; a aplicação só insere
ignorando conflito e lê o retorno vazio como "duplicata". Não é conferência do código.

**`button_id`** — identidade no relatório. O prefixo `auto:` marca detecção sem nome declarado
(D-4). **NÃO é único por botão físico**: o mesmo valor repetido em botões diferentes vira uma linha
só (P-9). Isso se resolve na marcação, não na consulta.

**`button_text`** — o rótulo **no momento do clique**. Por isso o inventário lê o mais recente: o
texto muda quando alguém reescreve a página (RF-026).

**`button_position`** — **rótulo**, não coordenada (D-7). É o ponto em que uma reimplementação vai
ser tentada a "melhorar" guardando `clientX`/`clientY`. Isso é mapa de calor e muda o que o coletor
é (D-9).

**`occurred_at`** — instante do **gesto**, vindo do cliente e validado contra o relógio do servidor
(RF-019).
**`received_at`** — quando chegou. Os dois existem porque `sendBeacon` pode entregar depois.

**`is_test`** — decidido no servidor (P-3). Fora de toda agregação comercial.

**`diagnostic_token`** — texto **sem chave estrangeira**, de propósito: resolver a FK exigiria dar
leitura da tabela de diagnósticos ao papel público. Token inexistente vira string que não casa com
nada — e o evento já nasceu como teste (D-8).

**A restrição `events_subtype_matches_type`** faz o esquema recusar clique sem subtipo, em vez de
deixar isso só na validação da aplicação. Duas camadas.

### O índice que falta, e quando criá-lo

Não há índice em `(site_id, button_id)`. O inventário varre o histórico do site agrupando por botão,
e para um site de agência isso cabe. **Meça antes de criar**: um índice por suposição custa escrita
em todo evento, no caminho mais quente do sistema.

---

## Isolamento

🔧 Vínculo forte com Postgres. O invariante é P-10, e ele vale em qualquer stack.

```sql
alter table events enable row level security;
alter table events force  row level security;   -- nem o dono escapa
```

**Contexto por transação, e local a ela:**

```sql
select set_config('app.site_id', '<uuid>', true);   -- `true` = local à transação
```

O terceiro argumento importa: local à transação, some no commit ou no rollback, sem ninguém limpar.
Um `RESET` na devolução da conexão só faria falta se o projeto usasse a forma não-local — e aí o
problema seria esse.

**As políticas do papel público casam por site:**

```sql
create policy events_ingest on events for all to app_ingest
  using      (site_id = app.current_site_id())
  with check (site_id = app.current_site_id());
```

Sem o ajuste, a função devolve `NULL`, `site_id = NULL` é `NULL`, nenhuma política casa, resultado
vazio. **O padrão é negar.**

### Privilégios do papel público de coleta

```sql
grant select                 on sites    to app_ingest;
grant select, insert         on pages    to app_ingest;
grant select, insert, update on sessions to app_ingest;
grant select, insert         on events   to app_ingest;
```

**O que está deliberadamente ausente é a parte importante:** nenhum privilégio sobre leads,
usuários, clientes, contas ou integrações — **nem para ler**. Se este endpoint tivesse um defeito, a
tentativa esbarraria numa negativa do armazenamento.

`sites` só recebe SELECT: é lendo `sites` que o endpoint descobre de que site é a requisição. É a
exceção necessária, e é estreita.

`sessions` recebe UPDATE porque o último instante visto é atualizado. `pages` e `events` não
recebem: nada ali é atualizado (D-15).

### Ao criar tabela nova neste subsistema

1. `account_id` e `site_id` obrigatórios, com cascata.
2. RLS habilitada **e** forçada.
3. Política por conta para o painel; política por site para os papéis públicos.
4. Privilégio só para quem precisa — na dúvida, não conceda.
5. Índices compostos começando pelo escopo.
6. Um teste que tenta ler de outro site **com o id correto em mãos**.

---

## `rate_limits`

Estado do limitador. Vive no armazenamento compartilhado, não em memória (D-11).

Requisitos, em vez de esquema — a forma varia com o armazenamento:

- **Incremento e leitura numa operação atômica só.** Entre um `select` e um `update` cabe outra
  requisição, e é nessa fresta que passa o ataque paralelo.
- **Janela fixa**, não deslizante.
- **Chave derivada do site já resolvido**, nunca do identificador cru recebido.
- **Limpeza oportunista** das janelas vencidas, dentro do próprio caminho de requisição com baixa
  probabilidade: varrer a cada chamada custaria mais do que o limite economiza.

Limite em produção: **600 eventos por minuto, por site** — dez por segundo, sustentado. Passar disso
é script solto ou falsificação.

---

## Retenção

**Não implementada, e a decisão está em aberto.** Registrado aqui para que não passe como esquecimento.

O que uma política de retenção precisaria respeitar, quando existir:

- **O inventário depende do histórico inteiro** (D-5). Apagar eventos antigos apaga `primeiroEm`, e
  com ele o estado "Novo" e a base do "parou de aparecer".
- **Agregar antes de apagar muda o que dá para afirmar.** Um agregado diário por botão preserva a
  série e perde a sessão — e com ela a elegibilidade por sessão (P-11).
- Apagar sem dizer viola P-12: a tela precisaria declarar a janela que ainda existe.
