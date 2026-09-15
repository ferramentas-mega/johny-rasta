# Relatório de testes

Este documento diz o que foi executado, o que passou, o que **não** foi testado e por quê.
Nada aqui é declarado aprovado sem ter rodado.

Ambiente: Node 22.22, PostgreSQL 16 local, Chromium via Playwright.
Banco de testes: `painel_matrix_test`, recriado do zero a cada execução, isolado do banco de
desenvolvimento.

---

## Como reproduzir

```bash
npm run typecheck     # verificação de tipos
npm run lint          # ESLint
npm test              # vitest — unidade e integração
npm run test:e2e      # Playwright — navegador
npm run build         # build de produção
```

Os testes preparam a própria massa. Não é preciso rodar `db:seed` antes.

---

## Massa determinística

Definida em `scripts/test-db.ts`, com os valores esperados escritos à mão a partir dela. Duas
contas, para que o isolamento possa ser verificado de verdade:

| Conta | Cliente | Site | Papel na suíte |
|---|---|---|---|
| Agência Teste | Cliente Um | `alfa.teste` | Alvo das asserções numéricas |
| Agência Teste | Cliente Dois | `beta.teste` | Prova que os filtros separam sites |
| Agência Teste | Cliente Dois | `novo.teste` | Site sem nenhum evento |
| Agência Teste | Cliente Dois | `escrita.teste` | Alvo das suítes que gravam |
| Agência Rival | Cliente Rival | `rival.teste` | Alvo dos testes de isolamento |

`alfa.teste` em 7 dias produz: 8 sessões, 6 visitantes únicos, 14 visualizações, 8 cliques
(3 WhatsApp + 2 telefone + 2 e-mail + 1 abertura de formulário), 4 formulários de 3 contatos,
3 sessões convertidas.

Uma das sessões envia **dois** formulários. É esse detalhe que torna "sessões convertidas" (37,5%)
diferente de "envios por sessão" (50%) — no protótipo o modelo não admitia isso, e as duas taxas
davam sempre o mesmo número.

As tabelas de qualidade técnica (`monitored_urls`, `lighthouse_results`, `audit_jobs`,
`optimizations`) **não** entram na massa fixa: cada suíte que depende delas limpa e insere o cenário
de que precisa. É deliberado — uma nota fixa na massa compartilhada faria os testes de otimização
dependerem da ordem de execução, que foi exatamente o defeito intermitente já corrigido nas suítes
de escrita.

---

## Testes de unidade e integração (vitest)

Rodam contra o banco de testes, com transações reais e RLS ativa.

### `metricas.spec.ts`

| Verifica | Por quê |
|---|---|
| Totais exatos dos 9 indicadores | Valores fixos: a consulta não pode "acompanhar" uma mudança silenciosa |
| Únicos do período ≠ soma dos diários | v1 e v2 aparecem em dois dias; somar daria 8, o certo é 6 |
| Cliques em CTA = WhatsApp + contatos + aberturas | Os escopos precisam fechar entre si |
| Sessões convertidas ≠ envios por sessão | As duas fórmulas do §9 são contas distintas |
| Taxa de conversão nunca passa de 100% | — |
| Sem sessões, as taxas devolvem `null` | Zero por cento afirmaria "medimos e ninguém converteu" |
| **Soma da série diária de formulários = cartão** | O defeito nº 1 do diagnóstico |
| Soma da série diária de sessões = cartão | — |
| **Tabela por página e por botão dão o mesmo total** | A discrepância 169 × 207 da captura |
| Tabela de origens fecha com os cartões | — |
| Tabela por página soma MAIS sessões que o total | Consequência documentada, não defeito |
| Série cobre todos os dias, inclusive vazios | — |
| Trocar período e site muda os números | Filtro que não filtra é botão decorativo |

### `autorizacao.spec.ts`

| Verifica | Camada |
|---|---|
| Cada conta enxerga só os próprios sites | Serviço |
| Site de outra conta devolve `null` com o id correto em mãos | RLS |
| Leads de outra conta devolvem zero linhas (e o lead existe mesmo) | RLS |
| Sem conta na transação, nada é devolvido | RLS — o padrão é negar |
| Gravar linha carimbada com outra conta é rejeitado | RLS `WITH CHECK` |
| `app_ingest` recebe **permission denied** em `leads` | GRANT |
| `app_ingest` recebe permission denied em `users`, `clients`, `form_submissions`, `accounts`, `integrations` | GRANT |
| `app_forms` lê leads, mas não usuários nem contas | GRANT |
| `app_forms` não altera submissões gravadas | GRANT |
| `app_ingest` não apaga eventos | GRANT |

Acrescentados nesta rodada dois grupos, **e os dois foram verificados desligando a correção**:

- **Escrever no site de outra conta.** As Actions do assistente recebem o `siteId` por campo oculto,
  e a RLS não barrava: a política de `site_features` casa por `account_id`, cujo valor gravado vem de
  `app.current_account_id()` — o de quem escreve. A linha `(conta A, site da conta B, 'visitas')`
  passava. Com a guarda desligada, 5 testes falham; entre eles o caso de controle "no PRÓPRIO site, a
  mesma chamada grava normalmente", que quebra porque a linha intrusa do teste anterior **trancou o
  dono legítimo** via `unique (site_id, feature)`. A negação de serviço entre contas se reproduz
  sozinha na suíte.
- **O cron enxerga a fila.** Confirma que `withoutAccount` continua vendo zero (a RLS não foi
  afrouxada) e que a função `SECURITY DEFINER` devolve a conta certa — e **só** o identificador da
  conta, nunca a linha do job.

---

### `ingestao.spec.ts`

Normalização de caminhos, chave de deduplicação de lead, idempotência por `event_uid`, regra de
sessão de 30 minutos, recusa de `cta_click` sem subtipo, rejeição de carimbo no futuro, eventos de
teste fora das métricas, validação de formulário, reenvio idempotente, dois envios do mesmo contato
gerando um lead só, e **ausência de dado pessoal no evento de analytics da submissão**.

### `conexao.spec.ts`

Inclui a distinção entre as duas causas de `ENOTFOUND`, que pedem ações opostas: host digitado
errado (conferir a digitação) e host da **conexão direta** do Supabase, `db.<ref>.supabase.co`, que
só publica registro AAAA e por isso não resolve num runtime sem IPv6 (trocar pelo pooler). Sem essa
distinção o diagnóstico mandava procurar um erro de digitação que não existia — foi o que aconteceu
em produção.

Decisões que os demais testes não exercitam, porque todos rodam contra um Postgres local — que é
justamente o caso em que elas não têm efeito. Foi assim que o defeito de TLS chegou à produção sem
ser notado: TLS exigido em host remoto e dispensado em local, verificação de certificado quando há
CA, falha FECHADA em string ilegível, classificação das oito causas de erro de conexão, e resolução
da URL pública (incluindo ignorar `APP_URL` sem esquema).

### `build.spec.ts`

O carimbo de build: commit encurtado para sete dígitos, ausência de commit fora da Vercel, distinção
entre `preview` e `production` (uma variável salva num não vale no outro), e descrição sem separador
solto quando não há commit.

### `carteira.spec.ts`

A agregação por cliente: sessões, cliques no WhatsApp e leads batem **site a site** com o painel
individual; a contagem inclui os sites sem coleta, mas distingue "cadastrado" de "coletando de
verdade"; a taxa da carteira é Σ convertidas ÷ Σ sessões (e não a média das taxas por cliente); sem
sessões a taxa é indisponível e não zero; `variacao` devolve `null` sobre base zero em vez de um
crescimento infinito; e a carteira de uma conta não enxerga os clientes da outra.

Duas regras da carteira **não** têm teste próprio e estão listadas em "o que não foi testado": o
cálculo da janela no fuso de cada site (a massa usa um fuso só) e a não-soma de visitantes únicos
entre sites (a carteira simplesmente não expõe esse número).

### `url-publica.spec.ts`

31 casos de URL que o servidor **se recusa a buscar**, escritos contra SSRF e contra queimar a quota:
`localhost`, faixas privadas de IPv4, o endereço de metadados `169.254.169.254`, IPv6 de loopback,
endereços IPv4 mapeados em IPv6, esquemas que não sejam HTTP(S), credenciais na URL e portas
incomuns.

Estes testes acharam **três buracos no meu próprio validador**, e nenhum era óbvio à leitura:
`http://[::1]/` passava porque `URL.hostname` devolve o host **com** os colchetes, e eu comparava
com `::1` sem eles; `http://[::]/` passava pelo mesmo motivo; e o IPv4 mapeado passava porque o Node
normaliza `::ffff:127.0.0.1` para a forma hexadecimal `::ffff:7f00:1`, que não casava com nenhuma
das minhas comparações decimais.

### `pagespeed.spec.ts` e `crux.spec.ts`

O parser do PageSpeed é testado contra **resposta real gravada** (`tests/fixtures/`), não contra um
objeto que eu inventei — um exemplo escrito à mão confirma o que eu imaginei da API, não o que ela
devolve.

Cobrem: as quatro notas na escala 0–1; URL solicitada e final guardadas separadamente; a versão do
Lighthouse registrada, porque ela muda os ids das auditorias; métricas de laboratório lidas como
número e não como texto formatado; **a ausência de INP no laboratório — só TBT**; descarte de
auditorias sem ação possível e das que já passaram; diagnósticos ordenados por economia estimada,
sem nunca inventar uma; `null` preservado como `null` em todos os caminhos (categoria avaliada como
nula, categoria ausente, métrica sem `numericValue`), corpo vazio e `null` não lançando; e a
conversão 0–1 → 0–100 em que **zero real vira zero e ausência continua ausência**.

Dois testes formam um par sobre a armadilha do `runtimeError`: o primeiro mostra que interpretar um
corpo com `runtimeError` **ainda devolve notas nulas** — quer dizer, o parser sozinho não protege —,
e o segundo, que por isso `analisar` precisa recusar **antes** de gravar.

No CrUX: os três indicadores de campo, o p75 aceito como string sem perder o valor (o CLS veio como
`"0.05"` em resposta real), a janela que a API devolveu guardada como tal e **não** confundida com o
período do painel, o escopo carimbado para a tela não confundir página com origem, métrica ausente
como `null` e nunca zero, resposta vazia não lançando nem inventando janela, e período incompleto
não virando data pela metade.

### `fila-auditoria.spec.ts`

Clique repetido devolvendo a **mesma** tarefa em vez de duplicar; celular e computador como tarefas
diferentes, e não duplicata; recusa de URL não cadastrada em `monitored_urls`; recusa de endereço
privado **antes de qualquer consulta**; reivindicação marcando `executando` e contando a tentativa;
o mesmo job pendente não sendo entregue duas vezes; gravação do resultado concluindo a tarefa;
contagem de tentativas até esgotar; cada dispositivo guardando a própria última análise.

E a asserção que mais importa: **a análise anterior continua legível depois de um erro**. É a prova
de que `registrarFalha` não escreve em `lighthouse_results` — uma linha com quatro notas nulas seria
indistinguível de uma medição real.

A retomada de job abandonado há mais de 10 minutos **não** tem teste: exigiria manipular o relógio
ou o `iniciado_em` gravado. Está na lista do que não foi testado.

### `otimizacoes.spec.ts`

Nota baixa numa página monitorada virando item técnico; nota boa **não** entrando; **nota ausente não
entrando — ausência não é nota ruim**; só a análise mais recente contando, para que uma nota velha e
ruim não alerte para sempre; URL prioritária virando pendência de atualização e URL não prioritária
não virando; e a lista de uma conta não mostrando pendência de outra.

Os dois casos em que a lista **não** deve falar têm teste próprio, porque são o tipo de conclusão
que um painel dá de graça e erra: site de pouco tráfego sem eventos recentes **não** vira
"rastreamento quebrado", e a lista **não afirma relação** entre problema técnico e queda de
conversão.

### `recursos.spec.ts`

A derivação do estado de cada recurso e das etapas do assistente, **sem banco** — a parte pura vive
em `src/lib/recursos.ts` justamente para isso.

Recurso não escolhido é "não se aplica" e nunca pendência; escolhido sem verificação aguarda;
verificação vence a espera e não é desfeita por falta de tráfego recente; erro é estado próprio,
distinto de "aguardando"; qualidade sem chave no servidor é pendência de configuração, não erro do
site; formulário sem modo escolhido é pendente, e "sem formulário" deixa de se aplicar.

E as três regras do assistente que mais fáceis seriam de quebrar sem ninguém notar:

| Verifica | Por quê |
|---|---|
| Só PageSpeed escolhido → instalar e verificar **não se aplicam** | O caminho técnico é independente do rastreamento. Exigir instalação ali deixaria a configuração eternamente incompleta |
| Copiar o código **não** conclui a instalação | A etapa 3 só fecha quando algum recurso do coletor aparece verificado, e verificação exige evento recebido |
| Desmarcar um recurso reduz o pendente | O progresso é derivado, não contado. Um contador diria "etapa 5 de 7" para quem voltou e desmarcou tudo |

### `funil.spec.ts`

Funil de qualidade dos leads. O que estes testes protegem não é um número: é o **encaixe das
etapas**. Cada uma tem de estar contida na anterior — um funil cuja segunda etapa pode ficar menor
que a terceira desenha uma perda que não aconteceu.

O caso decisivo está na massa do site Beta: a sessão `b3` **envia sem clicar em nada**. Com a etapa
de interesse definida como "clicou em CTA", ela ficaria de fora e o número seria 1 contra 2 que
enviaram. Em Alfa toda sessão que envia também clica, então nenhum teste sobre Alfa perceberia o
erro. Há também o caso do site sem coleta, que devolve zeros sem inventar proporção.

---

### `limites.spec.ts`

Limites de requisição. Contagem, independência entre chaves, segundos até a janela virar, e o teto
de tamanho de corpo declarado.

O grupo que importa é "acerto zera o contador". O limitador é cobrado a cada **tentativa**, inclusive
as que dão certo — e sem zerar, quem entra onze vezes em cinco minutos leva a mesma trava da
varredura de dicionário. Quem achou o defeito foi a suíte de navegador, que entra pelo `/entrar` em
quase todo teste e travava em `waitForURL` a partir do décimo login da execução. Um dos casos
verifica que zerar uma chave **não** zera as outras: um `delete` sem `where` passaria no teste
anterior e falharia nesse.

Inclui a negativa do banco: os papéis públicos têm `insert` e `update` em `rate_limits`, nunca
`select` — sem isso, o endpoint de coleta de um site poderia contar as requisições de outro.

---

### `periodo.spec.ts`

Leitura dos parâmetros da URL, recorte no fuso do site (o dia de São Paulo começa às 03:00 UTC),
fusos diferentes produzindo janelas diferentes, período anterior de mesma duração, intervalo
personalizado inclusivo nos dois extremos, e série diária em ordem cronológica.

Inclui o guarda contra uma falha que **some sozinha**: a massa ancorava o dia 0 em 12:00 UTC, e a
janela é recortada no fuso do site. Entre 00:00 e 03:00 UTC o dia 0 caía num dia futuro e quatro
testes numéricos quebravam; nas outras 21 horas, passavam. Comparar contagens não serviria de
guarda — passaria com o defeito de volta. A asserção é sobre a borda: o evento mais recente da massa
tem de ser anterior ao fim da janela. Verificado restaurando a âncora antiga, que o faz falhar.

---

## Testes de navegador (Playwright)

### `fluxo-completo.spec.ts` — o fluxo do §12

Um teste só, do começo ao fim, com persistência real:

1. entrar no painel;
2. cadastrar um cliente;
3. confirmar que ele aparece no seletor do cadastro de sites;
4. cadastrar o site e capturar o identificador gerado;
5. confirmar que o site **não** aparece como coletando;
6. abrir a instalação e ver o snippet com o identificador certo;
7. abrir a página de teste, que carrega o coletor de verdade;
8. clicar no WhatsApp e confirmar que o evento sai;
9. enviar o formulário e receber confirmação;
10. ver o lead na tela de Leads;
11. conferir no dashboard: 1 sessão, 1 clique no WhatsApp, 1 formulário, estado "Coletando".

Mais dois testes de isolamento: a URL de um site de outra conta responde **404**, e nenhum dado da
conta rival aparece em nenhuma tela.

### `navegacao.spec.ts`

Item ativo do menu correspondendo à tela em todas as seções (exatamente um `aria-current` por vez),
abas do site com o menu seguindo em Sites, troca de período mudando os números, troca de site
atualizando os módulos, recarregar e abrir rota direta preservando o estado, voltar e avançar do
navegador, cartão de formulários levando aos leads daquele site, **renomear um site refletindo em
todas as telas**, e console do navegador sem erros em todas as rotas.

### `coerencia.spec.ts`

O que os testes de unidade provam nas consultas, aqui é conferido **na tela renderizada**: os totais
das duas tabelas, o total de formulários, a soma declarada da série, os dois eixos do gráfico
escalando de forma independente, as duas taxas mostrando valores diferentes, os cabeçalhos
declarando escopo, e um site sem coleta mostrando estado explícito em vez de zeros.

### `formularios.spec.ts`

Envio válido gravando e aparecendo no painel; envio sem contato recusado pelo servidor com erro no
campo; **falha do servidor mostrando erro e não uma confirmação falsa**; endpoint de coleta
recusando site inexistente e evento malformado; reenvio do mesmo evento reconhecido como duplicado.

### `carteira.spec.ts`

As quatro telas desta rodada, na tela renderizada: a carteira lista clientes e o total é **a soma das
linhas exibidas**; a busca filtra, fica na URL e sobrevive a voltar e avançar do navegador; abrir um
cliente mostra os sites dele **e só os dele**; conversão sem base aparece como "Sem base", nunca como
0%; a aba de Qualidade técnica abre e **declara o que cada número é** (laboratório ou campo); sem
análise a tela diz que não há, em vez de mostrar nota zerada; URL fora do domínio do site é recusada;
endereço privado é recusado **antes de qualquer chamada externa**; as Otimizações filtram por tipo,
pela URL e pelo clique; e nenhuma das telas novas registra erro no console.

### `onboarding.spec.ts`

Os sete casos de aceitação do fluxo de configuração, contra o banco e o navegador de verdade:

1. **Criar o cliente dentro do assistente não perde os dados do site** — o nome digitado continua no
   campo depois de criar o cliente, e o cliente novo já aparece selecionado.
2. **Domínio duplicado é explicado**, com o site existente nomeado, e nada é criado.
3. **Só PageSpeed**: as etapas de instalação e verificação aparecem como "não se aplica" e o caminho
   fecha sem instalar rastreamento.
4. **Configuração incompleta é salva e retomada** na primeira etapa pendente — e a instrução mostrada
   é a da plataforma escolhida, não as cinco versões.
5. **O snippet traz o identificador do site certo** (dois sites, dois identificadores), e **copiar o
   código não conclui a instalação**: a etapa continua pendente depois do "Copiado".
6. **Visita e clique de diagnóstico verificam a etapa** — incluindo a conferência ANTES de qualquer
   gesto, que não inventa sucesso, e o token sobrevivendo ao recarregamento.
7. **A configuração de outro cliente responde 404** pela URL.

### `login.spec.ts`

O caminho feliz do login já é exercido por cinco suítes, que entram por `/entrar`. Aqui ficam as
partes que ninguém mais toca: o botão de revelar alternando a senha **sem perder o que foi digitado**
(recriar o input em vez de trocar o `type` limparia o campo); o véu do fundo sendo `aria-hidden` e
não interceptando ponteiro; credencial errada mostrando o erro e não entrando; e a asserção de que o
cartão **não oferece caminho que não existe** — se "esqueci minha senha", "entrar com o Google" ou
"criar conta" voltarem sem a implementação junto, este teste falha.

### `seguranca.spec.ts`

Cabeçalhos de segurança medidos **no navegador**, não lidos no `middleware.ts`: prova que eles
chegam na resposta e que a CSP não recusa nada do que o painel precisa.

O caso da política se declara **pulado** fora do modo de produção, em vez de passar sem ter medido
nada. A razão está na medição: `next dev` compila com `eval`, e a mesma política acusa **4.536
violações** ali contra **zero recusas** no `next start`. Um caso que passasse em ambos não estaria
verificando a política — estaria verificando o ambiente.

---

### `responsivo.spec.ts` (Pixel 5)

Nenhuma rolagem horizontal em nenhuma tela, tabelas largas rolando dentro do próprio contêiner,
navegação por teclado, foco sempre visível, `prefers-reduced-motion` desligando os efeitos por
padrão, e a preferência de efeitos persistindo após recarregar.

Inclui dois casos da instalação como aplicativo e da faixa de navegação: o `/manifest.webmanifest` é
servido de verdade (status 200, `display: standalone`, `start_url` na visão geral, ícones de 192, 512
e um `maskable`, **todos existindo e devolvendo PNG**), e o `<link rel=manifest>` aponta para ele —
sem esse link nada acima é procurado pelo navegador. A faixa do celular precisa ocupar menos de 15%
da altura da tela, ser `sticky`, e manter os seis itens e o "Sair" alcançáveis.

Inclui também a chuva da tela de login: ela existe mas **não anima** para quem pede menos movimento, e
**não intercepta o login** — a prova aqui não é de estilo, é entrar de verdade com ela na tela. Um
canvas em tela cheia por cima do formulário seria um jeito silencioso de tornar o login inutilizável,
e nenhuma asserção sobre CSS pegaria isso.

---

## Defeitos encontrados durante o desenvolvimento

Os testes não foram escritos depois para confirmar o que já funcionava. Estes defeitos apareceram
por causa deles:

| Defeito | Como apareceu |
|---|---|
| `revalidatePath` chamado durante o render de uma página | Fluxo do §12 quebrou ao abrir a aba de Rastreamento |
| Snippet marcado como visto **depois** da leitura, exibindo o estado anterior | O mesmo teste, no passo seguinte |
| Formulário de edição não reabria ao trocar de alvo (componente cliente sobrevive à navegação) | Teste de renomear site |
| Consultas simultâneas na mesma conexão (`Promise.all` dentro de transação) | Aviso do driver `pg` durante uma captura de tela |
| `ON CONFLICT DO UPDATE` exigindo privilégio que os papéis públicos não têm | Primeiro POST real em `/api/collect` |
| Tela de desempenho estourando 8px na largura do celular | Suíte responsiva |
| Suítes que gravam poluindo o site medido por outras | Teste de período falhando conforme a ordem |
| Expectativa de lista de sites desatualizada ao acrescentar o site de escrita à massa | Execução de `npm test` antes do deploy |
| Conexão sem TLS, que um banco gerenciado recusa | Primeiro login em produção |
| Endpoint de diagnóstico público devolvendo papel, contagem de tabelas e nomes de variáveis | Revisão de código |
| Diagnóstico com TLS próprio, que poderia reportar sucesso onde a aplicação falha | Revisão de código |
| `error.tsx` dentro de (painel) não captura erros do layout do próprio segmento | Revisão de código |
| Pool de uma conexão em serverless, com três `withAccount` concorrentes por render | Revisão de código |
| `tlsPara` falhando ABERTO em string de conexão ilegível | Revisão de código |
| `APP_URL` sem esquema virando caminho relativo no site do cliente | Revisão de código |
| Massa ancorada em UTC e janela recortada no fuso do site: falha diária das 00:00 às 03:00 UTC | Suíte rodada depois da virada da data |
| Três buracos no validador de URL: `[::1]`, `[::]` e IPv4 mapeado em IPv6 passavam | `url-publica.spec.ts`, escrito contra o meu próprio código |
| Cache do `fetch` do Next.js repetindo indefinidamente a primeira resposta com falha do PageSpeed | Primeira análise real: falhava pelo app e respondia 200 via `curl` |
| HTTP 200 com `lighthouseResult.runtimeError` interpretado como sucesso | Revisão do parser depois de ver o corpo real |
| Botão "Executar agora" aparecendo só no retorno `ok`, sumindo após um clique duplo | Uso manual da tela de Qualidade |
| `getByRole('alert')` casando o anunciador de rotas vazio do Next, além do erro real | Suíte de navegador, violação de modo estrito |
| `ctx.font` com `var(--fonte-mono)`: fonte inválida ignorada em silêncio, chuva presa em 10px | Conferência visual depois de aumentar o tamanho e nada mudar |
| Canvas transparente "apagado" com `source-over`, acumulando preto opaco em vez de apagar rastro | Captura de tela: a chuva virou parede estática de dígitos |
| Componente cliente importando um módulo `server-only`, quebrando o build | Primeira compilação do assistente |
| Recarregar a etapa de verificação descartava o token do diagnóstico, junto com os eventos recém-gerados | Teste de aceitação do diagnóstico |
| Barra lateral virando uma tela inteira de menu acima do conteúdo no celular | Captura de tela enviada pelo usuário |
| Itens do menu sem realce ao passar o mouse, porque o estilo era inline e `:hover` não existe ali | Uso da interface |
| **Cron enfileirando todo dia e ninguém drenando a fila:** a Vercel dispara crons por GET, e `/api/auditorias/processar` exportava só POST — o comentário do arquivo afirmava que o cron o chamava | Conferência dos endpoints ao escrever esta documentação |

Três erros de contagem manual nos valores esperados da massa também apareceram — nesses casos o
código estava certo e a expectativa estava errada. Foram corrigidas as expectativas.

---

## Defeitos de documentação

Uma revisão posterior, pedida depois que a produção passou a responder 404, conferiu GitHub, Vercel
e os documentos. **Nenhum defeito novo de código** apareceu: um clone limpo, com `npm ci` e
`npm run build` **sem nenhuma variável de ambiente**, compila e gera todas as rotas. O 404 é da
configuração do deploy, não do projeto.

Os documentos, porém, tinham seis erros — três deles descrevendo justamente as armadilhas em que
este deploy caiu:

| Onde | Defeito |
|---|---|
| `.env.example` e `docs/deploy-supabase.md` | Exemplos de connection string do Supabase com porta `5432` e **sem** o sufixo `.PROJECT_REF` no papel: as duas causas de `ETIMEDOUT` e de `Tenant or user not found`. Contradiziam o `deploy-vercel.md`, que estava certo |
| `docs/deploy-vercel.md` | Nada sobre Preview × Production, escopo de variáveis por ambiente, nem **Promote to Production** |
| `docs/deploy-vercel.md` | Sugeria renomear a branch para `main` sem avisar que o *Production Branch* da Vercel não acompanha o rename, e a produção congela em silêncio |
| `docs/deploy-vercel.md` | Apresentava as quatro variáveis como obrigatórias; o painel sobe com duas |
| `README.md` | Afirmava que o pool serverless abre **uma** conexão por instância; o código faz `max: serverless ? 3 : 10` |
| `README.md` | A lista de documentação complementar não incluía `deploy-vercel.md` |
| `deploy-vercel.md`, `pos-deploy.yml`, `producao.ts` | A instrução de promover o deployment apontava para **o menu errado** (`⋯` da linha da lista, quando o botão fica no `⋯` do canto superior direito **dentro** do deployment) e para **a tela errada** (`Settings › Domains › Edit`, quando é `Settings › Environments › Production › Branch Tracking › Auto-assign Custom Production Domains`). Conferido na documentação da Vercel |
| `deploy-vercel.md` | O passo do domínio próprio mandava dar **Redeploy**, que não publica num projeto com auto-assign desligado |
| `.env.example`, `deploy-supabase.md`, `deploy-vercel.md` | Host do pooler (`aws-1-us-east-1…`) apresentado como valor **verificado** deste projeto. A medição de DNS provava que ele existe e tem IPv4 — não que é o cluster deste projeto. A documentação do Supabase diz que o número é um índice de cluster e **não se deduz da região**. Trocado por marcador explícito — e o valor real, copiado depois do diálogo Connect, é **`aws-0`**: a suposição estava errada |

Uma suposição plausível é o pior tipo de erro de documentação: `aws-1` existia, resolvia, tinha
IPv4, e mesmo assim era o host errado. Teria produzido `Tenant or user not found`, que parece falha
de senha — mandando corrigir o que não estava quebrado. Foi desfeita antes de chegar ao usuário.

Documento que descreve o sistema errado erra igual a código errado — só demora mais para aparecer.
E instrução que aponta para o botão errado é pior: o leitor faz o que está escrito, não funciona, e
a conclusão natural é que o diagnóstico estava errado. Foi o que aconteceu — o diagnóstico estava
certo desde o começo, e o caminho do clique é que não.

---

## O que NÃO foi testado

**Conexão TCP da aplicação com o Supabase.** Este é o único item do Supabase que segue sem teste, e
convém separá-lo do que **foi** verificado.

Conferido, por consulta SQL real através da API de gerenciamento (que passa por HTTPS):

| Item | Resultado |
|---|---|
| Tabelas | 11 |
| Políticas de RLS | 21 |
| RLS **forçada** | nas 11 tabelas |
| Papéis `app_user`, `app_ingest`, `app_forms` | existem, validade **infinita** |
| Privilégios de `app_ingest` | só `events, pages, sessions, sites` — **não** enxerga leads |
| Usuários do painel | 2 |
| Projeto | `ACTIVE_HEALTHY`, `us-east-1`, PostgreSQL 17 |

Não conferido: **a aplicação abrindo uma conexão até lá.** O container onde o projeto foi construído
tem egress apenas HTTPS — TCP em 5432 e 6543 é bloqueado. Também foi medido por DNS que o host da
conexão direta (`db.<ref>.supabase.co`) publica **somente** registro AAAA, e os hosts do pooler
(`aws-0`/`aws-1-us-east-1.pooler.supabase.com`) somente registro A. Isso explica o `ENOTFOUND` visto
em produção e é o motivo de o pooler ser obrigatório na Vercel. **O que a medição não diz** é qual
dos dois clusters é o deste projeto: isso só o diálogo *Connect* do painel responde.

Todo o desenvolvimento e os testes rodaram contra o PostgreSQL local, com schema idêntico.
**A conexão em si, confirme na primeira execução fora deste ambiente.**

**As APIs do Google, em rede.** Os parsers do PageSpeed e do CrUX são testados contra resposta real
gravada, e a fila é testada contra o banco. **A chamada HTTP em si não tem teste automatizado** — ela
depende de chave, de quota e de rede, e um teste que sai para a internet falha por motivos que não
são defeito do código.

Foi verificado **à mão, com chamada real**, e o resultado está registrado aqui porque medição sem
execução não vale: PageSpeed respondendo em 11 s e 12 s (879 KB de corpo, Lighthouse 13.4.1) e CrUX
devolvendo LCP 3105 ms, INP 205 ms e CLS 0,05 numa janela de 17/08 a 13/09. Na mesma página, o
laboratório deu LCP de 12,0 s contra 3,2 s do campo — a divergência que motiva mostrar os dois lado a
lado, em vez de escolher um.

**A retomada de job abandonado.** O caminho em que um processo morre no meio e o job volta para a
fila passados 10 minutos exigiria manipular o relógio ou o `iniciado_em` gravado. O código está
escrito e lido, mas não exercitado.

**Duas regras da carteira.** O cálculo da janela no fuso de **cada** site não tem teste porque a
massa usa um fuso só — provar isso exigiria uma massa com sites em fusos diferentes. E a não-soma de
visitantes únicos entre sites não tem teste porque a carteira simplesmente **não expõe** esse número:
a garantia é de ausência, não de cálculo.

**O cron da Vercel disparando de verdade.** Os três caminhos dos endpoints `/api/auditorias/*` foram
exercitados **por chamada direta contra o build de produção**, e o resultado está aqui porque
verificação sem execução não vale:

| Chamada | Resposta |
|---|---|
| `GET /agendar` sem cabeçalho | 401 |
| `GET /agendar` com segredo errado | 401 |
| `GET /agendar` com o segredo | 503 "integração não configurada" (sem `PAGESPEED_API_KEY` local) |
| `GET /processar` sem cabeçalho, e com segredo errado | 401 nos dois |
| `GET /processar` com o segredo | 503, mesma razão |
| `POST /processar` sem sessão e sem segredo | 401 |

O **agendamento em si** — a Vercel chamando nos horários declarados — só se confirma em produção.

**O convite de instalação do Chrome.** O manifesto e os ícones são servidos, e há teste provando
isso. O que **não** foi observado é o Chrome de verdade oferecendo a instalação: não consegui
conferir os critérios atuais de instalabilidade a partir deste ambiente — o proxy de rede bloqueia
`developer.chrome.com` e o MDN. Se o convite não aparecer, o próximo passo é um service worker de
repasse puro, nunca um que responda do cache.

**Conector de formulário externo.** Não existe, então não há o que testar. A tela diz isso em vez de
prometer integração automática.

**Integrações externas de terceiros.** Nenhuma (Clarity, Analytics, CRM) foi implementada, então não
há o que testar.

**Carga e concorrência.** Não foram feitos testes de volume. A massa de desenvolvimento tem ~11 mil
sessões e ~20 mil eventos, e as consultas respondem rápido com os índices existentes, mas isso não
é um teste de carga.

**Navegadores além do Chromium.** A suíte roda só no Chromium disponível no ambiente.

**Recuperação de senha e criação de usuários pela interface.** Não implementadas; usuários são
criados por SQL ou pelo seed.

---

## Resultado da última execução

Executada em 15/09/2026, lida linha a linha.

- `npm run typecheck` — sem erros
- `npm run lint` — sem avisos
- `npm test` — **227 testes**, todos passando (15 arquivos, 9,0 s)

  | Arquivo | Testes | | Arquivo | Testes |
  |---|---|---|---|---|
  | `conexao` | 42 | | `periodo` | 13 |
  | `url-publica` | 31 | | `limites` | 11 |
  | `ingestao` | 20 | | `fila-auditoria` | 10 |
  | `autorizacao` | 18 | | `otimizacoes` | 9 |
  | `pagespeed` | 17 | | `carteira` · `crux` | 8 · 8 |
  | `metricas` · `recursos` | 14 · 14 | | `build` · `funil` | 6 · 6 |

  Contagem tirada do relatório JSON do vitest, não da leitura da tela — numa rodada anterior eu
  reportei 79 onde eram 103.

- `npm run build` — build de produção concluído
- `npm run test:e2e:prod` — **63 testes** (52 desktop + 11 celular), todos passando (2,3 min),
  **contra `next start`** e com a CSP em modo bloqueio

### A suíte de navegador agora roda contra o pacote publicado

Mudança desta rodada, e não é detalhe de configuração. Rodar contra `next dev` tem duas
consequências que só apareceram quando eu medi:

1. **A CSP não pode ser avaliada ali.** O modo de desenvolvimento compila com `eval`: 4.536
   violações contra zero recusas no `next start`. Medir no lugar errado teria me levado a acrescentar
   `'unsafe-eval'` à política de produção.
2. **O que se testa passa a ser o que vai ao ar.** O `next dev` compila sob demanda e serve código
   diferente do publicado.

O CI foi reordenado junto: `build` antes de `Navegador`, e a suíte roda com `E2E_PROD=1`.

### O CI estava vermelho havia cinco commits, por minha causa

`playwright.config.ts` fixava `executablePath: '/opt/pw-browsers/chromium'` — o caminho do contêiner
de desenvolvimento, que não existe no runner do GitHub. As 57 provas de navegador falhavam com
"executable doesn't exist", sempre a mesma linha, nunca um defeito de produto. E o passo de `build`
vinha **depois**, então era pulado: o CI parou de responder a pergunta para a qual foi criado, e eu
continuei empurrando commits lendo verde na minha máquina.

Hoje o caminho só é usado se o arquivo existir.

### Defeitos que a própria suíte encontrou nesta rodada

- **O limite de login contava acertos.** A partir do décimo login de uma execução, a suíte travava em
  `waitForURL`: o limitador recusava o login correto. Um limitador que bloqueia quem sabe a senha não
  está contendo força bruta.
- **`column s.lead_id does not exist`.** A consulta do funil referenciava uma coluna que a CTE
  compartilhada de submissões não selecionava. Apareceu como a tela de leads quebrada no log do
  servidor, durante a execução.
- **Duas fontes de verdade para o mesmo número.** `navegacao.spec.ts` trazia `toBe(2)` escrito à mão
  para as sessões de Beta; ao entrar a sessão `b3` na massa, o teste quebrou. Hoje lê o valor de
  `scripts/test-db.ts`.

### Verificado além da suíte, por execução real

- **A fila do cron**, com consulta direta ao banco: superusuário via 1 job pendente, `app_user` sem
  conta via 0, `app_user` com conta via 1. É a medição que provou que os dois endpoints agendados
  eram um no-op.
- **A guarda de escrita entre contas**, desligando-a e conferindo que 5 testes falham — inclusive o
  caso de controle, que quebra pela negação de serviço se reproduzindo ao vivo.
- **Os seis caminhos de autorização** dos endpoints de auditoria.
- **PageSpeed e CrUX** contra as APIs de verdade.

### Notas de honestidade, mantidas

Numa rodada anterior reportei "55 passando" apoiado numa execução que ficou em segundo plano e cuja
saída eu não li; quando rodei de fato, um teste estava quebrado. Em outra, duas conferências visuais
minhas olharam para um build antigo, porque um `npm start` anterior ainda ocupava a porta e o novo
falhava num log que eu não tinha aberto.

Nesta rodada aconteceu uma terceira variação do mesmo erro: rodei a suíte inteira com o pipe em
`tail -60`, o que descartou a saída de que eu precisava **e** mascarou o código de saída. Reportei 11
falhas sem conseguir explicar nenhuma. As execuções acima foram gravadas em arquivo, sem pipe, e
lidas do começo.
