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

## MIGRAÇÕES PENDENTES EM PRODUÇÃO

**Leia isto antes de publicar.** Duas migrações estão no repositório e **não**
foram aplicadas ao banco de produção:

- `20260916000009_limites_de_requisicao.sql` — tabela `rate_limits` e as funções
  `app.consumir_limite`, `app.limpar_limites`, `app.zerar_limite`.
- `20260916000010_cron_enxerga_a_fila.sql` — `app.contas_com_job_pendente`,
  `app.contas_com_auditoria_vencida`.

Publicar o código sem aplicá-las **quebra login, coleta e formulários com 500**,
porque `consumirLimite` chama uma função que não existe. Foi exatamente o que
aconteceu com a `20260916000008` nesta mesma rodada, e a reparação custou uma
janela inteira de coleta perdida.

A ordem é: **aplicar a migração, depois publicar.** Nunca o contrário.

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
2. **`/api/diagnostico` diz "tudoOk" sem olhar o schema** — por isso não pegou a
   migração faltando em produção. Deveria conferir que as tabelas e funções que o
   código usa existem, não só que a conexão abre.
3. **Sessão não é revogável antes de expirar** — JWT sem estado. Ver
   `docs/seguranca.md`.
4. **`app_forms` enxerga `leads` de todas as contas** — políticas `using (true)`.
   Sem vazamento em aberto (as consultas filtram por site), mas é a única parte
   onde a defesa é o código e não a política.
5. **SSRF: posse do domínio não é verificada** e o validador não resolve DNS.

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
