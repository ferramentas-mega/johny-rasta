# Definição dos indicadores

Cada indicador é definido antes de existir a consulta que o agrega. A definição está em
`src/server/metrics/definitions.ts`; a agregação, em `queries.ts`, ao lado. Os textos de ajuda que
aparecem nos cartões vêm do mesmo arquivo — o que o usuário lê é o que o SQL implementa.

---

## Regras de atribuição

Duas regras valem para tudo, e explicam quase todas as perguntas de "por que este número não bate
com aquele":

**1. Sessões são atribuídas pela data de INÍCIO.** Eventos pertencem à sessão, não ao próprio dia.
Uma sessão que começa às 23:50 e recebe um clique às 00:10 conta os dois no dia em que começou.
É essa regra que faz o total da tabela por página fechar com o da tabela por botão.

**2. Formulários são atribuídos pela data de RECEBIMENTO.** Por isso a soma da série diária do
gráfico é exatamente igual ao cartão de formulários — há teste automatizado afirmando isso.

Eventos marcados como teste ficam fora de todas as agregações. Aparecem apenas na aba Rastreamento,
para confirmar a instalação.

---

## Os indicadores

| Indicador | Fórmula | O que NÃO entra |
|---|---|---|
| **Visitas / sessões** | Sessões distintas iniciadas no período | — |
| **Visitantes únicos** | `count(distinct visitor_id)` sobre o período inteiro | Não é somável entre períodos |
| **Visualizações de página** | Eventos `page_view` das sessões elegíveis | — |
| **Cliques em CTA** | Todos os `cta_click` | — (inclui abertura de formulário) |
| **Cliques no WhatsApp** | `cta_click` com subtipo `whatsapp` | Não comprova conversa iniciada |
| **Cliques em outros contatos** | `cta_click` com subtipo `phone` ou `email` | WhatsApp e abertura de formulário |
| **Aberturas de formulário** | `cta_click` com subtipo `form_open` | Abrir não é enviar |
| **Formulários recebidos** | Submissões confirmadas pelo backend | Reenvios com a mesma chave de idempotência |
| **Leads registrados** | Contatos distintos criados no período | Dois envios do mesmo contato = um lead |
| **Sessões convertidas (%)** | Sessões distintas com ao menos uma submissão ÷ sessões elegíveis | Nunca passa de 100% |
| **Envios por sessão (%)** | Submissões ÷ sessões | **Pode** passar de 100% |

### As duas taxas não são a mesma conta

Esta é a distinção que o protótipo não conseguia fazer, porque seu modelo admitia no máximo uma
submissão por sessão — as duas taxas davam sempre o mesmo número.

Com uma sessão que envia dois formulários e outras sete que não enviam nenhum:

- **Sessões convertidas** = 1 ÷ 8 = 12,5%
- **Envios por sessão** = 2 ÷ 8 = 25%

Se você dividir a quantidade de formulários pelas sessões, o rótulo correto é "Envios por sessão".
Chamar isso de taxa de conversão superestima o resultado.

### Visitantes únicos não se somam

Os visitantes únicos de 30 dias são **menores** que a soma dos únicos diários, porque a mesma
pessoa voltando em dois dias é uma pessoa. A consulta conta `distinct` sobre a janela inteira,
nunca somando buckets diários. Há teste garantindo isso.

---

## A carteira: uma linha por cliente

A tela de Visão geral agrega **por cliente**, não por site. Três decisões mudam o número e por isso
ficam escritas:

**1. A janela é calculada no fuso de CADA site, dentro do SQL.** Um cliente com um site em São Paulo
e outro em Lisboa tem duas janelas diferentes no mesmo período de 7 dias. Recortar tudo num fuso só
faria a carteira discordar do painel individual — e o requisito é que o geral seja exatamente a soma
dos individuais sob os mesmos filtros.

**2. Visitantes únicos NÃO são somados entre sites.** Somar os únicos de dois sites e chamar o
resultado de "pessoas únicas da carteira" contaria duas vezes quem visitou os dois. A carteira
devolve **sessões**, que somam sem mentir. Os únicos continuam existindo no painel de cada site,
onde a conta é `distinct` sobre a janela inteira.

**3. A taxa da carteira é Σ convertidas ÷ Σ sessões, nunca a média das taxas por cliente.** A média
de porcentagens dá peso igual a um cliente com 10 sessões e a outro com 10 mil. Os totais também são
a soma das linhas exibidas, e não uma segunda consulta — duas consultas independentes podem
divergir; esta não tem como.

### Variação sobre base zero é `null`, não "+∞"

`variacao(atual, anterior)` devolve `null` quando o período anterior é zero. Crescer de 0 para 5 não
é "aumento infinito" nem "+500%": é uma conta que não existe. A tela diz **Sem base comparável**.

### Comparações com pouco volume são marcadas

Abaixo de **30 sessões** no período, a tela rotula a comparação como *Volume baixo para comparar* em
vez de exibir a variação percentual. Com 3 sessões virando 6, "+100%" é ruído apresentado como
tendência.

O número 30 é uma regra de produto, não uma lei estatística — está declarado em
`src/app/(painel)/visao-geral/page.tsx`, num só lugar, e impresso na própria tela.

---

## Resultado comercial e qualidade técnica são separados

O painel nunca junta os dois num indicador só, e nunca afirma que um causou o outro.

Um site lento pode vender bem; um site rápido pode vender mal. Quando os dois sinais aparecem no
mesmo cliente, a tela de Otimizações mostra **os dois, separados, com a evidência de cada um** — e
deixa a conclusão para quem investiga.

As notas técnicas têm documento próprio: [`qualidade-tecnica.md`](qualidade-tecnica.md).

---

## Quando um número "não bate" (e está certo)

**A coluna de sessões da tabela por página soma mais que o total de sessões.**
Correto e esperado: uma sessão que visitou três páginas aparece em três linhas. A tabela responde
"quantas sessões viram esta página", não "como as sessões se dividem entre páginas". A observação
está impressa abaixo da tabela.

**A tabela por botão e a coluna "Cliques em CTA" da tabela por página dão o mesmo total.**
Por construção: contam o mesmo conjunto de eventos. Ambas exibem linha de total justamente para
que isso seja conferível. Se algum dia divergirem, é defeito.

**"Cliques em CTA" é maior que "WhatsApp" + "outros contatos".**
A diferença são as aberturas de formulário, que entram no primeiro e não nos outros dois. O
cabeçalho da coluna e o texto de ajuda do cartão declaram esse escopo.

**Um período sem histórico mostra "Sem base de cálculo", não 0%.**
Zero por cento afirmaria "medimos e ninguém converteu". Sem sessões, não medimos nada — e a
diferença importa. O mesmo vale para a comparação com o período anterior: sem base anterior, a tela
diz "Sem base comparável".

**Um site sem rastreamento instalado mostra "Indisponível", não zero.**
Mesma razão.

**Uma página sem análise técnica mostra "Indisponível", não nota 0.**
Nota 0 afirmaria uma medição péssima. Sem análise, não há medição — e a lista de otimizações ignora
a linha em vez de tratá-la como o pior caso possível.

---

## Fuso horário

Todas as colunas de tempo são `timestamptz` gravadas em UTC. O recorte dos períodos usa o fuso
cadastrado no site:

```sql
date_trunc('day', now() at time zone 'America/Sao_Paulo')
```

Para um site em São Paulo, "hoje" começa às 03:00 UTC. Trocar o fuso do site muda os limites dos
períodos — e é por isso que o fuso faz parte do cadastro, e não uma configuração global.

A distribuição de sessões por hora, na aba Comportamento, também usa o fuso do site: um pico às
20h em São Paulo aparece às 20h.

---

## O que é lead, e o que não é

Lead é uma **submissão de formulário confirmada pelo backend**, deduplicada por e-mail (ou por
telefone, quando não há e-mail) dentro do mesmo site.

Não geram lead:

- clique no WhatsApp — registra intenção de contato; o painel não tem como saber se a conversa
  aconteceu, e não inventa;
- abertura de formulário — é interesse, não envio;
- submissão que falhou ao gravar — não existe.

---

## Funil de qualidade dos leads

Na tela `/leads`, acima da listagem. Quatro etapas, **todas contadas em sessões**.

| Etapa | O que conta |
|---|---|
| Sessões | Visitas registradas no período, sem acessos de teste |
| Interagiram | Sessões que clicaram em algum CTA **ou** enviaram um formulário |
| Enviaram formulário | Sessões com ao menos uma submissão confirmada |
| Trouxeram contato novo | Sessões cujo envio trouxe um contato que o site ainda não conhecia |

### Por que "clicou OU enviou", e não "abriu o formulário"

A montagem óbvia seria usar os indicadores que já existem: sessões → aberturas de formulário →
formulários enviados → leads. Ela está errada, e o erro é de forma, não de número.

"Abriu o formulário" e "enviou o formulário" são conjuntos que **se cruzam sem um conter o outro**:
um formulário visível na própria página é enviado sem nunca disparar o evento de abertura. Um funil
cuja segunda etapa pode ficar menor que a terceira desenha uma perda que não aconteceu — e quem olha
conclui que o formulário está afastando gente.

Por isso a etapa de interesse é a **união** de cliques e envios: ela contém a etapa de envio por
construção. A massa de testes tem um caso dedicado a isso (site Beta, sessão `b3`, que envia sem
clicar em nada), e um teste falha se a definição mudar.

### A largura é proporcional à PRIMEIRA etapa

Não à anterior. Proporcional à anterior, toda etapa que retém metade desenha a mesma queda — e um
funil em que 50%→50%→50% tem o mesmo formato que 90%→90%→90% não informa nada.

### O que fica FORA do funil, e por quê

Quatro números aparecem ao lado, e não como etapas:

- **Contatos distintos** — unidade diferente. Uma etapa conta sessões; um contato pode nascer de duas
  sessões e duas sessões podem virar um contato só. Misturar as unidades numa barra faria a última
  etapa parecer menor por um motivo que não é perda.
- **Com e-mail e telefone** — o único indicador aqui que fala da qualidade do dado em si. É a
  diferença entre os dois números que diz se vale a pena pedir o segundo campo no formulário.
- **Já conhecidos** — envios de quem o site já tinha registrado antes do período. Não é perda, é
  retorno. Está aqui porque explica a diferença entre "enviaram" e "contato novo" sem que ela pareça
  uma falha.
- **Sem sessão** — envios que chegaram sem identificação de visita: bloqueador de analytics,
  consentimento negado, coletor fora do ar. O endpoint aceita o contato mesmo assim, porque perder um
  lead legítimo porque o analytics falhou é o pior resultado possível. Esses envios não cabem num
  funil medido por sessão; omiti-los faria o painel afirmar menos leads do que existem.

### O que o funil NÃO afirma

Que a queda entre duas etapas tem uma causa. Ele conta quantas sessões chegaram a cada ponto. Por que
as outras pararam é outra pergunta, e este painel não a responde — a tela diz isso em texto, embaixo
do gráfico.

### Sem base de cálculo

Zero sessões no período não desenha quatro barras vazias. Barra vazia é lida como "medimos e deu
zero"; o certo é dizer que não há o que comparar. Largura proporcional a zero é uma conta que não
existe.


---

## Inventário de tags e botões

Na aba **Rastreamento** de cada site.

### O que ele pode e não pode afirmar

É construído a partir do que o coletor **recebeu**, e isso tem um limite duro que a própria tela diz:
**um botão que existe na página e nunca foi clicado não aparece aqui.** Afirmar "seu site tem 7
botões" seria inventar um número sobre um conjunto que este painel não enxerga.

O que ele afirma com segurança é o outro lado: de tudo o que **já foi clicado**, o que está bem
marcado, o que está sendo agrupado como automático, e o que parou de aparecer.

### Não é recortado por período

É a diferença central para a tabela "por botão" da aba Desempenho. Aquela responde *o que performou
nesta janela*; esta responde *o que existe e como está marcado*. Um botão bem instalado que não
recebeu clique nos últimos sete dias continua existindo — recortá-lo por período o faria sumir do
inventário e parecer removido do site.

### Os estados

| Estado | Quando | O que fazer |
|---|---|---|
| **Parou de aparecer** | Tinha volume e ficou 14 dias sem clique, num site que continua coletando | Conferir se o botão ainda existe e se o `data-track-id` sobreviveu ao deploy |
| **Sem nome** | Detectado sozinho (wa.me, tel:, mailto:) sem `data-track-id` | Acrescentar `data-track-id` e `data-track-pos` — o clique já conta, falta o nome legível |
| **Sem posição** | Nomeado, mas sem `data-track-pos` | Acrescentar a posição, para separar o mesmo botão em lugares diferentes |
| **Novo** | Primeiro clique há menos de 7 dias | Nada |
| **Medindo** | Nomeado, posicionado e recebendo cliques | Nada |

A ordem da tabela acima **é** a ordem de precedência, e é decisão de produto: um botão quebrado
importa antes de um mal nomeado. A lista também ordena assim — ordenar por volume poria no topo
justamente o que está funcionando.

### Por que "parou de aparecer" tem duas salvaguardas

É o sinal mais útil do inventário (um botão removido num deploy, ou um `data-track-id` perdido numa
refatoração, some sem erro nenhum) e o mais fácil de virar alarme falso. As duas regras são as mesmas
que o painel já aplica a "site sem eventos":

1. **Só afirma sumiço de botão que tinha regularidade** — no mínimo 10 cliques históricos. Um botão
   clicado duas vezes na vida não sumiu: ele nunca teve volume para se afirmar nada.
2. **Só afirma sumiço com o SITE ativo** — se a coleta inteira parou, todos os botões parecem
   sumidos, e a lista apontaria sete problemas onde existe um só, no lugar errado.

### Tag duplicada

O inventário também acusa **coletor instalado duas vezes**: páginas que registraram duas
visualizações da mesma sessão separadas por menos de dois segundos.

Duas instâncias do `t.js` disparam duas visualizações com `event_uid` distintos — a deduplicação por
idempotência não pega, porque do ponto de vista do banco são dois eventos legítimos.

O prejuízo é silencioso e caro: as visualizações dobram, páginas por sessão dobra, e a taxa de
conversão cai pela metade sem nada ter piorado no site. **Ninguém desconfia de um número que só
subiu.** O caso comum é o script no layout do tema *e* num plugin de inserção de código.

Dois segundos como corte: recarregar a página de verdade leva mais que isso, e duas tags disparam
praticamente no mesmo instante. Uma janela maior começaria a acusar navegação legítima de ida e volta.
