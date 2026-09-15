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
