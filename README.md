# Painel de Sites

Painel de análise de desempenho para sites e landing pages de clientes: cadastro de clientes
e sites, coleta própria de visitas e cliques, recebimento de formulários, organização de leads
e relatórios filtráveis por cliente, site e período.

Nasceu de um protótipo exportado do Claude Design — uma maquete sem backend, com números gerados
no navegador. Hoje é uma aplicação com persistência real, autorização no banco e indicadores
definidos antes de serem agregados.

---

## Requisitos

| Ferramenta | Versão usada | Observação |
|---|---|---|
| Node.js | 22.x | |
| npm | 10.x | |
| PostgreSQL | 16 ou 17 | Instalado na máquina **ou** via `docker compose` (incluso) |

Docker é opcional: serve só para não precisar instalar o PostgreSQL.

## Rodar em 3 comandos

Com Docker (não precisa ter PostgreSQL instalado):

```bash
npm install
docker compose up -d           # sobe um PostgreSQL 16 local
npm run setup                  # .env.local, banco, papéis, migrações e massa
npm run dev                    # http://localhost:3000
```

Já tem PostgreSQL rodando na porta 5432? Pule o `docker compose` — o `setup`
usa o que estiver lá.

O `setup` imprime as credenciais de acesso no final. Ele é idempotente, exceto
pelo seed, que sempre recria a massa de desenvolvimento.

**Deu algum erro?** Rode `npm run doctor`: ele verifica Node, dependências,
variáveis, servidor de banco, migrações, massa e os três papéis, e diz o que
fazer em cada caso.

### Passo a passo, se preferir controlar cada etapa

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # SESSION_SECRET
npm run db:setup               # cria banco, papéis e aplica migrações
npm run db:seed                # 2 contas, 3 clientes, 4 sites, ~11 mil sessões
npm run dev
```

Para recomeçar do zero: `npm run db:reset`.

## Apontar para o Supabase

O mesmo schema já está aplicado num projeto Supabase. Para usar a nuvem em vez
do banco local, troque as três primeiras linhas do `.env.local` pelas
connection strings do projeto — o passo a passo, incluindo qual host usar, está
em [`docs/deploy-supabase.md`](docs/deploy-supabase.md).

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm start` | Serve o build |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm test` | Testes de unidade e integração (vitest) |
| `npm run test:e2e` | Testes de navegador (Playwright) |
| `npm run setup` | Tudo de uma vez: `.env.local`, banco, papéis, migrações e massa |
| `npm run db:setup` | Cria banco, papéis e aplica migrações |
| `npm run db:migrate` | Só aplica migrações pendentes |
| `npm run db:seed` | Recria a massa de desenvolvimento |
| `npm run db:reset` | Apaga e recria o banco de desenvolvimento |
| `npm run doctor` | Diagnostica o ambiente local e diz como resolver o que estiver faltando |
| `npm run producao` | Diz qual commit está no ar no endereço publicado, e se o painel entra |

Já publicado, o endereço `/api/diagnostico` faz a mesma verificação das conexões no servidor, sem
expor host, usuário ou senha. O `npm run producao` consulta esse endereço e responde a pergunta que
o painel da hospedagem esconde: **qual commit está sendo servido agora**. A tela de login carimba o
mesmo no rodapé.

Os testes usam um banco separado (`painel_matrix_test`), recriado a cada execução. O banco de
desenvolvimento nunca é tocado por eles.

---

## Como o projeto está organizado

```
src/
  app/                      rotas (App Router; server components por padrão)
    (painel)/               telas autenticadas
    api/collect/            endpoint público de analytics
    api/forms/[publicId]/   endpoint público de formulários
    teste/[publicId]/       página de teste de instalação
  components/               apresentação — nenhum número nasce aqui
  server/
    db/                     pool, transações e troca de papel
    metrics/                FONTE ÚNICA: definições e agregações
    services/               clientes, sites, ingestão
    auth/                   sessão e senha
  lib/                      formatação, períodos
supabase/migrations/        SQL numerado, aplicável aqui e no Supabase
public/t.js                 o coletor instalado nos sites
tests/                      unit (vitest) e e2e (playwright)
```

Documentação complementar:

- [`docs/metricas.md`](docs/metricas.md) — o que cada indicador conta, e o que fica de fora
- [`docs/instalacao-rastreamento.md`](docs/instalacao-rastreamento.md) — instalar o coletor num site
- [`docs/deploy-supabase.md`](docs/deploy-supabase.md) — subir para o Supabase
- [`docs/deploy-vercel.md`](docs/deploy-vercel.md) — publicar na Vercel, clique a clique
- [`docs/relatorio-testes.md`](docs/relatorio-testes.md) — o que foi testado, e o que não foi
- [`DESIGN.md`](DESIGN.md) — a identidade visual e seus componentes
- [`CLAUDE.md`](CLAUDE.md) — decisões que valem para quem for continuar o trabalho

---

## Decisões que valem explicar

**Três papéis no banco, não um.** O painel conecta como `app_user` e enxerga apenas a conta da
sessão, por RLS. O endpoint público de analytics conecta como `app_ingest`, que **não tem
privilégio nenhum sobre leads, usuários ou clientes** — nem para ler. O endpoint de formulários usa
um terceiro papel, `app_forms`. A separação é do Postgres: um erro no código da aplicação ainda
esbarra numa negativa do banco.

**Uma fonte por indicador.** `src/server/metrics/definitions.ts` declara cada métrica com seu
escopo; `queries.ts` implementa todas sobre as mesmas CTEs. Cartões, gráfico e tabelas chamam essas
funções. Nenhum componente visual calcula nada, e por isso duas telas não têm como discordar.

**Estado de instalação é derivado.** Cadastrar um domínio e gerar um identificador não faz o site
aparecer como "coletando". O estado sai de `max(occurred_at)` sobre os eventos realmente recebidos.

**Falha não vira sucesso.** Erro de API mostra erro; nunca cai para dados de demonstração. Falha ao
gravar um formulário devolve erro; nunca uma confirmação sem gravação correspondente.

**Datas em UTC, recorte no fuso do site.** Toda coluna de tempo é `timestamptz` em UTC. Os períodos
são recortados com `AT TIME ZONE` usando o fuso cadastrado no site, e não aritmética de 24 horas.

---

## Deploy na Vercel

O passo a passo com os cliques está em [`docs/deploy-vercel.md`](docs/deploy-vercel.md).

Duas coisas que o projeto já traz prontas para isso:

- `vercel.json` fixa a região em `iad1` (Virgínia do Norte), a mesma do projeto
  Supabase. Cada tela faz várias consultas; com a aplicação e o banco em
  continentes diferentes, a latência aparece.
- Em ambiente serverless o pool abre no máximo **três** conexões por instância,
  e não dez: cada tela faz várias consultas em paralelo, mas há muitas
  instâncias, e dez em cada uma esgotaria o limite do banco.
