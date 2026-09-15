# Qualidade técnica: PageSpeed Insights e CrUX

Esta parte do painel responde uma pergunta diferente da do resto: não "quanto este site vendeu",
mas "quanto ele custa para carregar". São dois assuntos, e o painel os mantém separados de
propósito — um site rápido pode vender mal, e um site lento pode vender bem.

---

## Laboratório e campo não são a mesma medição

O painel consulta **duas APIs do Google**, e elas respondem coisas diferentes sobre a mesma página.

| | PageSpeed Insights (Lighthouse) | Chrome UX Report (CrUX) |
|---|---|---|
| O que é | Uma execução controlada, agora | O que aconteceu com usuários reais |
| Aparelho | Um perfil simulado | Os aparelhos e conexões de quem visitou |
| Janela | O instante da análise | 28 dias corridos |
| Serve para | Achar a causa (o diagnóstico lista o que pesa) | Saber se o problema atinge gente |
| Não serve para | Afirmar como está para o público | Dizer o que corrigir |

Medido neste projeto, na mesma página e no mesmo dia: **LCP de 12,0 s no laboratório e 3,2 s no
campo.** Nenhum dos dois está errado — a execução controlada usa uma conexão propositalmente ruim, e
o campo é a mistura real de aparelhos. Usar só um dos dois leva a conclusões opostas.

Por isso a tela mostra os dois lado a lado, sempre rotulados. **Nunca** mistura os números numa nota
só.

### INP existe no campo, e não no laboratório

O Lighthouse não mede INP: ele mede **TBT** (tempo total de bloqueio), que é um indicador
correlato, não o mesmo número. No exemplo acima, o campo mostrava INP de 220 ms — um dado que a
execução controlada não tinha como produzir.

O código chama a coluna de `tbt_ms`, pelo nome do que ela é. Renomear para "INP" faria a tela
afirmar uma medição que ninguém fez.

---

## Notas: 0 a 100, e `null` quando não há nota

As quatro categorias (**Desempenho**, **Acessibilidade**, **Boas práticas**, **SEO**) são gravadas
como `numeric(4,3)` de 0 a 1, aceitando `null`.

`null` não é zero. Zero afirma "medimos e o resultado foi péssimo"; `null` diz "não há medição". A
tela imprime **Indisponível**, e a lista de otimizações ignora a linha em vez de tratá-la como o
pior caso possível.

**Uma nota pertence a uma URL e a um dispositivo**, nunca a um cliente. A mesma página tem notas
diferentes no celular e no computador, e um cliente com oito sites tem oito conjuntos de notas. O
painel do cliente lista as análises; não inventa uma média para representá-lo.

### Diagnósticos

A lista de "o que pesa" sai das auditorias do próprio Lighthouse, filtradas **por propriedade**, não
por uma lista fixa de identificadores:

- auditorias `notApplicable` ou `manual` saem (não há o que corrigir);
- auditorias com nota máxima saem (já estão boas).

Filtrar por lista fixa envelheceria a cada versão do Lighthouse — apareceria auditoria nova que o
painel ignora, e auditoria removida que ele procura para sempre.

---

## A fila de auditorias

Uma análise leva de 11 a 48 segundos. Isso não cabe num render de página, e não cabe confiavelmente
numa função serverless com limite de 60 s se houver mais de uma. Então o trabalho é enfileirado.

```
monitored_urls ──enfileirar──▶ audit_jobs ──processar──▶ lighthouse_results
                                   │                           │
                              (pendente →                  diagnósticos
                               executando →
                               sucesso | erro)
```

**O estado vive no banco, não em memória.** Um array de tarefas morre junto com a invocação
serverless e leva a tarefa com ele, sem deixar rastro. Em `audit_jobs`, um processo que morre no
meio deixa o job em `executando` com `iniciado_em` preenchido — e a retomada o enxerga: passados
10 minutos, ele volta para a fila.

**A reivindicação usa `for update skip locked`.** Duas invocações simultâneas pegam jobs
diferentes, em vez de as duas pegarem o mesmo.

**A deduplicação é de um índice único parcial**, não de um `select` antes do `insert`:

```sql
create unique index audit_jobs_sem_duplicata
  on audit_jobs (site_id, url, strategy)
  where status in ('pendente', 'executando');
```

Entre um `select` e um `insert` cabe outra requisição. Entre o índice e o banco não cabe nada.

**Falha nunca vira resultado.** `registrarFalha` toca apenas o job: marca o erro e conta a
tentativa, até `MAX_TENTATIVAS = 3`. Não escreve linha nenhuma em `lighthouse_results` — uma
análise com quatro notas nulas ficaria indistinguível de uma medição real.

### Três verificações antes de enfileirar, todas no servidor

1. **A URL é pública e bem formada** (`url-publica.ts`, contra SSRF). Recusa `localhost`, faixas
   privadas, IPv6 de loopback, endereços IPv4 mapeados em IPv6, esquemas que não sejam HTTP(S),
   credenciais na URL e portas incomuns. São 31 casos com teste.
2. **A URL está cadastrada em `monitored_urls` daquele site.** Ser pública não basta: auditar
   qualquer endereço seria um endpoint aberto gastando a quota da conta.
3. **O site pertence à conta da sessão** — garantido pela RLS, porque a consulta roda dentro de
   `withAccount`.

---

## Os dois endpoints do agendador

| Rota | Método | O que faz |
|---|---|---|
| `/api/auditorias/agendar` | GET | Só **enfileira** as URLs prioritárias vencidas (7 dias) |
| `/api/auditorias/processar` | GET | O cron: executa **uma** análise da fila |
| `/api/auditorias/processar` | POST | A tela: mesma coisa, aceitando sessão **ou** segredo |

Os dois crons vivem no `vercel.json`, meia hora um do outro. Ambos exigem
`Authorization: Bearer $CRON_SECRET` — valor que a Vercel envia sozinha, sem você configurar nada
além de salvar a variável. **Sem a variável configurada, os dois respondem 401** a todo mundo,
inclusive ao cron: o padrão é negar, porque um agendador aberto enfileira análises de graça e queima
a quota da conta.

O GET do `processar` exige o segredo **mesmo havendo sessão**. Um GET autorizado por cookie seria
disparável por qualquer página que o usuário logado abrisse.

> **Defeito já corrigido, registrado porque se repete fácil:** a Vercel dispara crons **por GET, e só
> por GET**. Este arquivo exportava apenas `POST` enquanto o comentário no topo dele afirmava que o
> cron o chamava. O resultado é o pior tipo de falha silenciosa: o agendador enfileirava todo dia, e
> a fila só era drenada quando alguém abria a tela e clicava em "Executar agora". Nada dava erro.

### Por que o cron é diário, se a regra é semanal

No plano Hobby a Vercel aceita no máximo **dois crons por projeto**, e **uma execução por dia**.
Expressão mais frequente não é ignorada: ela **falha o deploy**. Então o gatilho é diário e a regra
semanal vive na consulta — só entra na fila a URL prioritária cuja última análise passou de sete
dias.

Encadear "agendar" e "processar" na mesma invocação estouraria os 60 s no segundo item, por isso são
dois crons e não um.

**Isso dá uma análise automática por dia**, que é o teto do plano. Com poucas URLs prioritárias a
fila anda sozinha; com muitas, o botão "Executar agora" na tela de Qualidade técnica é o que a
acelera. Num plano pago, a solução é a expressão do cron — não o código.

---

## A chave do Google

Uma chave só, **duas APIs**, habilitadas separadamente no Google Cloud:

1. **PageSpeed Insights API**
2. **Chrome UX Report API**

Ter a chave não basta: cada API é habilitada por projeto do Google Cloud. Esquecer a segunda produz
403 **apenas** no CrUX, com o PageSpeed funcionando — o que faz parecer defeito do painel.

Se a chave e a API estiverem em **projetos diferentes** do Google Cloud, o resultado é o mesmo 403.
Aconteceu neste projeto: a API foi habilitada em `my-project-1789438183884` enquanto a chave
pertencia ao projeto `123942376647`. A URL da página do console mostra em qual projeto você está.

Sem `PAGESPEED_API_KEY`, a análise técnica fica **desligada e a tela diz isso**. Não existe nota de
demonstração.

### Respostas que parecem sucesso e não são

Duas armadilhas já corrigidas, e ambas produziriam números falsos:

- **HTTP 200 com `lighthouseResult.runtimeError`.** A API responde 200 e informa a falha dentro do
  corpo. Interpretar isso como sucesso gravaria uma análise com quatro notas nulas — que na tela
  parece medição. Hoje isso lança erro e o job volta para a fila.
- **O cache de `fetch` do Next.js.** Requisições GET são cacheadas por padrão. Como a URL da API é
  idêntica a cada execução da mesma página e estratégia, a **primeira resposta com falha era
  repetida indefinidamente** — a mesma URL falhava para sempre pelo aplicativo e respondia 200 via
  `curl`. As chamadas externas usam `cache: 'no-store'`. Medição cacheada não é medição.

---

## CrUX: ausência de dados não é nota ruim

A API do CrUX responde **404 quando não há dados suficientes** para a URL. Isso é comum: o conjunto
de dados cobre páginas com tráfego suficiente para preservar o anonimato dos usuários.

O painel trata os códigos separadamente:

| Resposta | Significado | O que a tela mostra |
|---|---|---|
| 200 | Há dados de campo | Os percentis 75 e a janela de coleta |
| 404 | Tráfego insuficiente | "Sem dados de campo" |
| 403 | API não habilitada | "Integração não configurada" |

Quando a URL específica não tem dados, a consulta tenta a **origem** (o domínio inteiro) e **rotula
o escopo** — `url` ou `origem`. Mostrar o número da origem sem dizer que ele é da origem faria
parecer medição daquela página.

Os valores são os **percentis 75**, que é a definição do próprio Core Web Vitals: o número abaixo do
qual ficam 75% dos carregamentos. Não é a média, e a diferença é grande em distribuições com cauda
longa.

**O seletor de período do painel não estreita a janela do CrUX.** Escolher "7 dias" na tela continua
mostrando a janela de 28 dias que a API devolveu, e a tela imprime as datas dessa janela. Apresentar
como se o filtro valesse ali seria afirmar um recorte que não existe.

O p75 é lido aceitando número **ou** string: o CLS já veio como `"0.05"` em resposta real, e assumir
só uma das formas perderia o valor em silêncio.

---

## O que esta parte do painel não faz

- **Não atribui uma nota ao cliente.** Nota é de URL e dispositivo. Um cliente com oito sites tem
  oito conjuntos.
- **Não afirma que lentidão causou queda de conversão.** Os dois sinais podem aparecer juntos sem um
  causar o outro. A tela de Otimizações mostra os dois separados, com a evidência de cada um, e
  deixa a conclusão para quem investiga.
- **Não conclui que o rastreamento quebrou porque um site ficou sem eventos.** Site de pouco tráfego
  passa dias sem visita. O aviso só aparece quando o site **já coletou com regularidade** (mais de
  30 eventos no histórico) e parou há mais de 3 dias.
- **Não guarda os achados derivados.** Eles são calculados na hora e somem quando a causa some.
  Guardar significaria ter de apagar depois, e uma linha órfã afirmaria um problema encerrado.
