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
| 4 | Onboarding orientado à conclusão | **feito** — sete etapas, cabeçalho de próxima ação, instalação assistida |
| 5 | Integração assistida (Claude Code / GitHub) | **feito pelo que existe** — instrução assistida na tela; OAuth do GitHub segue fora |
| 6 | Validação real e modos de teste | **feito** — diagnóstico com prazo de 30 min, nos dois lados |
| 7 | Formulários sem substituição destrutiva | **feito** — exemplo executável, contato sem analytics |
| 8 | Inventário de tags e botões | **feito** — estados por botão, ação sugerida e detecção de tag duplicada |
| 9 | Automação de otimização | **feito** — fechamento por medição, reanálise enfileirada, varredura diária |
| 10 | Correções elegíveis | **feito** — auditorias do Lighthouse por URL e dispositivo |
| 11 | Evidências de desempenho | **feito** — série por URL e dispositivo, laboratório e campo |
| 12 | UI/UX | parcial — celular, cartões, navegação e funil; rolagem lateral agora cobre as 11 telas |
| 13 | Replay/heatmap (futuro) | **não será feito nesta rodada** — o dado não existe; motivo no CLAUDE.md |
| 14 | Testes exigidos | **feito** — 374 de unidade, 78 de navegador, com controle negativo por regra |
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
| `20260916000011_diagnostico_expira.sql` | **aplicada** |

O inventário de tags e botões **não** precisou de migração: ele é derivado de `events`, que já
guardava `button_id`, `button_text` e `button_position` desde o esquema inicial.

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

**O token de diagnóstico não vencia nunca.** `encerrada_em` existia desde o começo e nada a
preenchia. Como todo evento que chega com o token nasce `is_test`, um link colado num grupo ou
esquecido numa aba faria **visitas reais sumirem dos relatórios** — em silêncio, até o fechamento do
mês. Agora são 30 minutos, aplicados em três lugares: o coletor guarda o token com hora de validade
e para de enviá-lo (é o que de fato protege o visitante, porque age antes de o evento sair do
navegador), a verificação só conta evento dentro da janela da sessão, e abrir um diagnóstico novo
encerra os anteriores. A ingestão continua sem acesso à tabela de sessões — resolver isso ali
trocaria perda de dado por privilégio a mais no papel mais exposto.

**Job preso em `executando` era reivindicado para sempre.** `MAX_TENTATIVAS` só
era consultado em `registrarFalha`, que não roda quando o processo morre. Uma URL
pesada consumiria a única vaga diária do plano Hobby, indefinidamente.

Além destes: `fuso` e `urlPrincipal` sem validação derrubando telas inteiras,
`CRON_SECRET` comparado fora de tempo constante, `POST /api/sair` sem verificação
de origem, `SESSION_SECRET` aceito com qualquer tamanho, `X-Powered-By` ligado,
e `snippetFormulario` interpolando dentro de atributo HTML sem escapar.

---

## Fechado nesta rodada

**Os papéis públicos enxergavam todos os sites.** `app_ingest` e `app_forms`
tinham `using (true)` em `pages`, `sessions`, `events`, `leads` e
`form_submissions` — o papel do endpoint de formulários podia ler os leads de
qualquer conta. Sem vazamento em curso (as consultas sempre filtraram por site),
mas era a única parte do sistema onde quem protegia era o código e não a
política. Hoje `resolverSite` ajusta `app.site_id` e as políticas casam por
`site_id = app.current_site_id()`. Migração `20260916000012`, aplicada em
produção **depois** do código — migração que restringe política tem a ordem
inversa da aditiva, e isso está registrado no `CLAUDE.md`.

**A régua do gráfico mentia sobre o próprio espaçamento.** Linhas igualmente
espaçadas, rotuladas com `topo × [0, .25, .5, .75, 1]` sobre topos não
divisíveis por quatro: máximo 1 virava `0, 0, 1, 1, 1`. Ver o commit da revisão
de componentes — inclusive o que a prova de navegador deixou de decidir, e onde
a cobertura real passou a morar.

**Revisão das cinco abas do site, e da aba Sites.** Três recursos existiam
inteiros no servidor e não tinham porta na tela — editar site, arquivar site e
remover URL monitorada —, e a etapa de formulários não tinha como ser concluída
por ela mesma. Detalhe que vale guardar: o teste da edição montava
`/sites?editar=<id>` à mão, então passava com o produto inalcançável.

---

**Coluna escrita e nunca lida, com a tela mandando olhar para ela.**
`lighthouse_results.auditorias` guardava todas as auditorias de cada análise
desde o esquema inicial — 153 na medição real — e **nenhuma linha do projeto lia
essa coluna**. Ao mesmo tempo, a lista de Otimizações trazia como próxima ação
"Abrir Qualidade técnica e ver os diagnósticos", e a tela de Qualidade técnica
não mostrava diagnóstico nenhum: o produto mandava o operador a um lugar que não
tinha o que ele foi buscar. É a mesma família do "recurso sem porta na tela", só
que do lado do dado.

**Duas cópias do formatador de duração, as duas escrevendo ponto.** A tela de
qualidade e o painel de correções tinham cada uma sua `ms()`/`duracao()` com
`toFixed(1)`, imprimindo `2.5 s` numa interface inteira em português. Só ficou
visível quando os dois apareceram lado a lado: o valor do próprio Lighthouse
vinha `2,45 s` (ele respeita o `locale=pt_BR` que pedimos) e o nosso, ao lado,
`2.5 s`. Hoje é `duracaoMs` em `src/lib/formato.ts`, como manda a regra da casa.

**Objetos novos não declarados em `esquema.ts`.** Falha minha, nas migrações do
§9: `optimizations.dispositivo` e `app.contas_com_acompanhamento_aberto()`
entraram no banco e não na lista que o `/api/diagnostico` confere. Não quebrou
nada porque as migrações foram aplicadas antes do código — mas é justamente esse
arquivo que existe para um deploy contra um banco atrasado ser NOMEADO em vez de
dar 500 sem explicação.

---

## Por que o §13 não foi feito

Replay de sessão e mapa de calor **não são construíveis com o dado que este sistema coleta**, e
fingir o contrário seria pior que não fazer.

`events.button_position` parece prometer um mapa de calor e não é isso: é um RÓTULO que o operador
escreve no HTML (`data-track-pos`), com valores como "topo" ou "rodapé". Não existe coordenada de
ponteiro em lugar nenhum do sistema, nem gravação de DOM. Um "mapa de calor" derivado dali
desenharia pontos onde ninguém mediu clique.

Fazer de verdade exige mudar o que o coletor é. O `t.js` declara, na primeira linha, que não lê
campo de formulário e não envia dado pessoal; um replay grava a tela inteira, inclusive o que a
pessoa digitou antes de enviar — inclusive o que ela apagou. Isso é outro produto, com outra
conversa sobre consentimento e retenção, e o próprio briefing marca a seção como futura.

A pergunta vizinha que o painel já responde, com dado medido: **em que botão clicam e onde ele está
na página** — aba Comportamento e inventário de tags.

---

## Defeitos encontrados e ainda abertos

1. **Sessão de login não é revogável antes de expirar** — JWT sem estado. Ver
   `docs/seguranca.md`.
2. **`users.role` não é verificado em lugar nenhum** — a coluna existe e sugere
   um nível de acesso que nenhum código consulta.
3. **Posse do domínio não é verificada** na análise técnica. Não é SSRF: as
   únicas saídas do aplicativo vão para dois endereços fixos do Google, com a
   URL do usuário como parâmetro. O custo real é de quota, não de rede — e por
   isso resolver DNS no validador seria teatro. Ver `docs/seguranca.md`.
4. **Sem justiça entre contas na fila de auditoria** — FIFO global, uma execução
   por dia no plano Hobby.
5. **`removerCliente` continua órfã** — arquivar cliente com sites ativos tem
   regra própria (`arquivarCliente` devolve um motivo) e merece tela própria.
6. **Os totais de rodapé do Desempenho são somados no componente**, contra a
   regra da casa. Ali há prova de navegador exigindo que batam com os cartões,
   então é dívida conhecida, não divergência solta.
7. **A massa de navegador não exercita o segundo eixo do gráfico.** Máximos 5 e
   2 caem no mesmo topo, e ali a implementação certa e a normalizada desenham a
   mesma curva. Quem decide hoje é `tests/unit/eixo.spec.ts`; fechar de vez pede
   um site de massa com ordens de grandeza separadas.

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
