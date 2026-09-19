# Baseline ANTES — medido em 2026-09-19T02:23:42.826Z

Ambiente: next start (build de produção) em localhost:3123 contra Postgres 16 local (painel_matrix_test, massa de scripts/test-db.ts); Chromium headless via Playwright; contexto novo (cache frio) a cada corrida; prefetches do <Link> bloqueados nas corridas medidas (não geram SQL — confirmado pela corrida comPrefetch) e contados à parte.

Não medido: produção (app.johnyweb.com) — inalcançável deste sandbox; latência de rede até o Supabase (us-east-1) — o custo real de cada statement em produção é RTT × statements, e o RTT não foi medido; compressão do proxy da Hostinger (aqui é o gzip do next start).

## Rotas (mediana de 3 corridas, cache frio)

| rota | TTFB ms | DCL ms | load ms | requests | KB fio | KB JS fio (decod.) | KB fontes | KB HTML fio | nº SQL | ms SQL | distintas | transações | repetidas | sessão |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| /visao-geral | 41.5 | 82.1 | 170.2 | 18 (+8 prefetch) | 315.9 | 117 (383) | 172.5 | 19.7 | 46 | 13.205 | 14 | 11 | 3 | 1 |
| /clientes | 34.1 | 70.8 | 161.9 | 19 (+8 prefetch) | 309.3 | 118.4 (386.1) | 172.5 | 11.7 | 37 | 7.368 | 13 | 9 | 1 | 1 |
| /sites | 34.9 | 66.8 | 177.7 | 19 (+16 prefetch) | 314 | 119.3 (388.8) | 172.5 | 15.5 | 41 | 8.691 | 12 | 10 | 3 | 1 |
| /leads | 35.3 | 75.2 | 171.1 | 18 (+8 prefetch) | 315.3 | 116.9 (382.3) | 172.5 | 19.2 | 38 | 8.805 | 14 | 9 | 1 | 1 |
| /otimizacoes | 35.7 | 92.2 | 160.5 | 19 (+7 prefetch) | 316.7 | 120.6 (392) | 172.5 | 16.9 | 28 | 8.435 | 13 | 6 | 1 | 1 |
| /avisos | 28 | 59.8 | 148.8 | 18 (+9 prefetch) | 307.3 | 115.5 (377.8) | 172.5 | 12.6 | 21 | 4.98 | 10 | 5 | 0 | 1 |
| /configuracoes | 32.6 | 66.6 | 166 | 19 (+6 prefetch) | 314.4 | 117.4 (383.3) | 172.5 | 17.8 | 44 | 8.673 | 14 | 11 | 2 | 2 |
| /clientes/<cliente> | 43.7 | 87.9 | 173.8 | 19 (+7 prefetch) | 319.1 | 121 (393.6) | 172.5 | 18.9 | 41 | 12.19 | 14 | 9 | 4 | 1 |
| /clientes/<cliente>/relatorio | 38.8 | 103.5 | 164.5 | 18 (+8 prefetch) | 313.5 | 117 (382.7) | 172.5 | 17.3 | 40 | 11.806 | 14 | 8 | 5 | 1 |
| /sites/<alfa>/desempenho?periodo=30d | 57.4 | 135.4 | 214.8 | 18 (+11 prefetch) | 337.7 | 120.5 (393.2) | 172.5 | 38 | 40 | 13.508 | 17 | 8 | 3 | 1 |
| /sites/<alfa>/comportamento | 43.2 | 97.5 | 151.5 | 18 (+11 prefetch) | 309.7 | 116.7 (382) | 172.5 | 13.8 | 38 | 10.331 | 17 | 8 | 1 | 1 |
| /sites/<alfa>/qualidade | 43.2 | 87.5 | 172.5 | 19 (+11 prefetch) | 323.7 | 120.6 (392.3) | 172.5 | 23.9 | 42 | 10.718 | 21 | 8 | 1 | 1 |
| /sites/<alfa>/rastreamento | 48.5 | 85 | 175.1 | 18 (+12 prefetch) | 326.3 | 118.2 (386.2) | 172.5 | 28.9 | 42 | 11.029 | 15 | 10 | 1 | 1 |
| /sites/<alfa>/configurar | 31.4 | 65.9 | 176.6 | 20 (+11 prefetch) | 323.7 | 132.5 (432.1) | 172.5 | 12 | 43 | 6.87 | 17 | 10 | 0 | 1 |

"repetidas" = textos SQL normalizados executados mais de uma vez na MESMA navegação, excluindo begin/commit/set_config (que se repetem por transação: cada `withAccount` custa 3 statements). "sessão" = statements que tocam `app.find_user_for_session`.

## Consultas repetidas e mais lentas por rota

### /visao-geral
- transações: 11; overhead de transação (begin+commit+set_config): 32 de 46 statements
- repetidas:
  - ×11 (0.223 ms) `begin`
  - ×11 (0.366 ms) `commit`
  - ×10 (0.073 ms) `select set_config('?', $?, true)`
  - ×2 (0.441 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - ×2 (0.116 ms) `select s.id as site_id, coalesce(sum(case when f.selecionado and f.verificado_em is null then ? else ? end), ?)::int as `
  - ×2 (0.579 ms) `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
- 5 mais lentas:
  - 0.604 ms `with ativos as ( select s.id, s.timezone, date_trunc('day', now() at time zone s.timezone)::date as hoje from sites s wh`
  - 0.492 ms `with janela as ( select s.id, s.client_id, s.timezone, (date_trunc('day', now() at time zone s.timezone) - make_interval`
  - 0.404 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.308 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.305 ms `select id from sites where archived_at is null`
- com prefetch liberado: 26 requests, 8 RSC, SQL 46 statements (12.666 ms)

### /clientes
- transações: 9; overhead de transação (begin+commit+set_config): 26 de 37 statements
- repetidas:
  - ×9 (0.152 ms) `begin`
  - ×9 (0.378 ms) `commit`
  - ×8 (0.068 ms) `select set_config('?', $?, true)`
  - ×2 (0.414 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 0.426 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.303 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.245 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.228 ms `select c.id, c.name as nome, count(distinct s.id)::int as sites, count(distinct ses.id)::int as sessoes, count(distinct `
  - 0.215 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- com prefetch liberado: 27 requests, 8 RSC, SQL 37 statements (7.282 ms)

### /sites
- transações: 10; overhead de transação (begin+commit+set_config): 29 de 41 statements
- repetidas:
  - ×10 (0.137 ms) `begin`
  - ×10 (0.293 ms) `commit`
  - ×9 (0.066 ms) `select set_config('?', $?, true)`
  - ×2 (0.481 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - ×2 (0.104 ms) `select s.id as site_id, coalesce(sum(case when f.selecionado and f.verificado_em is null then ? else ? end), ?)::int as `
  - ×2 (0.567 ms) `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
- 5 mais lentas:
  - 0.445 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.311 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.283 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.259 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.256 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
- com prefetch liberado: 35 requests, 16 RSC, SQL 41 statements (9.485 ms)

### /leads
- transações: 9; overhead de transação (begin+commit+set_config): 26 de 38 statements
- repetidas:
  - ×9 (0.126 ms) `begin`
  - ×9 (0.321 ms) `commit`
  - ×8 (0.061 ms) `select set_config('?', $?, true)`
  - ×2 (0.412 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 0.517 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.331 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.28 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.242 ms `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - 0.222 ms `select id from clients where archived_at is null`
- com prefetch liberado: 26 requests, 8 RSC, SQL 38 statements (8.739 ms)

### /otimizacoes
- transações: 6; overhead de transação (begin+commit+set_config): 17 de 28 statements
- repetidas:
  - ×6 (0.146 ms) `begin`
  - ×6 (0.248 ms) `commit`
  - ×5 (0.048 ms) `select set_config('?', $?, true)`
  - ×2 (0.575 ms) `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
- 5 mais lentas:
  - 0.31 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.309 ms `select count(*)::int as total from leads`
  - 0.297 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.265 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.237 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- com prefetch liberado: 26 requests, 7 RSC, SQL 28 statements (7.601 ms)

### /avisos
- transações: 5; overhead de transação (begin+commit+set_config): 14 de 21 statements
- repetidas:
  - ×5 (0.102 ms) `begin`
  - ×5 (0.251 ms) `commit`
  - ×4 (0.032 ms) `select set_config('?', $?, true)`
- 5 mais lentas:
  - 0.298 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.271 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.254 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.201 ms `select id from clients where archived_at is null`
  - 0.131 ms `select id from sites where archived_at is null`
- com prefetch liberado: 27 requests, 9 RSC, SQL 21 statements (5.298 ms)

### /configuracoes
- transações: 11; overhead de transação (begin+commit+set_config): 31 de 44 statements
- repetidas:
  - ×11 (0.162 ms) `begin`
  - ×11 (0.347 ms) `commit`
  - ×9 (0.07 ms) `select set_config('?', $?, true)`
  - ×2 (0.538 ms) `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - ×2 (0.482 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 1.015 ms `select (select count(*)::int from sites where archived_at is null) as sites, (select count(*)::int from sites s where s.`
  - 0.462 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.291 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.283 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.261 ms `select count(*)::int as total from leads`
- com prefetch liberado: 25 requests, 6 RSC, SQL 44 statements (8.359 ms)

### /clientes/7bc75830-e1b7-4746-a36f-9e5037ca0b7e
- transações: 9; overhead de transação (begin+commit+set_config): 26 de 41 statements
- repetidas:
  - ×9 (0.15 ms) `begin`
  - ×9 (0.345 ms) `commit`
  - ×8 (0.062 ms) `select set_config('?', $?, true)`
  - ×2 (0.366 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - ×2 (0.104 ms) `select s.id as site_id, coalesce(sum(case when f.selecionado and f.verificado_em is null then ? else ? end), ?)::int as `
  - ×2 (0.17 ms) `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - ×2 (0.536 ms) `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
- 5 mais lentas:
  - 0.28 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.265 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.256 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.211 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.174 ms `select id from clients where archived_at is null`
- com prefetch liberado: 26 requests, 7 RSC, SQL 41 statements (12.625 ms)

### /clientes/7bc75830-e1b7-4746-a36f-9e5037ca0b7e/relatorio
- transações: 8; overhead de transação (begin+commit+set_config): 23 de 40 statements
- repetidas:
  - ×8 (0.158 ms) `begin`
  - ×8 (0.291 ms) `commit`
  - ×7 (0.056 ms) `select set_config('?', $?, true)`
  - ×3 (0.026 ms) `with hoje as (select date_trunc('?', now() at time zone $?) as d) select (d - make_interval(days => $?::int - ?)) at tim`
  - ×2 (0.342 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - ×2 (0.106 ms) `select s.id as site_id, coalesce(sum(case when f.selecionado and f.verificado_em is null then ? else ? end), ?)::int as `
  - ×2 (0.507 ms) `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - ×2 (0.159 ms) `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
- 5 mais lentas:
  - 0.28 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.261 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.246 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.225 ms `select id from clients where archived_at is null`
  - 0.221 ms `with eventos as ( -- Medições, com a anterior do mesmo par. select r.medido_em as quando, 'analise'::text as tipo, r.sit`
- com prefetch liberado: 26 requests, 8 RSC, SQL 40 statements (12.186 ms)

### /sites/5f89d00a-da97-4b27-ad76-5617acd43cc1/desempenho?periodo=30d
- transações: 8; overhead de transação (begin+commit+set_config): 23 de 40 statements
- repetidas:
  - ×8 (0.156 ms) `begin`
  - ×8 (0.265 ms) `commit`
  - ×7 (0.055 ms) `select set_config('?', $?, true)`
  - ×2 (0.46 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - ×2 (0.26 ms) `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - ×2 (0.385 ms) `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
- 5 mais lentas:
  - 0.316 ms `select id from clients where archived_at is null`
  - 0.316 ms `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - 0.266 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.261 ms `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - 0.252 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- com prefetch liberado: 29 requests, 11 RSC, SQL 40 statements (13.858 ms)

### /sites/5f89d00a-da97-4b27-ad76-5617acd43cc1/comportamento
- transações: 8; overhead de transação (begin+commit+set_config): 23 de 38 statements
- repetidas:
  - ×8 (0.12 ms) `begin`
  - ×8 (0.318 ms) `commit`
  - ×7 (0.053 ms) `select set_config('?', $?, true)`
  - ×2 (0.466 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 0.508 ms `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - 0.439 ms `with eligible as ( select s.id, s.visitor_id, s.started_at, s.source, s.medium, s.campaign, s.device, s.entry_page_id fr`
  - 0.268 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.255 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.254 ms `select count(*)::int as total from leads`
- com prefetch liberado: 29 requests, 11 RSC, SQL 38 statements (10.038 ms)

### /sites/5f89d00a-da97-4b27-ad76-5617acd43cc1/qualidade
- transações: 8; overhead de transação (begin+commit+set_config): 23 de 42 statements
- repetidas:
  - ×8 (0.16 ms) `begin`
  - ×8 (0.376 ms) `commit`
  - ×7 (0.059 ms) `select set_config('?', $?, true)`
  - ×2 (0.425 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 0.416 ms `with eventos as ( -- Medições, com a anterior do mesmo par. select r.medido_em as quando, 'analise'::text as tipo, r.sit`
  - 0.288 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.253 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.219 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.206 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- com prefetch liberado: 30 requests, 11 RSC, SQL 42 statements (11.098 ms)

### /sites/5f89d00a-da97-4b27-ad76-5617acd43cc1/rastreamento
- transações: 10; overhead de transação (begin+commit+set_config): 29 de 42 statements
- repetidas:
  - ×10 (0.253 ms) `begin`
  - ×10 (1.153 ms) `commit`
  - ×9 (0.08 ms) `select set_config('?', $?, true)`
  - ×2 (0.564 ms) `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- 5 mais lentas:
  - 0.734 ms `commit`
  - 0.352 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.325 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.313 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.251 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
- com prefetch liberado: 30 requests, 12 RSC, SQL 42 statements (9.236 ms)

### /sites/5f89d00a-da97-4b27-ad76-5617acd43cc1/configurar
- transações: 10; overhead de transação (begin+commit+set_config): 29 de 43 statements
- repetidas:
  - ×10 (0.15 ms) `begin`
  - ×10 (0.266 ms) `commit`
  - ×9 (0.058 ms) `select set_config('?', $?, true)`
- 5 mais lentas:
  - 0.316 ms `select user_id as "userId", account_id as "accountId", email, name, account_name as "accountName", is_demo as "isDemo" f`
  - 0.257 ms `with sinais (site_id, site, cliente, url, dispositivo, tipo, titulo, evidencia, prioridade, proxima_acao, detectado_em) `
  - 0.24 ms `select s.id, s.client_id as "clientId", c.name as "clienteNome", s.name, s.domain, s.timezone, s.public_id as "publicId"`
  - 0.225 ms `select c.id, c.name, c.notes, c.created_at as "createdAt", (select count(*)::int from sites s where s.client_id = c.id a`
  - 0.191 ms `select id from clients where archived_at is null`
- com prefetch liberado: 31 requests, 11 RSC, SQL 43 statements (7.595 ms)

## Login (POST /entrar → /visao-geral)
- 53 statements, 26.225 ms, 13 transações, 2 consultas de sessão/usuário

## Estáticos e endpoints (curl)

| recurso | status | bytes | gzip | Cache-Control | ETag |
|---|---:|---:|---:|---|---|
| /t.js | 200 | 12865 | 4689 | `public, max-age=300, must-revalidate` | W/"3241-1a0a60cd7b2" |
| /f.js | 200 | 13710 | 4967 | `public, max-age=0` | W/"358e-1a0a7706c9c" |
| /sw.js | 200 | 1657 | 811 | `public, max-age=0` | W/"679-1a0b6d358a4" |
| /entrar | 200 | 19099 | 7055 | `private, no-cache, no-store, max-age=0, must-revalidate` | — |

- GET /api/diagnostico (sem cookie, sem token): HTTP 200, 340 bytes, TTFB 0.073s. Expõe: tudoOk, esquema.{verificado,completo,faltando[]}, commit (sha do build), deployment, ambiente, painelFunciona, coletaFunciona, problemas[] (variavel, essencial, causa, oQueFazer), faltaSessionSecret, observacao. Cada chamada anônima abre conexão nos 3 pools (verificarConexao para DATABASE_URL, _INGEST, _FORMS) e roda verificarEsquema — custo de banco pago por qualquer visitante sem limite de taxa visível na rota (src/app/api/diagnostico/route.ts:86-100).
- POST /api/collect (page_view válido, site sit_teste_alfa01, Origin https://alfa.teste): HTTP 204, latência mediana 16.7 ms, 9 statements SQL numa transação (2.946 ms de banco). talvezLimpar (src/server/limites.ts:132) roda com probabilidade 1% e não apareceu nas 3 amostras. Transação única: 9 idas ao banco por evento.
