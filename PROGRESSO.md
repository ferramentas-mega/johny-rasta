# Progresso da rodada noturna

Arquivo de retomada, pedido no §15 do briefing. Atualizado a cada bloco concluído.
Quem continuar: leia isto antes do `CLAUDE.md`.

---

## Estado por seção do briefing

| § | Assunto | Situação |
|---|---|---|
| 1 | Autonomia e escopo | — |
| 2 | Inspeção antes de modificar | **feito** — tabela de rotas abaixo |
| 3 | Evidências da captura | **feito** — os quatro pontos prioritários resolvidos |
| 4 | Onboarding orientado à conclusão | **feito** (etapas A–E), falta a etapa C "Conectar GitHub" |
| 5 | Integração assistida (Claude Code / GitHub) | parcial — instrução para Claude Code pronta; conexão com GitHub não |
| 6 | Validação real e modos de teste | parcial — falta expiração da sessão de diagnóstico |
| 7 | Formulários sem substituição destrutiva | **feito** — exemplo executável, contato sem analytics |
| 8 | Inventário de tags e botões | não iniciado |
| 9 | Automação de otimização | não iniciado |
| 10 | Correções elegíveis | não iniciado |
| 11 | Evidências de desempenho | não iniciado |
| 12 | UI/UX | parcial — celular, cartões, navegação e funil de leads feitos |
| 13 | Replay/heatmap (futuro) | não iniciado, por último |
| 14 | Testes exigidos | parcial |
| 15 | Ordem e entrega | este arquivo |

Auditoria de segurança (briefing próprio): **feita e implementada**. O que foi
corrigido e o que continua em aberto está em [`docs/seguranca.md`](docs/seguranca.md)
— inclusive o que **não** foi corrigido, com o motivo.

---

## Tabela de rotas (§2)

| Rota | Finalidade | Fonte de dados | Ações |
|---|---|---|---|
| `/entrar` | Login | `app.find_user_for_login` | Autenticar |
| `/visao-geral` | Carteira: um cliente por linha | `getCarteira` + `resumoDeConfiguracao` | Buscar, trocar período |
| `/clientes` | Cadastro de clientes | `listarClientes` | Criar, editar, arquivar |
| `/clientes/[id]` | Painel do cliente | `getKpis` por site | Trocar período |
| `/sites` | Cartões de site, cor = estado da configuração | `listarSites` + `resumoDeConfiguracao` | Criar, editar, configurar |
| `/sites/[id]/desempenho` | KPIs e série diária | `getKpis`, `getSerie` | Período |
| `/sites/[id]/comportamento` | Páginas, botões, origens | `queries.ts` | Período |
| `/sites/[id]/qualidade` | Lighthouse + CrUX | `lighthouse_results`, `crux_snapshots` | Cadastrar URL, analisar |
| `/sites/[id]/rastreamento` | Snippet e eventos brutos | `events` | Evento de teste |
| `/sites/[id]/configurar` | Assistente de 7 etapas | `site_features` + derivação | Todas as etapas |
| `/leads` | Contatos e **funil de qualidade** | `getFunilDeLeads` + `leads` | Período, site |
| `/otimizacoes` | Onde atuar primeiro | `listarOtimizacoes` | Filtrar |
| `/configuracoes` | Conta, definições, sessão | `definitions.ts` | Sair |
| `/api/collect` | Ingestão pública | papel `app_ingest` | POST evento |
| `/api/forms/[publicId]` | Formulários públicos | papel `app_forms` | POST submissão |
| `/api/auditorias/agendar` | Cron: enfileira | conta a conta, sob RLS | GET com segredo |
| `/api/auditorias/processar` | Cron/tela: processa 1 | idem | GET/POST |
| `/api/diagnostico` | Conexões em produção | — | GET |

---

## Migrações e a ordem de publicação

**A regra: aplicar a migração, depois publicar. Nunca o contrário.**

Não é zelo. Nesta mesma rodada o código subiu antes da `20260916000008` e
produção passou a responder 500 em tudo — inclusive na coleta, então a janela
inteira de eventos daquele período se perdeu. Pior: o `/api/diagnostico`
respondeu `tudoOk: true` durante o incidente, porque conferia se a conexão abria
e mais nada.

Estado atual, conferido contra o banco de produção em 15/09/2026:

| Migração | Em produção |
|---|---|
| `20260916000009_limites_de_requisicao.sql` | **aplicada** |
| `20260916000010_cron_enxerga_a_fila.sql` | **aplicada** |

Conferência feita objeto a objeto (`to_regclass` / `to_regprocedure`), incluindo
o privilégio que importa: `app_ingest` executa `app.consumir_limite` e **não**
consegue dar `select` em `rate_limits`.

Hoje quem responde essa pergunta é o próprio aplicativo: `/api/diagnostico`
compara o banco com `src/server/esquema.ts` — a lista do que o código publicado
exige — e nomeia o que falta. Ao escrever uma migração nova, acrescente ali os
objetos que o código passou a usar.

---

## Defeitos encontrados e corrigidos nesta rodada

**CI vermelho há cinco commits, por culpa minha.** `playwright.config.ts` fixava
`executablePath: '/opt/pw-browsers/chromium'`, que é o caminho do contêiner de
desenvolvimento e não existe no runner do GitHub. As 57 provas de navegador
falhavam com "executable doesn't exist", e o passo de `build` vinha depois e era
pulado — o CI parou de responder a pergunta para a qual foi criado. Hoje o
caminho só é usado se o arquivo existir.

**O cron não enxergava a fila. Nem uma linha.** `withoutAccount` + RLS `FORCE` =
zero linhas visíveis. Medido, não deduzido:

```
Jobs pendentes (superusuário):                     1
Jobs pendentes (app_user sem conta, = cron antes):  0
Jobs pendentes (app_user COM conta):                1
```

Os dois endpoints agendados eram um no-op que se declarava bem-sucedido.
Detalhe em `docs/seguranca.md`.

**Escrever no site de outra conta.** As Actions de configuração recebem o
`siteId` por campo oculto, e a RLS não barrava porque o `account_id` gravado é o
de quem escreve — quem não era conferido é o `site_id`. Dava para trancar o
onboarding de outra conta para sempre, via `unique (site_id, feature)`.

**Lead perdido por coluna `NOT NULL`.** Regressão minha: ao tornar
`idempotencia` opcional, o evento de analytics continuou gravando a chave do
cliente em `events.event_uid`. Submissão sem chave e com sessão aberta derrubava
a transação inteira por rollback.

**O limite de login contava acertos.** Quem entrasse onze vezes em cinco minutos
levava a mesma trava da varredura de dicionário. Quem achou foi a própria suíte
de navegador, travando em `waitForURL` a partir do décimo login da execução.
Hoje o acerto zera o contador — força bruta nunca acerta, então o contador dela
nunca é zerado.

**A CSP quase foi medida no lugar errado.** 4.536 violações no `next dev`, todas
de `eval`, contra **zero recusas** no `next start`. Medir no servidor de
desenvolvimento teria levado a afrouxar a política de produção por causa do
recarregamento a quente.

**`/api/diagnostico` declarava "tudo OK" sem olhar o esquema.** Foi por isso que ele
respondeu `tudoOk: true` durante o incidente inteiro em que produção devolvia 500 em tudo,
inclusive na coleta: a conexão abria, a tabela é que não existia. Agora `src/server/esquema.ts`
lista o que o código publicado EXIGE do banco — tabelas, colunas acrescentadas por migrações
posteriores, e funções com a assinatura exata — e o endpoint nomeia o que falta. Há teste que
derruba uma tabela, uma coluna e uma função de verdade e confere que cada uma é apontada.

**Job preso em `executando` era reivindicado para sempre.** `MAX_TENTATIVAS` só
era consultado em `registrarFalha`, que não roda quando o processo morre. Uma URL
pesada consumiria a única vaga diária do plano Hobby, indefinidamente.

Além destes: `fuso` e `urlPrincipal` sem validação derrubando telas inteiras,
`CRON_SECRET` comparado fora de tempo constante, `POST /api/sair` sem verificação
de origem, `SESSION_SECRET` aceito com qualquer tamanho, `X-Powered-By` ligado,
e `snippetFormulario` interpolando dentro de atributo HTML sem escapar.

---

## Defeitos encontrados e ainda abertos

1. **Token de diagnóstico não expira** e fica no `sessionStorage` — §6 pede sessão
   curta e que a marca de teste não permaneça ativa para visitante real.
2. **Sessão não é revogável antes de expirar** — JWT sem estado. Ver
   `docs/seguranca.md`.
3. **`app_forms` enxerga `leads` de todas as contas** — políticas `using (true)`.
   Sem vazamento em aberto (as consultas filtram por site), mas é a única parte
   onde a defesa é o código e não a política.
4. **SSRF: posse do domínio não é verificada** e o validador não resolve DNS.

---

## Como retomar

```bash
npm run db:setup
npm test                 # unidade
npm run test:e2e:prod    # navegador, contra o pacote publicado
```

`test:e2e` (sem `:prod`) roda contra `next dev` — mais rápido para iterar, mas
**não** exercita a CSP, que só existe em produção.

Branch: `claude/busy-hopper-3seo9l`. Produção publica a cada push nessa branch —
por isso a seção de migrações pendentes acima é a primeira coisa a resolver.
