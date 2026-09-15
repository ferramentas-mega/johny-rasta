# Subir para o Supabase

O schema deste projeto foi escrito para rodar igual no Postgres local e num projeto Supabase. Não
há nada específico de um ou de outro: as mesmas migrações aplicam nos dois.

**Estado atual:** o schema já está aplicado no projeto `cihsheaiqinrmftjwexu`
(`ferramentas-mega's Project`, região `us-east-1`, PostgreSQL 17), com os três papéis criados e as
21 políticas de RLS ativas. Falta apontar a aplicação para lá e criar seu usuário.

---

## Por que funciona sem adaptação

O desenho depende de três coisas, e o Supabase oferece as três:

| Precisa de | No Supabase |
|---|---|
| Criar papéis de login | `postgres` tem `CREATEROLE` |
| Rodar seed e migração ignorando RLS | `postgres` tem `BYPASSRLS` |
| `SET LOCAL` por transação | Funciona, inclusive no pooler em modo transação |

A aplicação **não** usa Supabase Auth nem a API PostgREST. Ela fala Postgres direto, com os papéis
`app_user`, `app_ingest` e `app_forms`. O Supabase entra como banco gerenciado.

---

## 1. Criar os papéis (uma vez por projeto)

Se estiver começando um projeto novo, rode no SQL Editor do Supabase, com senhas fortes próprias:

```sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password 'TROQUE_POR_UMA_SENHA_FORTE';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_ingest') then
    create role app_ingest login password 'TROQUE_POR_OUTRA_SENHA_FORTE';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_forms') then
    create role app_forms login password 'TROQUE_POR_MAIS_UMA_SENHA_FORTE';
  end if;
end $$;
```

Gere cada senha com:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## 2. Aplicar as migrações

Com a CLI do Supabase:

```bash
supabase link --project-ref cihsheaiqinrmftjwexu
supabase db push
```

O diretório `supabase/migrations/` já está no formato que a CLI espera, com nomes timestampados.

Sem a CLI, cole o conteúdo de cada arquivo de `supabase/migrations/`, **em ordem numérica**, no SQL
Editor. São cinco arquivos e a ordem importa.

## 3. Conferir que ficou como deveria

```sql
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE')          as tabelas,          -- 11
  (select count(*) from pg_policies where schemaname='public')        as politicas,        -- 21
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
      and c.relrowsecurity and c.relforcerowsecurity)                 as rls_forcada,      -- 11
  (select string_agg(distinct table_name, ', ' order by table_name)
     from information_schema.role_table_grants
    where grantee='app_ingest' and table_schema='public')             as acesso_da_coleta;
```

O último valor precisa ser exatamente `events, pages, sessions, sites`. Se `leads` aparecer aí, algo
saiu errado: o endpoint público de coleta não pode enxergar leads.

Rode também o linter de segurança do próprio Supabase (Advisors, aba Security). Ele deve estar
limpo.

## 4. Criar o primeiro usuário

O seed de desenvolvimento não deve ir para produção — ele cria massa fictícia. Crie apenas sua
conta e seu usuário:

```bash
node -e "
  const { hashPassword } = require('./src/server/auth/password');
  hashPassword('SUA_SENHA').then(console.log);
"
```

E no SQL Editor:

```sql
with conta as (
  insert into accounts (name) values ('Mega Ads') returning id
)
insert into users (account_id, email, password_hash, name, role)
select id, 'ferramentas@megaads.com.br', 'COLE_O_HASH_AQUI', 'Equipe de marketing', 'owner'
  from conta;
```

## 5. Apontar a aplicação

No ambiente de produção (Vercel, ou onde a aplicação rodar):

```bash
DATABASE_URL=postgres://app_user.cihsheaiqinrmftjwexu:SENHA@HOST-COPIADO-DO-CONNECT:6543/postgres
DATABASE_URL_INGEST=postgres://app_ingest.cihsheaiqinrmftjwexu:SENHA@HOST-COPIADO-DO-CONNECT:6543/postgres
DATABASE_URL_FORMS=postgres://app_forms.cihsheaiqinrmftjwexu:SENHA@HOST-COPIADO-DO-CONNECT:6543/postgres
SESSION_SECRET=<32 bytes aleatórios>
APP_URL=https://seu-painel.com.br
```

Só `DATABASE_URL` e `SESSION_SECRET` são necessárias para o painel subir. Sem as outras duas, os
endpoints públicos de coleta e de formulários respondem 503 e o restante funciona — o que permite
conferir o login antes de ligar a coleta.

`DATABASE_URL_ADMIN` **não** precisa existir em produção: só scripts de migração e seed a usam, e o
código da aplicação nunca a importa.

### Qual host usar

O Supabase oferece duas formas de conexão:

- **Direta** (`db.<ref>.supabase.co:5432`) — só resolve em IPv6. Use se o seu ambiente de execução
  tiver IPv6. A Vercel **não** tem, e o sintoma é `ENOTFOUND`, que se parece com host digitado
  errado.
- **Pooler** (`aws-*.pooler.supabase.com:5432` ou `:6543`) — tem IPv4. É a opção certa para a
  maioria das hospedagens. O modo transação (`:6543`) funciona com este projeto, porque `SET LOCAL`
  vale dentro da transação, que é justamente a unidade que o pooler preserva.

**O host do pooler não se deduz — tem de ser copiado.** Clique no botão verde **Connect**, no topo
do painel do projeto, e abra a aba **Transaction pooler**. O número em `aws-<N>-<regiao>` é um
índice de cluster, não parte do nome da região, e uma região pode ter mais de um. A própria
documentação do Supabase avisa que **`aws-0` não é padrão seguro** e que não dá para derivar o host
a partir da região. É por isso que os exemplos deste documento trazem `HOST-COPIADO-DO-CONNECT` em
vez de um valor: um host plausível e errado custa mais caro que um espaço em branco.

#### Isto é medido, não recomendado

Consulta de DNS feita neste projeto:

```
db.cihsheaiqinrmftjwexu.supabase.co    IPv4: —              IPv6: 2600:1f18:144f:6d03:…
aws-1-us-east-1.pooler.supabase.com    IPv4: 18.213.155.45  IPv6: —
aws-0-us-east-1.pooler.supabase.com    IPv4: 44.216.29.125  IPv6: —
```

O host direto **não publica registro A**. Num runtime sem IPv6 a resolução falha com `ENOTFOUND` —
o mesmo erro de um host inexistente, e é por isso que a mensagem engana: manda procurar um erro de
digitação que não existe. O `/api/diagnostico` distingue os dois casos e devolve
`host_direto_do_supabase` quando reconhece este formato.

O que esta medição prova, e o que **não** prova: prova que o host direto não serve num runtime
IPv4, e que ambos os clusters de `us-east-1` existem com IPv4. **Não** prova qual dos dois é o deste
projeto — isso só o **Connect** responde. Pegar o número errado devolve `Tenant or user not found`,
que o diagnóstico nomeia, e que é erro de host ou de usuário, nunca de senha.

### O sufixo do projeto no nome do papel

No pooler, o usuário **não** é `app_user`, e sim `app_user.cihsheaiqinrmftjwexu` — é assim que o
Supavisor descobre para qual projeto encaminhar a conexão. Vale para os três papéis.

Sem o sufixo, o erro é `Tenant or user not found`, que não se parece nada com "faltou um sufixo".
Esses dois detalhes — a porta e o sufixo — são os dois motivos mais comuns de um deploy que compila
e não conecta.

---

## Limitação conhecida deste ambiente de desenvolvimento

O container onde o projeto foi construído tem egress apenas HTTPS: conexões TCP diretas em 5432 e
6543 são bloqueadas pelo proxy de rede, e o host direto do Supabase resolve só em IPv6, que o
container não suporta.

Consequência prática: as migrações foram aplicadas pela API de gerenciamento (que passa por HTTPS),
mas **a aplicação rodando dentro deste container não consegue falar com o Postgres do Supabase**.
O desenvolvimento e os testes rodaram contra o PostgreSQL local, com schema idêntico.

Isso não é uma limitação do projeto: rodando na sua máquina ou numa hospedagem comum, a conexão
funciona normalmente. Vale a pena confirmar na primeira execução.

---

## O que NÃO fazer

- **Não use a chave `service_role` na aplicação.** Este projeto não usa a API do Supabase; a
  separação de privilégios vive nos três papéis do Postgres, e a `service_role` passaria por cima
  dela.
- **Não rode `npm run db:seed` contra produção.** Ele começa com `truncate accounts cascade`.
- **Não edite uma migração já aplicada.** Escreva outra.
