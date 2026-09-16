---
name: isolamento-entre-contas
description: Como este projeto separa os dados de cada conta — três papéis do Postgres, RLS FORCE, escopo por site nos papéis públicos — e os quatro pontos em que a receita genérica de multi-tenancy deixaria o projeto PIOR. Use ao criar tabela, política, papel, rota pública ou qualquer coisa que leia dado de conta.
---

# Isolamento entre contas

Adaptado de uma skill genérica de multi-tenancy SaaS. Ela descreve corretamente
o desenho que este projeto já usa — `tenant_id` em toda tabela, RLS como rede de
segurança, contexto por transação. Então o valor dela aqui não é ensinar o
desenho: é **registrar onde ela discorda do que funciona neste código**, porque
quatro dos conselhos dela nos deixariam piores.

---

## O que já existe

`account_id` em toda tabela com dado de conta, `FORCE ROW LEVEL SECURITY` em
todas, e a conta da requisição entrando por transação:

```ts
set_config('app.account_id', <conta>, true)   // `true` = local à transação
```

Sem ela, `app.current_account_id()` é `NULL`, `account_id = NULL` é `NULL`,
nenhuma política casa e o resultado é vazio: **o padrão é negar**.

Três papéis, não um:

| Papel | Usa | Não pode |
|---|---|---|
| `app_user` | o painel | ver outra conta |
| `app_ingest` | `/api/collect` | ler leads, usuários, clientes — sem GRANT algum |
| `app_forms` | `/api/forms/[id]` | ler usuários e contas; alterar submissão gravada |

E os dois papéis públicos enxergam **um site, não todos**: `resolverSite` ajusta
`app.site_id` e as políticas casam por `site_id = app.current_site_id()`. Isso
vai além da receita, que para nas contas — aqui um `where` esquecido no endpoint
de formulários devolve nada, não os leads da base inteira.

---

## Os quatro conselhos que NÃO valem aqui

**1. "Use `SET LOCAL role = 'admin_bypass'` para rotas que cruzam contas."**
Recusado, e a alternativa está medida. O cron precisa varrer trabalho de várias
contas; dar-lhe `BYPASSRLS` seria mais curto e trocaria um endpoint quebrado por
um que enxerga **todas as contas de uma vez**. Em vez disso ele PERGUNTA em quais
contas há trabalho — funções `SECURITY DEFINER` estreitas que devolvem só
identificadores de conta (`app.contas_com_job_pendente`,
`app.contas_com_auditoria_vencida`, `app.contas_com_acompanhamento_aberto`) — e
processa cada uma dentro de `withAccount`. A política vale o tempo todo, e um
defeito no cron erra uma conta em vez da base.

**2. "Sempre `RESET app.current_tenant_id` na limpeza da conexão."** Cargo cult
aqui. `set_config(…, true)` é **local à transação**: some no commit ou no
rollback, sem ninguém limpar. O `RESET` só faria falta se o projeto usasse
`SET` sem o terceiro argumento — e aí o problema seria esse, não a limpeza.

**3. "Nunca rode migração com RLS ativa na conexão."** Meio certo, e a metade
errada importa: `FORCE` vale inclusive para o dono da tabela, então migração
roda como superusuário (no Supabase, `postgres`, que tem `BYPASSRLS`). O que a
receita não diz é o que de fato mordeu aqui: **a ORDEM de publicação**. Migração
que RESTRINGE política sobe DEPOIS do código; migração que só acrescenta objeto
sobe ANTES. Inverter a primeira derruba a coleta em produção sem erro visível.

**4. O exemplo de middleware Express tem um defeito.** Ele confirma a transação
em `res.on('finish')` — que dispara para **qualquer** resposta, inclusive 500.
Uma requisição que falhou no meio da escrita seria confirmada. Aqui quem
delimita é `withAccount`, que abre a transação, ajusta a conta e desfaz em
exceção; a rota não gerencia conexão.

---

## O que ela acerta e vale repetir

- **`account_id` como primeira coluna dos índices compostos.** Prefixo mais à
  esquerda: `(account_id, criado_em)` serve "tudo da conta" e "da conta por
  data"; o inverso só serve faixa de data.
- **UUID, nunca inteiro sequencial**, em tudo que é de conta. Já é o caso.
- **Teste com três contas, não uma.** Uma esconde todo defeito de isolamento;
  duas escondem o vazamento que só vai num sentido. A massa tem conta rival, e
  há teste que tenta ler dado de outra conta **com o id correto em mãos**.
- **RLS é execução, filtro na aplicação é sugestão.** As duas camadas.

---

## A armadilha que nem a receita nem a RLS pegam

**A política não confere o `site_id` que veio do formulário.** A política de
`site_features` casa por `account_id`, e o valor gravado vem de
`app.current_account_id()`: o de quem escreve. Então a linha `(conta A, site da
conta B, 'visitas')` **passa** — a política aprova, porque a linha é da conta A.
Com `unique (site_id, feature)`, isso trancava o dono legítimo para sempre,
contra um registro que a própria política esconde dele.

Server Action recebe o `siteId` por campo oculto e o Next não o confere contra o
`[siteId]` da rota. Toda escrita passa por `exigirSiteDaConta`. É o limite da
RLS: ela garante de **quem é a linha**, não sobre **o que ela aponta**.

---

## Ao criar tabela nova

1. `account_id uuid not null references accounts(id) on delete cascade`.
2. `enable row level security` **e** `force row level security`.
3. Política por `account_id = app.current_account_id()`, com `with check` no
   insert.
4. GRANT só para quem precisa — as tabelas de qualidade técnica recebem apenas
   `app_user`; os papéis públicos não têm nada ali, nem para ler.
5. Se um papel público for tocar na tabela, política também por
   `site_id = app.current_site_id()`.
6. Acrescente os objetos novos em `src/server/esquema.ts`, senão um deploy
   contra banco atrasado dá 500 sem dizer o que falta.
7. Teste tentando ler de outra conta com o id em mãos.
