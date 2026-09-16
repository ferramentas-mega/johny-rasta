# Decisões, alternativas recusadas e evidência

**POR QUÊ.** Leia antes de discordar de um requisito de [`spec.md`](spec.md).

Cada decisão traz o que foi recusado e o motivo. Onde houve medição, ela está aqui com o número —
onde não houve, está escrito que é julgamento, e não medição disfarçada.

---

## D-1 · Chave de idempotência gerada no navegador, por gesto

**Alternativas consideradas**

| Opção | Por que não |
|---|---|
| Chave por requisição | Um *retry* do `sendBeacon` é outra requisição do mesmo gesto — contaria dois |
| Chave gerada no servidor | O servidor não distingue reenvio de clique novo |
| Deduplicar por (visitante, botão, segundo) | Dois cliques legítimos no mesmo segundo viram um. E o relógio do cliente mente |
| `select` antes do `insert` | **Entre um e outro cabe outra requisição.** É a fresta por onde passa exatamente o caso que a dedup existe para cobrir |

**Escolhido:** identificador aleatório por gesto, gerado no navegador, com restrição de unicidade no
armazenamento e descarte atômico.

**Consequência aceita:** quem forja requisições pode inflar a contagem gerando chaves novas. É da
natureza de um coletor no navegador — o identificador do site está no HTML de quem instalou. Quem
contém isso é o limite por site, não a idempotência.

---

## D-2 · `sendBeacon` com `text/plain`

O tipo de conteúdo é o ponto, e não é estética: `application/json` torna a requisição
"não simples" e dispara *preflight* `OPTIONS`. Esse ida-e-volta extra se interpõe entre o clique e a
abertura do WhatsApp.

**Custo aceito:** o servidor recebe texto e precisa analisar JSON manualmente, perdendo a análise
automática do framework. É um `JSON.parse` dentro de um `try`.

**Alternativa recusada:** `fetch` comum. Seria cancelado pela navegação que o próprio clique causa —
perdendo justamente os cliques que mais importam, os que levam para fora do site.

---

## D-3 · Captura na fase de captura, com busca do ancestral mais próximo

**O problema real:** o site do cliente é de terceiro. Ele pode ter um manipulador próprio no botão
que chama `stopPropagation` — e aí um ouvinte na fase de borbulhamento nunca é chamado. O clique
aconteceria sem ser medido, **sem erro nenhum**.

**Por que ancestral mais próximo e não o alvo:** clicar no `<span>` dentro do `<a>` tem como alvo o
`<span>`. Sem subir a árvore, o clique some.

**Por que um seletor só, e não dois ouvintes:** um link para WhatsApp que também tem identificador
declarado casaria com os dois e produziria dois eventos. Um seletor com alternativas resolve por
construção.

---

## D-4 · O prefixo `auto:` em vez de heurística de nome

Quando não há identificador declarado, era tentador derivar um nome do texto do botão ou do `href`.

**Recusado**, por dois motivos:

1. **O texto muda.** "Fale conosco" vira "Falar agora" numa revisão de copy, e o botão vira dois no
   histórico sem ninguém ter mexido na marcação.
2. **O texto é conteúdo.** Derivar identidade dele é uma porta pela qual dado que não deveria estar
   ali entra na chave primária do relatório.

O prefixo é honesto sobre o que aconteceu: **medido, sem nome.** E é isso que o estado "Sem nome"
mostra, com a instrução do que acrescentar.

**Consequência declarada, não escondida:** todos os botões de WhatsApp da página viram uma linha só.
A tela diz isso.

---

## D-5 · Duas leituras, não uma com filtro opcional

Foi tentador ter uma consulta com período opcional.

**Recusado** porque as duas respondem perguntas diferentes, e misturá-las produz o erro mais caro do
subsistema: **um botão bem instalado sem clique nesta semana sumiria do inventário e pareceria
removido do site.** O operador iria conferir uma página onde não há nada errado.

| Leitura | Pergunta | Recorte |
|---|---|---|
| Por janela | *O que performou neste período?* | Sim |
| Inventário | *O que existe e como está marcado?* | **Não** |

---

## D-6 · Volume mínimo e contexto ativo para afirmar sumiço

Números escolhidos: **10 cliques históricos**, **14 dias sem clique**, **7 dias para contar como
novo**.

**São julgamento, não medição.** O raciocínio:

- **10 cliques** — abaixo disso não há regularidade que distinga "sumiu" de "ninguém clicou nesta
  quinzena". Um botão clicado duas vezes na vida não sumiu.
- **14 dias** — duas semanas cobrem a variação de sazonalidade semanal de um site pequeno. Sete
  dias acusariam o feriado.
- **7 dias para novidade** — tempo de o operador ver o botão aparecer antes de o sistema começar a
  cobrar marcação dele.

A trava do **contexto ativo** não é ajustável e não é julgamento: sem ela, uma coleta que parou por
inteiro faz **todos** os botões parecerem sumidos. A lista apontaria sete problemas onde existe um
só, e no lugar errado. É a mesma regra que o projeto aplica a "site sem eventos".

---

## D-7 · A posição é rótulo, e isso é decisão de produto

`data-track-pos` recebe "Hero", "Rodapé", "Preços" — texto que uma pessoa escreve.

**Alternativa recusada:** capturar coordenada do clique, ou posição do elemento no momento do
clique.

Motivos, em ordem:

1. Coordenada depende de largura de viewport, zoom e estado de rolagem. "x=312" não significa a
   mesma coisa em dois aparelhos.
2. Capturar posição de ponteiro é o primeiro passo de mapa de calor, e isso muda o que o coletor é
   (D-9).
3. O rótulo responde a pergunta que o operador realmente faz: *o botão do topo converte mais que o
   do rodapé?* — e responde de forma estável mesmo quando a página é redesenhada.

**Custo aceito:** rótulos inconsistentes entre páginas estragam a comparação, e o sistema não tem
como saber. Por isso a escolha de rótulos estáveis está no contrato de marcação.

---

## D-8 · O prazo do token no coletor, e não na ingestão

O token de diagnóstico marca eventos como teste. Enquanto ele vale, **visitas reais que chegarem com
ele somem dos relatórios**.

Ele viaja na URL, e URL se espalha: basta colar o link num grupo.

**Onde aplicar o prazo?**

| Lugar | Avaliação |
|---|---|
| Na ingestão | Exigiria que o papel público lesse a tabela de sessões de diagnóstico. **Trocaria perda de dado por privilégio a mais no papel mais exposto** |
| No coletor | Age antes de o evento sair do navegador. O papel público continua sem enxergar nada além do necessário para gravar |

**Escolhido: no coletor.** A ingestão **não confere de propósito**, e isso está comentado no código
para que ninguém "conserte" depois.

O token é gravado como texto no evento, sem chave estrangeira, pela mesma razão. Token inexistente
vira uma string que não casa com nada — e o evento já nasceu marcado como teste, então não entra em
relatório algum.

---

## D-9 · Por que não há mapa de calor

A pergunta aparece sempre, e a resposta honesta é: **não dá para fazer com este dado.**

O coletor não registra coordenada de ponteiro nem mutação de DOM. A posição é um rótulo (D-7).
Derivar um mapa de calor daí seria desenhar pontos onde ninguém mediu clique nenhum — o pior tipo de
número, porque parece medição.

Fazer de verdade significa capturar movimento do ponteiro (mapa) ou gravar o DOM e suas mutações
(replay). **As duas coisas mudam o que o coletor é.** Hoje ele declara, na primeira linha, que não
lê campo de formulário e não manda dado pessoal — e um replay grava a tela inteira, inclusive o que
a pessoa digitou antes de enviar.

Isso é outro produto, com outra conversa sobre consentimento, e uma reimplementação que o inclua
precisa **reabrir P-2**, não contorná-lo.

---

## D-10 · Isolamento no armazenamento, não no código

As políticas de acesso dos papéis públicos já foram `using (true)`. Não havia vazamento em curso —
as consultas sempre filtravam por site, e eram parametrizadas.

**Mas era a única parte do sistema onde quem protegia era o código.** Em todo o resto, um erro de
consulta devolve vazio; ali, devolveria a base inteira.

Hoje o escopo do site é fixado por transação e as políticas casam por ele. Sem o ajuste, o escopo é
nulo, a comparação é nula, e o resultado é vazio.

**O que isto não resolve, dito explicitamente:** o identificador público continua público. Quem o
tem envia eventos daquele site. O que muda é o alcance de um **erro**: no máximo um site.

**Recusado:** dar acesso irrestrito ao papel público "porque é mais simples". Seria trocar um
endpoint com defeito por um que enxerga tudo de uma vez.

---

## D-11 · Limitador no armazenamento, e falhando aberto

**Em memória de processo não funciona** em ambiente sem estado: o contador reinicia a cada invocação
fria e não é compartilhado entre instâncias. Quem tenta abuso abre requisições em paralelo, cada uma
cai numa instância diferente, e o contador nunca chega ao limite. **Um limitador que não limita é
pior que nenhum: dá impressão de proteção.**

**Janela fixa, não deslizante.** A deslizante é mais justa na virada; custaria guardar cada carimbo
em vez de um contador. Para enxurrada de eventos, a diferença é no máximo o dobro do limite no
instante da virada.

**Falha aberta.** Se o armazenamento não responde, a requisição segue e o erro é registrado.
Derrubar a coleta inteira porque a tabela de contadores está indisponível troca um problema pequeno
por um grande.

**Incremento e leitura numa operação só, do lado do armazenamento** — entre um `select` e um
`update` cabe outra requisição, e é nessa fresta que um ataque paralelo passa.

---

## D-12 · Lição aprendida: limite que conta acertos bloqueia quem sabe a senha

Não é do rastreamento, mas é a mesma família de erro e vale para qualquer limitador que a
reimplementação escrever.

O limitador de login era cobrado a cada tentativa, **inclusive as que davam certo**. Quem achou foi
a suíte de navegador: ela entra pelo login em quase todo teste e travava a partir do décimo login da
execução.

Força bruta nunca acerta, então o acerto zera o contador. Um limite que bloqueia quem sabe a senha
confunde "muitas tentativas" com "muitos acertos".

---

## D-13 · Lição aprendida: coluna obrigatória transforma campo opcional em dado perdido

Ao tornar a chave de idempotência opcional no endpoint de formulários, o evento de analytics
correspondente continuou gravando essa chave numa coluna **obrigatória**. Submissão sem chave violava
a restrição e **derrubava a transação inteira por rollback** — perdendo o lead que a mesma transação
acabara de gravar.

**Ao tornar um campo opcional, procure todo lugar que o consome.** Vale diretamente para quem for
mexer nos campos de botão.

---

## D-14 · Lição aprendida: normalizar caminho, ou a tabela vira ruído

`/planos`, `/planos/` e `/planos?x=1` são a mesma página para quem lê o relatório, e três linhas
para quem não normaliza. Parâmetros de campanha garantem que isso aconteça no primeiro site com
tráfego pago.

A normalização acontece **na ingestão**, não na leitura: normalizar na leitura deixaria o dado sujo
no armazenamento e obrigaria toda consulta futura a repetir a regra — e a primeira que esquecesse
discordaria das outras (P-11).

---

## D-15 · Lição aprendida: upsert que atualiza exige privilégio que não é preciso dar

A resolução de páginas na ingestão usa "insere, ignora conflito" seguido de leitura — e **não**
"insere ou atualiza".

O motivo é de privilégio: o upsert que atualiza exigiria conceder UPDATE na tabela de páginas ao
papel público. Não há nada a atualizar ali. **Menos privilégio, mesmo resultado.**

---

## D-16 · Lição aprendida: teste que constrói o caminho que o usuário não tem

Uma varredura achou três recursos implementados e inalcançáveis — a Action funcionava, a URL
funcionava, e nenhum link levava até lá. Pior: o teste montava a URL à mão, e **passava com o
produto inalcançável**.

Ao especificar a interface do inventário, o critério de aceite começa pelo clique, não pela rota.

---

## D-17 · Medir a política de segurança no pacote publicado, nunca em desenvolvimento

Não é do coletor — é de quem for hospedar o painel que serve o coletor, e custou tempo aqui.

O modo de desenvolvimento compila com `eval`; é assim que o recarregamento a quente funciona.
Medido: **4.536 violações** em desenvolvimento, todas de `eval`, contra **zero recusas** no pacote
publicado.

Quem mede no lugar errado conclui que a política precisa afrouxar `eval` e enfraquece a produção por
causa de uma ferramenta que não vai para lá.

---

## D-18 · Detecção de coletor duplicado: por que dois segundos

A dedup por idempotência **não pega** este caso: duas instâncias do script disparam duas
visualizações com chaves diferentes. Do ponto de vista do armazenamento são dois eventos legítimos e
distintos.

O prejuízo é silencioso e caro: as visualizações dobram, "páginas por sessão" dobra, e a taxa de
conversão cai pela metade sem nada ter piorado no site. **Ninguém desconfia de um número que só
subiu.**

**Dois segundos** como corte: recarregar a página de verdade leva mais que isso, e duas tags
disparam praticamente no mesmo instante. Uma janela maior começaria a acusar navegação legítima de
ida e volta.

É julgamento calibrado pelo modo de falhar: errar para o lado de não acusar é melhor que treinar o
operador a ignorar o aviso (P-14).
