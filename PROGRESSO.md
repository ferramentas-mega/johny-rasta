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
| 5 | Integração assistida (Claude Code / GitHub) | em andamento |
| 6 | Validação real e modos de teste | parcial — falta expiração da sessão e separar as 3 verificações |
| 7 | Formulários sem substituição destrutiva | em andamento — `PREENCHER_COM` ainda existe |
| 8 | Inventário de tags e botões | não iniciado |
| 9 | Automação de otimização | não iniciado |
| 10 | Correções elegíveis | não iniciado |
| 11 | Evidências de desempenho | não iniciado |
| 12 | UI/UX | parcial — celular, cards e navegação feitos |
| 13 | Replay/heatmap (futuro) | não iniciado, por último |
| 14 | Testes exigidos | parcial |
| 15 | Ordem e entrega | este arquivo |

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
| `/otimizacoes` | Onde atuar primeiro | `listarOtimizacoes` | Filtrar |
| `/configuracoes` | Conta, definições, sessão | `definitions.ts` | Sair |
| `/api/collect` | Ingestão pública | papel `app_ingest` | POST evento |
| `/api/forms/[publicId]` | Formulários públicos | papel `app_forms` | POST submissão |
| `/api/auditorias/agendar` | Cron: enfileira | `withoutAccount` | GET com segredo |
| `/api/auditorias/processar` | Cron/tela: processa 1 | idem | GET/POST |
| `/api/diagnostico` | Conexões em produção | — | GET |

---

## Defeitos encontrados e ainda abertos

1. **`PREENCHER_COM_...` no exemplo de formulário** — §7 proíbe. O exemplo precisa
   ser executável de verdade.
2. **`visitante` é obrigatório em `SubmissaoRecebida`** — §7: nunca exigir
   identificador de analytics para aceitar um contato legítimo.
3. **Token de diagnóstico não expira** e fica no `sessionStorage` — §6 pede sessão
   curta e que a marca de teste não permaneça ativa para visitante real.
4. **As três verificações do §6 estão conflacionadas** em duas.

## Defeitos encontrados e corrigidos nesta rodada

- Produção rodava o código novo sem a migração `20260916000008` (500 em tudo,
  inclusive na coleta). Migração aplicada e conferida pelo lado do banco.
- `/api/diagnostico` diz "tudoOk" sem olhar o schema — por isso não pegou o item
  acima. **A corrigir.**

---

## Como retomar

```bash
npm run db:setup && npm test && npm run test:e2e
```

Branch: `claude/busy-hopper-3seo9l`. Produção publica a cada push nessa branch.
