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

**Nota técnica pertence a uma URL e a um dispositivo.** Nunca a um cliente, nunca a um site inteiro.
A mesma página tem notas diferentes no celular e no computador. Se alguém pedir "a nota do cliente",
a resposta certa é a lista das análises, não uma média inventada para caber num cartão.

**Laboratório e campo não se misturam.** Lighthouse mede uma execução controlada; o CrUX mede
usuários reais em 28 dias. Neste projeto, a mesma página deu LCP de 12,0 s no laboratório e 3,2 s no
campo — os dois estão certos, e nenhum substitui o outro. Em particular: o Lighthouse **não mede
INP**, mede TBT. A coluna se chama `tbt_ms` pelo nome do que ela é.

**A interface não conclui causalidade.** Lentidão e queda de conversão podem aparecer juntas sem uma
causar a outra. A tela de Otimizações mostra os dois sinais separados, com a evidência de cada um.
Pela mesma razão, ficar sem eventos só vira aviso num site que **já coletava com regularidade**
(mais de 30 eventos) — site pequeno passa dias sem visita, e alarme falso treina o usuário a ignorar
a lista.

**Estado é por recurso, e progresso é derivado.** Não crie um `configurado: true` para o site nem um
`etapa_atual` no banco. `site_features` guarda só a escolha do operador e o fato histórico de uma
verificação ter passado, com evidência; o estado exibido e a etapa em que o assistente retoma são
calculados em `src/lib/recursos.ts`. Um contador mentiria para quem voltasse e desmarcasse um
recurso.

**Verificação é um evento recebido, nunca um tempo decorrido.** E nunca a presença do snippet no
HTML: script bloqueado por CSP, consentimento ou bloqueador está lá e não mede nada. A sessão de
diagnóstico existe para separar o teste do operador do tráfego real — sem o token, "recebemos um
clique no WhatsApp" pode ser de qualquer pessoa.

**Diagnóstico é teste, decidido no SERVIDOR.** `registrarEvento` e `registrarSubmissao` forçam
`is_test` quando há token, mesmo que o cliente não tenha marcado. Confiar só no coletor deixaria um
diagnóstico virar número de relatório se o campo se perdesse no caminho.

**Uma transação, uma conexão.** `Queryable` serializa as consultas de uma mesma transação numa
fila, porque o driver `pg` não aceita duas simultâneas no mesmo client. Um `Promise.all` dentro de
um `withAccount` não quebra — ele espera. Fora de uma transação, `Promise.all` é livre: cada
`withAccount` pega sua própria conexão.

---

## Indexação

Nenhuma página deste aplicativo é feita para busca. As decisões, e o porquê:

- `src/app/robots.ts` declara `Disallow` para as rotas autenticadas. **Não é proteção** — quem
  ignora o arquivo entra igual. Quem protege é a sessão exigida em `(painel)`.
- `/entrar` e `/teste/[publicId]` **não** aparecem no `Disallow`, de propósito: bloquear o
  rastreamento e ao mesmo tempo esperar que o buscador leia o `noindex` delas é contraditório — ele
  precisa buscar a página para ver a meta tag. Elas carregam `noindex` no HTML, pelo `metadata` do
  layout raiz, que é o mecanismo certo para desindexar.
- **Não existe `sitemap.xml`, e não deve existir.** Sitemap serve para ajudar a indexar conteúdo
  público destinado à busca; aqui não há nenhum. Criar um só para eliminar um 404 seria publicar um
  índice de rotas administrativas sem ganho algum. O 404 em `/sitemap.xml` é a resposta correta.

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

As tabelas de qualidade técnica (`monitored_urls`, `lighthouse_results`, `crux_snapshots`,
`audit_jobs`, `optimizations`) recebem GRANT **apenas de `app_user`**. Os papéis públicos não têm
nada ali: nem para ler.

O cron é a segunda exceção, e ela é estreita de propósito. Ele não tem sessão, logo não tem conta, e
precisa varrer a fila inteira — então usa `withoutAccount`. É exatamente por isso que esse caminho
exige o `CRON_SECRET`, e por isso o **GET** de `/api/auditorias/processar` recusa a sessão: um GET
autorizado por cookie seria disparável por qualquer página que o usuário logado abrisse. Sem a
variável configurada, os dois endpoints respondem 401 a todo mundo.

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

**Massa de teste ancorada em UTC, janela recortada no fuso do site.** A massa posicionava o "dia 0"
em 12:00 UTC de hoje, enquanto `resolvePeriod` recorta com
`date_trunc('day', now() at time zone <fuso do site>)`. Entre 00:00 e 03:00 UTC, São Paulo ainda
está no dia anterior: o dia 0 caía num dia futuro, saía da janela de 7 dias, e quatro testes
numéricos falhavam — nas outras 21 horas do dia, passavam. Hoje quem responde que dia é hoje é o
Postgres, com o mesmo fuso da consulta (`FUSO_DA_MASSA` em `scripts/test-db.ts`). Há um teste que
falha se a âncora voltar a divergir, e ele vale a qualquer hora.

**Testes que gravam não podem mirar sites que outros testes medem.** A massa tem um site dedicado
(`escrita.teste`) para as suítes que criam sessões e leads. Sem isso, a ordem de execução mudava os
totais e um teste numérico falhava de forma intermitente.

**O `fetch` do Next.js cacheia GET por padrão, e isso falsifica medição.** A URL da API do PageSpeed
é idêntica a cada execução da mesma página e estratégia, então a **primeira resposta com falha
ficava valendo para sempre**: a mesma URL falhava eternamente pelo aplicativo e respondia 200 via
`curl`. Toda chamada externa de medição leva `cache: 'no-store'`. Se for tentado a tirar, não tire.

**HTTP 200 não quer dizer que a análise deu certo.** O PageSpeed responde 200 e informa a falha
dentro do corpo, em `lighthouseResult.runtimeError`. Interpretar como sucesso gravaria uma linha com
quatro notas nulas — que na tela parece medição. Hoje isso lança e o job volta para a fila. Pelo
mesmo motivo, `registrarFalha` **não toca** em `lighthouse_results`.

**`ctx.font` não resolve variáveis CSS.** O canvas usa o parser de fonte do CSS, que não resolve
`var(--fonte-mono)` fora de uma árvore de estilo. String inválida é ignorada **em silêncio** e o
contexto fica em `10px sans-serif`. Como o espaçamento das linhas da chuva é calculado em JS,
aumentar o tamanho aumentava só o vazio entre os dígitos, sem nenhum erro aparecer. O valor é lido
com `getComputedStyle` e concatenado já resolvido.

**Canvas transparente não se apaga pintando por cima.** `source-over` nunca zera o que já está lá:
pintar preto translúcido acumula uma camada opaca e deixa resíduo. Para apagar o rastro num canvas
sobreposto, é `globalCompositeOperation = 'destination-out'`, que reduz o **alfa** do que já foi
desenhado.

**Servidor antigo preso na porta serve HTML velho.** Mais de uma conferência visual minha olhou para
um build que não era o recém-compilado: o `npm start` novo falhava com `EADDRINUSE` num arquivo de
log que eu não lia, e o processo anterior continuava respondendo — com chunks que já não existiam em
disco, dando 400 e impedindo a hidratação. Se a tela parecer "sem JavaScript", confira o log do
servidor **antes** de procurar defeito no componente.

**`server-only` quebra o build quando um componente cliente importa o módulo.** Foi por isso que as
regras puras de configuração saíram para `src/lib/recursos.ts`: os rótulos e o indicador de progresso
vivem na tela. O efeito colateral bom é que a derivação virou testável sem subir banco.

**`:hover` não existe em estilo inline.** O menu lateral inteiro era inline, e por isso os itens não
reagiam ao ponteiro. Estado de ponteiro, foco e media query pedem classe no `theme.css`.

**`flex-wrap` numa casca de duas colunas vira uma tela inteira de menu no celular.** O aside pedia
240px; abaixo disso ele quebrava para uma linha própria e empurrava todo o conteúdo para baixo. A
correção é trocar o eixo numa media query, não encolher o menu.

**Fila: deduplicação por índice, não por `select` antes do `insert`.** Entre um e outro cabe outra
requisição. O índice único parcial de `audit_jobs` cobre só `pendente` e `executando`, para que uma
análise concluída não impeça a próxima.

---

## Convenções

- Código, comentários, mensagens de interface e nomes de teste em **português**.
- Migrações em `supabase/migrations/`, nomeadas `AAAAMMDDHHMMSS_descricao.sql`. Nunca edite uma
  migração já aplicada: escreva outra.
- Testes de unidade em `tests/unit/`, de navegador em `tests/e2e/`. Os dois grupos usam o banco
  `painel_matrix_test`, recriado a cada execução.
- Valores esperados dos testes ficam escritos à mão em `scripts/test-db.ts`, derivados da massa. Se
  uma consulta mudar de comportamento, o teste falha — que é o objetivo.
- `.github/workflows/ci.yml` roda tipos, lint, testes e build a cada push;
  `pos-deploy.yml` falha se o domínio de produção não passar a servir o commit enviado.

---

## O que ficou de fora

- **Microsoft Clarity** — retirado desta rodada a pedido. As tabelas `integrations` e
  `integration_sync_runs` existem para que adicionar um provedor depois seja trabalho aditivo.
- **Portal do cliente** — o modelo de dados e as políticas suportam, mas não há telas nem login
  para clientes finais. A plataforma é interna.
- **Exportação de relatórios** — não implementada.
- **Conector para serviço externo de formulários** — não existe. RD Station, HubSpot e afins
  precisam entregar o envio ao endpoint de formulários do painel. A tela de configuração diz isso em
  vez de prometer integração automática.
- **Service worker** — o painel tem manifesto e ícones para instalação, mas nenhum service worker. Um
  que guarde dados serviria número em cache, e isso mente sobre quando o número foi medido. Se o
  Chrome exigir um para oferecer a instalação, que seja de repasse puro.
- **Recuperação de senha** — não implementada. Usuários são criados pelo seed ou via SQL. É por isso
  que a tela de login **não** tem "esqueci minha senha": link para rota inexistente é um 404
  fantasiado de funcionalidade.
- **Login com o Google, e cadastro pela interface** — não há OAuth. O cartão de login foi adaptado de
  um componente que trazia os dois, e os dois saíram junto com "lembrar de mim" (a sessão tem uma
  duração só). Há teste em `tests/e2e/login.spec.ts` que **falha se algum voltar** sem a
  implementação junto.
- **Mais de uma análise técnica automática por dia** — o limite é do plano Hobby da Vercel (dois
  crons, uma execução diária cada). O código não tem teto: num plano pago, muda-se a expressão do
  cron, não o código.
