# Notas para quem continuar

Contexto curto e decisões que não são óbvias no código. Para instalação e comandos, veja o
[README](README.md).

---

## De onde isto veio

O ponto de partida foi um HTML empacotado, exportado do Claude Design. Não era um app incompleto:
era uma maquete honesta, sem framework, sem build, sem rotas reais e sem persistência — os números
vinham de um PRNG com semente fixa rodando no navegador, e a própria tela de configurações dizia
que não havia backend.

O trabalho foi transformar aquilo num produto, preservando a estética e as definições de métrica
que o protótipo já trazia nos textos de ajuda (que estavam corretas e viraram a especificação).

---

## Regras que o código assume

**Nenhum componente visual calcula número.** Todos os indicadores saem de
`src/server/metrics/queries.ts`, sobre CTEs compartilhadas. Se você precisar de um número novo numa
tela, acrescente a consulta lá — não some valores no componente. Foi essa disciplina que eliminou a
possibilidade de duas telas discordarem.

**Estados são derivados, não marcados.** O estado de rastreamento de um site vem de
`max(occurred_at)` sobre os eventos recebidos. Nunca crie uma coluna `status` que alguém atualiza ao
salvar um cadastro: seria possível afirmar "coletando" sem nenhum evento.

**Falha nunca vira sucesso.** Erro de consulta mostra erro; não existe fallback para dados de
demonstração. Falha ao gravar um formulário devolve 500; nunca uma confirmação. Se for tentado a
adicionar um `catch` que devolve dados vazios, não adicione.

**Zero e "indisponível" não são a mesma coisa.** Zero afirma "medimos e não houve". Sem medição, a
tela diz "Indisponível" ou "Sem base de cálculo". Divisão por zero devolve `null`, não `0`.

**Uma transação, uma conexão.** `Queryable` serializa as consultas de uma mesma transação numa
fila, porque o driver `pg` não aceita duas simultâneas no mesmo client. Um `Promise.all` dentro de
um `withAccount` não quebra — ele espera. Fora de uma transação, `Promise.all` é livre: cada
`withAccount` pega sua própria conexão.

---

## Autorização

Três papéis do Postgres, com privilégios diferentes:

| Papel | Usa | Não pode |
|---|---|---|
| `app_user` | O painel | Ver outra conta (RLS por `app.account_id`) |
| `app_ingest` | `/api/collect` | Ler leads, usuários, clientes, integrações — **sem GRANT algum** |
| `app_forms` | `/api/forms/[id]` | Ler usuários e contas; alterar submissões gravadas |

A conta da requisição entra por `set_config('app.account_id', …, true)` a cada transação. Sem ela,
`app.current_account_id()` devolve `NULL`, nenhuma política casa e o resultado é vazio: **o padrão é
negar**.

RLS está `FORCE` em todas as tabelas, então nem o dono escapa das políticas. Scripts de seed e
migração rodam como superusuário (ou, no Supabase, como `postgres`, que tem `BYPASSRLS`).

O login é a exceção que confirma a regra: acontece antes de existir contexto de conta, e por isso
usa duas funções `SECURITY DEFINER` estreitas (`app.find_user_for_login`,
`app.find_user_for_session`) em vez de afrouxar a política de `users`. Ambas fixam `search_path`.

Há testes que provam cada uma dessas restrições, inclusive tentando ler dados de outra conta com o
id correto em mãos.

---

## Armadilhas já encontradas

Coisas que quebraram durante o desenvolvimento e podem quebrar de novo:

**`revalidatePath` não pode ser chamado durante o render de uma página.** Só em Server Actions e
Route Handlers. A tela de Rastreamento grava `snippet_seen_at` chamando o serviço direto, sem passar
pela Action.

**Ordem de escrita e leitura na mesma renderização.** A mesma tela marca o snippet como visto
*antes* de ler o site — marcar depois faria a página exibir o estado anterior ao próprio ato que
acabou de acontecer.

**Componentes cliente sobrevivem à navegação.** Um formulário cujo `useState` inicializa a partir de
uma prop não reinicializa quando só a prop muda. As telas de cadastro passam `key={id ?? 'novo'}`
para forçar a remontagem ao trocar o alvo da edição.

**Upsert com `DO UPDATE` exige privilégio de UPDATE.** A resolução de páginas na ingestão usa
`DO NOTHING` seguido de `SELECT`, justamente para não precisar conceder UPDATE em `pages` aos papéis
públicos.

**Testes que gravam não podem mirar sites que outros testes medem.** A massa tem um site dedicado
(`escrita.teste`) para as suítes que criam sessões e leads. Sem isso, a ordem de execução mudava os
totais e um teste numérico falhava de forma intermitente.

---

## Convenções

- Código, comentários, mensagens de interface e nomes de teste em **português**.
- Migrações em `supabase/migrations/`, nomeadas `AAAAMMDDHHMMSS_descricao.sql`. Nunca edite uma
  migração já aplicada: escreva outra.
- Testes de unidade em `tests/unit/`, de navegador em `tests/e2e/`. Os dois grupos usam o banco
  `painel_matrix_test`, recriado a cada execução.
- Valores esperados dos testes ficam escritos à mão em `scripts/test-db.ts`, derivados da massa. Se
  uma consulta mudar de comportamento, o teste falha — que é o objetivo.

---

## O que ficou de fora

- **Microsoft Clarity** — retirado desta rodada a pedido. As tabelas `integrations` e
  `integration_sync_runs` existem para que adicionar um provedor depois seja trabalho aditivo.
- **Portal do cliente** — o modelo de dados e as políticas suportam, mas não há telas nem login
  para clientes finais. A plataforma é interna.
- **Exportação de relatórios** — não implementada.
- **Recuperação de senha** — não implementada. Usuários são criados pelo seed ou via SQL.
