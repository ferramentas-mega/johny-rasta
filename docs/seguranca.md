# Segurança

O que existe, o que foi corrigido, e o que continua em aberto.

Este documento **não afirma que o aplicativo é seguro.** Ele descreve defesas
concretas e nomeia o que elas não cobrem. Uma lista de controles implementados é
uma afirmação verificável; "100% seguro" não é nada.

---

## O modelo: quem pode o quê

Três papéis do Postgres, com privilégios diferentes, e RLS `FORCE` em todas as
tabelas — nem o dono escapa das políticas.

| Papel | Usa | Não pode |
|---|---|---|
| `app_user` | O painel | Ver outra conta (RLS por `app.account_id`) |
| `app_ingest` | `/api/collect` | Ler leads, usuários, clientes, integrações — **sem GRANT algum** |
| `app_forms` | `/api/forms/[id]` | Ler usuários e contas; alterar submissões gravadas |

A conta da requisição entra por `set_config('app.account_id', …, true)` a cada
transação. Sem ela, `app.current_account_id()` devolve `NULL`, nenhuma política
casa, e o resultado é vazio: **o padrão é negar**.

Duas exceções, ambas estreitas e ambas `SECURITY DEFINER` com `search_path`
fixo, porque acontecem antes de existir contexto de conta:

- **Login** — `app.find_user_for_login`, `app.find_user_for_session`.
- **Cron** — `app.contas_com_job_pendente`, `app.contas_com_auditoria_vencida`.
  Devolvem apenas identificadores de conta; o trabalho em si roda dentro de
  `withAccount`, conta por conta.

---

## Corrigido nesta rodada

Cada item abaixo foi **verificado no código ou medido**, não deduzido.

### O cron não enxergava a fila. Nem uma linha.

Os dois endpoints agendados rodavam com `withoutAccount`, que abre a transação
sem `app.account_id`. As tabelas de qualidade estão com RLS `FORCE` e política
`using (account_id = app.current_account_id())`. Sem conta, `account_id = NULL` é
`NULL`, nada casa.

Medido contra o banco de testes, com um job pendente inserido como superusuário:

```
Jobs pendentes (superusuário):                    1
Jobs pendentes (app_user sem conta, = cron antes): 0
Jobs pendentes (app_user COM conta):              1
```

`/api/auditorias/agendar` respondia `{"enfileiradas": 0}` todo dia sem enfileirar
nada. `/api/auditorias/processar` dizia "fila vazia". **Nenhum erro em lugar
nenhum** — os dois eram um no-op que se declarava bem-sucedido. E, se a
reivindicação tivesse funcionado, `registrarSucesso` gravaria
`account_id = app.current_account_id()` — `NULL` numa coluna `NOT NULL` —
perdendo o trabalho já pago ao Google na hora de salvar.

Não é só disponibilidade: um agendamento que nunca roda faz o painel mostrar
notas antigas como se fossem o estado atual do site.

**Correção:** o cron pergunta ao banco quais contas têm trabalho e processa cada
uma dentro de `withAccount`, como um usuário logado daquela conta. A política
vale o tempo todo, e um defeito ali erra uma conta em vez da base inteira. Dar
`BYPASSRLS` ao cron seria mais curto e trocaria um endpoint quebrado por um que
enxerga todas as contas de uma vez.

### Escrever no site de outra conta, e trancar o dono

`salvarEscolhaDeRecursos`, `iniciarDiagnostico`, `salvarFormulario`,
`conferirDiagnostico` e `conferirQualidade` recebem o `siteId` por **campo oculto
do formulário**. Server Action não é rota: o Next não confere esse valor contra o
`[siteId]` do caminho.

A RLS não barrava, e o motivo é sutil: o `account_id` gravado em `site_features`
vem de `app.current_account_id()`, ou seja, **é o da conta que escreve**. A
política aprova a linha porque a linha é da conta certa. O que ela não olha é o
`site_id`, que veio do corpo da requisição.

Resultado: um usuário autenticado da conta A mandava o `siteId` de um site da
conta B e criava a linha `(A, site-de-B, 'visitas')`. Como `site_features` tem
`unique (site_id, feature)`, **o dono legítimo ficava impedido de gravar o
próprio recurso para sempre**, contra uma linha que a política esconde dele.
Negação de serviço entre clientes, ao alcance de qualquer sessão válida.

**Correção:** `exigirSiteDaConta` antes de toda escrita. A consulta roda sob RLS,
então site de outra conta e site inexistente dão a mesma resposta — distinguir
confirmaria a existência de um registro alheio a quem só tem o id. As Actions
devolvem a mensagem em vez de confirmar uma gravação que não aconteceu.

### Os papéis públicos enxergavam todos os sites

`app_ingest` e `app_forms` tinham políticas `using (true)` em `pages`,
`sessions`, `events`, `leads` e `form_submissions`. Traduzindo: o papel do
endpoint público de formulários podia ler os leads de **todas as contas**.

Não houve vazamento. As consultas dos dois endpoints sempre filtraram por site, e
são parametrizadas. Mas essa era a única parte do sistema onde quem protegia era
o código, e não a política — em todo o resto, um erro de consulta devolve vazio;
ali, devolveria a base inteira.

**Correção:** o mesmo mecanismo do painel, um nível abaixo.
`resolverSite` — o ponto por onde os dois endpoints obrigatoriamente passam,
porque é assim que descobrem de que site é a requisição — faz
`set_config('app.site_id', …, true)`, e as políticas casam por `site_id =
app.current_site_id()`. Sem o ajuste, a função devolve `NULL`, `site_id = NULL` é
`NULL`, nenhuma política casa: **o padrão continua sendo negar**.

`sites` é a exceção necessária, e é estreita: é lendo `sites` que o endpoint
descobre qual é o site. Ela só concede SELECT, e a política continua sendo "não
arquivado".

O que isto **não** resolve: o identificador público continua público, e quem o
tem envia eventos daquele site. Isso é da natureza de um coletor que roda no
navegador — quem limita o abuso é o rate limit por site. O que muda é o alcance
de um ERRO: antes, um defeito de consulta podia expor a base; agora, no máximo um
site.

`tests/unit/escopo-publico.spec.ts` tenta a leitura cruzada com o id certo em
mãos, tenta as duas escritas cruzadas, e traz um caso de CONTROLE — sem ele, uma
política que negasse tudo, inclusive ao endpoint legítimo, passaria no teste.

### Lead perdido por uma coluna `NOT NULL`

Regressão introduzida ao tornar `idempotencia` opcional no endpoint de
formulários: o evento de analytics correspondente gravava `dados.idempotencia` em
`events.event_uid`, que é `not null`. Submissão com sessão aberta e sem chave do
cliente violava a restrição, **derrubava a transação inteira por rollback** e
perdia o lead que acabara de ser gravado — exatamente o prejuízo que tornar a
chave opcional queria evitar. Hoje usa a chave efetiva, que sempre existe.

### Content Security Policy — e onde medi-la

CSP com nonce por requisição, em `src/middleware.ts`, **bloqueando** (não modo
relatório). Junto: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS em
produção, e `X-Powered-By` desligado.

A medição decidiu a política, e o lugar da medição quase decidiu errado:

| Onde | Violações |
|---|---|
| `next dev` | **4.536**, todas de `'unsafe-eval'` |
| `next start` | **0 recusas** |

O modo de desenvolvimento do Next compila com `eval` — é assim que o
recarregamento a quente funciona. Medir ali e concluir que a política precisa de
`'unsafe-eval'` teria enfraquecido a produção por causa de uma ferramenta que não
vai para lá. Por isso a política **só existe quando `NODE_ENV=production`**, e o
CI roda a suíte de navegador contra `next start` (`npm run test:e2e:prod`).

`style-src` mantém `'unsafe-inline'`: o projeto inteiro é construído com
`style={{…}}`, sem Tailwind nem classes utilitárias. Não é descuido, é a
consequência da arquitetura visual — e está anotado como limitação, não como
escolha de segurança.

`CSP_RELATORIO=1` rebaixa a produção a modo relatório sem mexer em código. A
saída de emergência existe; o padrão é bloquear.

### Limites de requisição, com estado no banco

| Caminho | Limite | Escopo |
|---|---|---|
| Login | 10 / 5 min | por e-mail |
| `/api/collect` | 600 / min | por site |
| `/api/forms/[id]` | 30 / 10 min | por site |

O estado vive em `rate_limits`, não em memória: a aplicação roda em funções
serverless, onde um contador num `Map` é reiniciado a cada invocação fria e não é
compartilhado entre instâncias. Quem tenta força bruta abre requisições em
paralelo e cada uma cai numa instância diferente — **um limitador que não limita
é pior que nenhum**, porque dá a impressão de proteção.

O incremento e a leitura acontecem numa chamada só, do lado do banco: entre um
`select` e um `update` cabe outra requisição.

**Falha aberta de propósito.** Se o banco não responder, a requisição segue.
Derrubar o login de todo mundo porque a tabela de contadores está indisponível
troca um problema pequeno por um grande. O erro vai para o log.

O limite da coleta é cobrado **depois** de resolver o site: cobrar pelo
identificador cru deixaria qualquer um encher a tabela com ids inventados.

### Tempo constante onde o tempo conta

- **Login.** A resposta era mais rápida para e-mail inexistente, porque o
  short-circuit pulava a verificação da senha. Hoje um hash de comparação é
  verificado mesmo sem usuário. Medido: 54 ms contra 53 ms.
- **`CRON_SECRET`.** Comparado com `===` em dois endpoints, enquanto o token de
  diagnóstico do mesmo projeto já fazia certo. Ter as duas formas no mesmo
  repositório é pior que ter só a insegura: sugere que alguém pensou no assunto e
  decidiu que ali não valia. Hoje os três usam `segredoConfere`
  (`timingSafeEqual`).

### Entrada que derrubava a tela

- **`fuso`** era `z.string().min(3).max(64)` — texto livre indo para
  `at time zone <fuso>`. Um nome desconhecido **lança**, derrubando as telas do
  site e a visão geral da conta, que percorre todos os sites. O `<select>` da
  interface não protege nada: uma Server Action recebe o que mandarem no corpo.
  Hoje é validado contra `src/lib/fusos.ts`.
- **`urlPrincipal`** era `string().max(512)` e depois passava por `new URL()` no
  render de um Server Component. `new URL('meusite.com')` lança — e no render
  isso não é um campo com erro, é a tela inteira fora do ar, justamente a tela
  onde se corrigiria o valor. Hoje exige endereço absoluto `http(s)`, e a página
  cai para o domínio quando encontra um valor antigo inválido.

### Outros

- **Corpo grande demais** recusado antes de ler: 16 KB na coleta, 64 KB nos
  formulários. `request.text()` carrega tudo na memória.
- **`POST /api/sair`** exige mesma origem. Antes, qualquer página da internet
  submetia um formulário e derrubava a sessão de quem estivesse logado.
- **`SESSION_SECRET`** exige 32 caracteres. HS256 assina com HMAC-SHA256: um
  segredo curto é quebrável offline, e quem o quebrar **fabrica sessões de
  qualquer usuário** sem senha nenhuma. A mensagem de erro diz o tamanho exigido
  e nunca o valor recebido.
- **Job preso em `executando`** era reivindicado para sempre: `MAX_TENTATIVAS` só
  era consultado em `registrarFalha`, que não roda quando o processo morre no
  meio — o caso comum, já que a Vercel corta a função aos 60 s. Com uma análise
  por dia no plano Hobby, **uma única URL nessa condição consumia a vaga diária
  inteira, indefinidamente**, e o sintoma seria "as auditorias pararam", sem erro
  em lugar nenhum.
- **`snippetFormulario`** escapa o que vai dentro de atributo HTML. É o único
  ponto do projeto que monta HTML por concatenação; em todo o resto quem escapa é
  o React. Os dois chamadores de hoje passam uma constante — escapar é o que
  impede que o primeiro a passar o nome do site produza um formulário quebrado no
  site do cliente.

---

## Em aberto, e por quê

Nomeado aqui porque uma auditoria que só lista o que foi corrigido esconde o
resto.

**Sessão não é revogável antes de expirar.** O cookie é um JWT sem estado; sair
apaga o cookie, não invalida o token. Quem copiou o cookie continua entrando até
os sete dias vencerem. Mitiga: `httpOnly`, `secure` em produção, `sameSite=lax`,
e conta/nome vindos do banco a cada requisição (então desativar o usuário tem
efeito imediato). Resolver de verdade pede uma tabela de sessões.

**Sem segundo fator.** Nenhum ponto do login oferece 2FA.

**Sem recuperação de senha.** Usuários são criados pelo seed ou via SQL. Não é
descuido: a tela de login não oferece "esqueci minha senha" porque link para rota
inexistente é um 404 fantasiado de funcionalidade.

**`users.role` não é verificado em lugar nenhum.** A coluna existe e sugere um
nível de acesso que nenhum código consulta. Todo usuário da conta pode tudo
dentro dela.

**`Origin` ausente é aceito em `/api/collect`.** É deliberado: `sendBeacon` de
mesma origem e navegadores antigos não mandam o cabeçalho, e recusar perderia
evento legítimo. A consequência é que a verificação de origem **não barra cliente
que não seja navegador** — qualquer `curl` com o identificador público (que está
no HTML de quem instalar) envia eventos. O que limita o abuso é o rate limit por
site, não a origem.

**A flag `teste` vem do corpo nos endpoints públicos.** Quem conhece o
identificador público pode gravar eventos que ficam fora dos relatórios. Não dá
para esconder tráfego alheio com isso — só para injetar o próprio, que já é
possível. O token de diagnóstico, esse, força `is_test` no **servidor**.

**SSRF: a posse do domínio não é verificada.** A análise técnica exige que a URL
seja do domínio do site cadastrado, mas nada prova que o domínio é seu — basta
cadastrar um site com o domínio alvo. O validador recusa endereço privado por
forma, porém **não resolve DNS**, então um nome público apontando para IP privado
passa. O alcance real é o que o PageSpeed do Google consegue buscar, não a rede
interna da Vercel: quem faz a requisição externa é o Google, não este servidor.

**Sem justiça entre contas na fila de auditoria.** FIFO global, uma execução por
dia no plano Hobby. Uma conta com muitas URLs atrasa as demais.

---

## Como verificar

```bash
npm test                 # unidade, inclusive autorização e isolamento entre contas
npm run test:e2e:prod    # navegador, contra o pacote publicado — é onde a CSP vale
```

Há testes que tentam ler dados de outra conta **com o id correto em mãos** e
esperam vazio. Um teste que só confere o caminho feliz não prova isolamento.

O CI roda tipos, lint, unidade, build e navegador a cada push, nessa ordem: build
quebrado aparece em segundos, e a suíte de navegador exercita o que de fato vai
ao ar.
