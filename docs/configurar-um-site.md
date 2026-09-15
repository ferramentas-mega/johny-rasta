# Cadastrar e configurar um site

Do cadastro à primeira medição verificada. O assistente fica em
**Sites › _um site_ › Configuração**, e também é onde o cadastro de um site novo desemboca.

---

## Os dois caminhos são independentes

Esta é a confusão mais cara desta parte do produto, e por isso ela aparece separada já na tela:

| | Medir visitas e contatos | Analisar qualidade técnica |
|---|---|---|
| Precisa de | O script de coleta instalado no site | Só uma URL pública |
| Responde | Quantas pessoas vieram, o que clicaram, quantos leads | Quanto a página custa para carregar |
| Verificação | Um gesto real, conferido no servidor | Uma análise concluída com nota |

**Dá para analisar a qualidade técnica de um site onde ninguém instalou nada.** E o PageSpeed nunca
é fonte de visitas ou de leads — nota de desempenho não é audiência. Quem escolhe só a análise
técnica vê as etapas de instalação e verificação como **Não se aplica**, e a configuração fecha.

---

## As sete etapas

O assistente salva a cada etapa submetida. **Não existe rascunho em memória**: sair no meio e voltar
amanhã cai na primeira etapa pendente, e voltar uma etapa não perde nada.

### 1. Identificar o site

Cliente, nome, domínio, URL principal, plataforma e fuso horário.

- O **domínio** é a autoridade sobre qual origem pode enviar evento. A **URL principal** é o endereço
  que o diagnóstico abre e a primeira candidata à análise técnica.
- O **fuso** define onde começa o dia nos relatórios. Para São Paulo, "hoje" começa às 03:00 UTC.
- A **plataforma** decide quais instruções você verá na etapa 3.
- Dá para **criar o cliente aqui**, sem sair da tela e sem perder o que já foi digitado.

**Domínio duplicado é recusado e explicado**, com link para o site existente. Dois cadastros do mesmo
domínio partem a medição em dois lugares, e nenhum dos dois mostra o total.

### 2. Escolher o que acompanhar

Cinco opções, cada uma dizendo o que mede, o que exige e como será verificada:

| Recurso | Mede |
|---|---|
| Visitas e páginas acessadas | Sessões, visitantes únicos, quais páginas foram abertas |
| Cliques no WhatsApp | Intenção de contato — **não** conversa iniciada |
| Cliques em telefone e e-mail | Links `tel:` e `mailto:` |
| Formulários e leads | Envios confirmados pelo servidor, e os leads deduplicados |
| Qualidade técnica | Notas do Lighthouse por URL e dispositivo, mais o campo do CrUX |

**Nada é obrigatório.** Um site institucional sem formulário não deve ser empurrado a configurar
formulário para "completar" a configuração.

### 3. Instalar o rastreamento

Só as instruções da plataforma escolhida, e a explicação **antes** do bloco de código.

| Plataforma | Onde vai | Armadilha |
|---|---|---|
| **WordPress** | Cabeçalho do site inteiro, por plugin de inserção ou `header.php` | Cache do site ou do plugin de cache serve o HTML antigo. Editar o `header.php` de um tema que recebe atualização perde a alteração na próxima versão |
| **React / Next.js** | `app/layout.tsx` (App Router) ou `pages/_document.tsx` | Numa página só, cobre só aquela rota. Navegação entre rotas não recarrega — o coletor já cobre isso |
| **HTML ou outra** | Antes de `</head>`, em **todas** as páginas | Página sem o script não é medida |

**Copiar confirma a cópia, e nada mais.** A instalação só é dada como feita na etapa 4.

Se o site já recebeu eventos, a tela diz isso e pede para **não instalar de novo**: duas tags em
lugares diferentes viram manutenção esquecida.

### 4. Verificar visitas e cliques

1. Abra o link de diagnóstico — ele abre o seu site com o teste ligado.
2. Navegue por mais uma página.
3. Clique no botão que quer medir.
4. Volte e clique em **Conferir o que chegou**.

A tela lista evento, página, botão, horário de recebimento e o resultado da validação.

**O que a verificação não faz:**

- não confirma por tempo decorrido;
- não confirma porque o script aparece no HTML (um script bloqueado por CSP, consentimento ou
  bloqueador está lá e não mede nada);
- não confunde o seu teste com tráfego de terceiros.

O link carrega um **token de diagnóstico**. Só os eventos que voltam com esse token contam — um
visitante que clicou no WhatsApp no mesmo minuto não verifica a instalação de ninguém. O token fica
valendo enquanto a aba estiver aberta, então dá para navegar pelo site inteiro sem repetir o link, e
sobrevive ao recarregamento da etapa porque está gravado no banco.

**Tudo o que chega por esse link nasce marcado como teste no servidor** e fica fora dos relatórios
comerciais — inclusive um envio de formulário feito durante o diagnóstico.

Quando nada chega, a tela lista hipóteses a conferir, sem afirmar a causa: script publicado, cache
do site ou da CDN, domínio cadastrado, bloqueador ou consentimento.

### 5. Configurar formulários

Três respostas possíveis, e elas mudam o que a etapa exige:

- **Formulário integrado ao próprio site** — aponte o `action` para o endpoint do painel. O servidor
  valida, grava a submissão, cria ou associa o lead e só então confirma. Falha de gravação devolve
  erro, nunca uma confirmação sem lead correspondente.
- **Plugin ou serviço externo** — **não há conector implementado**. O envio precisa chegar ao
  endpoint de formulários, por webhook ou por um passo intermediário que faça esse POST. Enquanto
  isso não existir, o clique que abre o formulário continua sendo medido, e o painel não o conta como
  envio nem como lead.
- **Sem formulário** — a etapa passa a **Não se aplica**.

Quatro coisas diferentes, que o painel nunca trata como uma só:

| | O que é |
|---|---|
| Clique para abrir o formulário | Interesse |
| Tentativa de envio | O navegador disparou o submit |
| Submissão recebida | O servidor validou e gravou |
| Lead registrado | O contato foi criado ou associado |

Só a terceira confirma recebimento, e só a quarta vira lead. O evento de submit do navegador não
prova que nada chegou.

A **chave de idempotência** é gerada uma vez por formulário preenchido, não por tentativa de envio:
é ela que faz o reenvio da mesma submissão não criar um segundo lead.

### 6. Configurar a análise técnica

Cadastrar as URLs (Home, landings prioritárias), escolher celular ou computador e executar a
primeira análise. O detalhe de chave, quota e fila está em
[`qualidade-tecnica.md`](qualidade-tecnica.md).

**Falha ou ausência de auditoria não bloqueia** as etapas de visitas e contatos.

### 7. Resumo

Um item por recurso, com o estado, a data da verificação e o erro quando houver. Recurso não
escolhido aparece como **Não se aplica**.

A tela **não diz "tudo pronto"** enquanto houver recurso selecionado sem verificação.

---

## Como ler os estados

### Estado de um recurso

| Estado | Significa |
|---|---|
| **Não se aplica** | Não foi selecionado. Não é pendência |
| **Configuração pendente** | Falta uma decisão ou um pré-requisito (a chave do PageSpeed, uma URL, o modo do formulário) |
| **Aguardando verificação** | Selecionado, esperando o gesto que comprove |
| **Verificado** | Funcionou durante um teste, com evidência e data |
| **Erro identificado** | A última tentativa falhou, e o motivo está à vista |

### Duas coisas que se parecem e não são a mesma

- **Instalação verificada** — funcionou durante o teste. É um fato do passado, e **não expira**.
- **Último evento recebido** — atividade recente.

Um site de pouco tráfego pode passar dias sem visita. Isso **não** o torna quebrado, e o painel não
diz que está.

### Nos indicadores

| | Quando aparece |
|---|---|
| **Zero** | A fonte existe e não houve ocorrência no período |
| **Indisponível** | Não há fonte válida para calcular |
| **Pendente** | Falta configuração ou verificação |
| **Erro** | Uma operação falhou |

Indicador indisponível **nunca** é preenchido com zero.

---

## Onde a configuração aparece depois

Verificar um recurso atualiza, na mesma hora:

- a coluna **Configuração** na lista de sites, com a ação **Continuar configuração** enquanto houver
  pendência;
- a coluna **Configuração** no painel do cliente;
- o cartão **Configuração pendente** e a coluna correspondente na visão geral.

---

## Instalar o painel como aplicativo

O painel traz um manifesto (`/manifest.webmanifest`) com ícones de 192 e 512 px, uma versão
`maskable` para o recorte do Android, e cor de tema combinando com a interface. No Chrome, use
**Instalar** na barra de endereço (computador) ou **Adicionar à tela inicial** (celular). Ele abre em
janela própria, começando na Visão geral.

**Não há service worker, e não deve haver um que guarde dados.** Um painel que serve número em cache
mente sobre quando aquele número foi medido.

> **Limitação registrada:** não foi possível conferir os critérios atuais de instalabilidade do
> Chrome a partir do ambiente de desenvolvimento (o proxy bloqueia `developer.chrome.com` e o MDN). O
> manifesto e os ícones foram implementados e são servidos — há teste de navegador provando isso —
> mas **o convite de instalação em si não foi observado num Chrome real**. Se ele não aparecer, o
> próximo passo é um service worker que apenas repassa a requisição, nunca um que responda do cache.

---

## Rodar os testes desta parte

```bash
npm test -- recursos          # derivação de estados e etapas, sem banco
npm run test:e2e -- onboarding # os sete casos de aceitação do fluxo
npm run test:e2e -- responsivo # celular, teclado, e o manifesto
```

A suíte completa e o que ela cobre estão em [`relatorio-testes.md`](relatorio-testes.md).

---

## Variáveis e serviços externos

Para **visitas, cliques e formulários**, nada além do que o painel já precisa: `DATABASE_URL`,
`DATABASE_URL_INGEST`, `DATABASE_URL_FORMS` e `SESSION_SECRET`.

Para a **qualidade técnica**, `PAGESPEED_API_KEY` (com as duas APIs do Google habilitadas) e
`CRON_SECRET`. Sem elas, a análise fica desligada e a tela diz isso — nunca exibe nota inventada. Os
nomes e o passo a passo estão em [`deploy-vercel.md`](deploy-vercel.md) e no `.env.example`.
