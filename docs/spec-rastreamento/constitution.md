# Constituição do rastreamento

Os princípios que decidem quando há conflito. Nenhum deles é gosto: cada um corresponde a um jeito
específico de o sistema mentir **sem dar erro**, e é isso que os torna caros de descobrir depois.

Um requisito de `spec.md` que contrarie um princípio daqui está errado — mesmo que alguém o tenha
pedido. Um pedido que contrarie um princípio daqui precisa mudar o princípio primeiro, de propósito
e por escrito.

---

## P-1 · Um gesto, um evento

🔒 **INVARIANTE**

Um clique do visitante produz exatamente uma linha, para sempre. Reenvio por instabilidade de rede,
script instalado duas vezes no mesmo `<script>`, *retry* do `sendBeacon`, e voltar/avançar no
navegador colapsam no mesmo evento.

**Como se garante:** a chave de idempotência é gerada **no navegador, por gesto** — não no servidor,
não por requisição. O servidor descarta a repetição numa operação atômica.

**Por que não `select` antes de `insert`:** entre a leitura e a escrita cabe outra requisição. A
deduplicação tem de ser uma restrição do armazenamento, não uma conferência da aplicação.

**Como se prova:** dois envios do mesmo `uid` gravam uma linha; dois `uid`s diferentes do mesmo
visitante gravam duas.

---

## P-2 · Nada de dado pessoal no coletor de analytics

🔒 **INVARIANTE**

O script de analytics **não lê campo de formulário**. Nome, e-mail, telefone e conteúdo de mensagem
não trafegam por ele em hipótese alguma — nem como texto do botão, nem como parâmetro de URL, nem
"só para depurar".

Esses dados têm um caminho próprio (o endpoint de formulários), acionado quando a pessoa envia de
propósito, com lista branca de campos.

**Consequência que costuma ser esquecida:** o texto do botão é capturado (`textContent`), e um botão
pode conter texto dinâmico. Cortar em 160 caracteres não resolve isso sozinho — quem monta a página
precisa saber que aquele texto vai para o relatório, e é por isso que existe `data-track-texto` para
sobrescrever.

**O que isso proíbe por tabela:** o identificador de visitante é um valor rotativo do navegador, não
identidade. Não há vínculo entre ele e pessoa nenhuma dentro do subsistema de analytics.

---

## P-3 · O servidor decide o que é teste

🔒 **INVARIANTE**

Se o evento chega com token de diagnóstico, ele **é** evento de teste — mesmo que o cliente não
tenha marcado. O coletor também marca, mas confiar só nele deixaria um diagnóstico virar número de
relatório caso o campo se perdesse no caminho.

Evento de teste fica fora de **todas** as agregações comerciais. Aparece só na tela de verificação
de instalação.

---

## P-4 · Verificação é evento recebido, nunca presença no HTML

🔒 **INVARIANTE**

Não se confirma instalação buscando a página do cliente e procurando a tag. Script bloqueado por
CSP, por banner de consentimento ou por extensão **está no HTML e não mede nada** — a conferência
responderia a pergunta errada e diria "instalado" sobre um site que não coleta.

Buscar a página do cliente também cria um alvo de SSRF que não precisa existir.

**A conferência certa:** um evento chegou, com o token do diagnóstico em andamento.

---

## P-5 · Token de diagnóstico tem prazo, e o prazo vive no coletor

🔒 **INVARIANTE**

O token viaja na URL, e URL se espalha. Basta alguém colar o link num grupo — ou deixar a aba aberta
para outra pessoa usar — e **visitas reais passam a ser marcadas como teste**: somem dos relatórios
em silêncio, que é o pior tipo de perda, porque ninguém percebe até o fechamento do mês.

O prazo é aplicado **no navegador**, antes de o evento sair, e não na ingestão. A ingestão não
confere de propósito: o papel do endpoint público não tem acesso à tabela de sessões de
diagnóstico, e dar acesso trocaria perda de dado por privilégio a mais no papel mais exposto do
sistema.

Prazo em produção: **30 minutos**.

---

## P-6 · Medir é secundário; a página do cliente vem primeiro

🔒 **INVARIANTE**

Nenhum envio é aguardado antes de navegar ou de abrir o WhatsApp. Falha de rede no coletor é
engolida em silêncio. Erro do script de coleta **nunca** pode impedir um clique de funcionar.

Isso decide coisas concretas: envio por `sendBeacon` (ou equivalente que sobreviva à navegação),
`Content-Type` que não dispare *preflight*, e nenhum `preventDefault` em lugar nenhum.

**Vale a pena dizer o custo:** essa escolha significa que alguns eventos se perdem, e é aceito. Um
coletor que garante entrega às custas de meio segundo antes do WhatsApp abrir é um coletor que
piorou o site que ele deveria estar medindo.

---

## P-7 · Zero e "indisponível" são afirmações diferentes

🔒 **INVARIANTE**

Zero afirma "medimos e não houve". Ausência de medição não é zero — a tela diz "Indisponível" ou
"Sem base de cálculo". Divisão por zero devolve nulo, não zero.

Aplicado ao rastreamento de botões: **um botão que existe na página e nunca foi clicado não aparece
no inventário**, e o inventário diz isso na própria tela. Afirmar "seu site tem 7 botões" seria
inventar um número sobre um conjunto que este sistema não enxerga.

---

## P-8 · Falha nunca vira sucesso

🔒 **INVARIANTE**

Erro de consulta mostra erro. Não existe caminho que devolva dado de exemplo, lista vazia
"tranquilizadora", ou confirmação sobre uma gravação que não aconteceu.

O endpoint de coleta é a exceção **de fora para dentro**, e ela é deliberada: ele responde 204 para
o duplicado, porque pedir ao coletor que tente de novo por causa de idempotência seria pior. Mas do
lado de dentro, o duplicado é reconhecido e nomeado (cabeçalho de diagnóstico), não confundido com
gravação nova.

---

## P-9 · A identidade de um sinal contém tudo que o distingue

🔒 **INVARIANTE**

Ao agrupar cliques, a chave precisa conter tudo que separa duas ocorrências que **são coisas
diferentes**. Se duas ocorrências distintas podem produzir a mesma chave, elas vão se fundir, e a
fusão não dá erro: dá um número menor e plausível.

Aplicado aqui: o mesmo identificador de botão repetido em botões diferentes vira uma linha só, e a
comparação entre posições morre. A especificação **não conserta isso na consulta** — conserta
exigindo identificador único na marcação, e expondo o sintoma (contagem de páginas distintas) para
que dê para perceber.

Ao acrescentar uma dimensão nova, a pergunta é: *duas ocorrências diferentes poderiam produzir a
mesma chave?*

---

## P-10 · O padrão é negar

🔒 **INVARIANTE**

O contexto do escopo (conta, site) entra por transação. Sem ele, nenhuma linha é visível e nenhuma
escrita passa — não por conferência da aplicação, mas porque o armazenamento nega.

O motivo de ser no armazenamento e não no código: um `where` esquecido no endpoint público
devolveria a base inteira. Com o escopo fixado, devolve nada.

**O que isto NÃO resolve, e a especificação diz:** o identificador público continua público. Quem o
tem envia eventos daquele site — é da natureza de um coletor no navegador. Quem contém abuso é o
limite por site, não a política de acesso. O que muda é o alcance de um **erro**: no máximo um site,
nunca a base.

---

## P-11 · Quem pergunta e quem faz usam o mesmo critério

🔒 **INVARIANTE**

Quando uma parte decide *se há trabalho* e outra *faz o trabalho*, as duas precisam fazer a mesma
pergunta. Critérios que divergem não dão erro: dão silêncio.

Aplicado ao rastreamento: a definição de "clique elegível" (não é teste, sessão dentro da janela) é
**uma**, compartilhada por toda leitura. Duas cópias divergiriam na primeira correção feita só numa,
e o modo de falhar é duas telas discordando do mesmo total.

---

## P-12 · Corte silencioso faz lista incompleta parecer completa

🔒 **INVARIANTE**

Todo teto de linhas vem acompanhado do total: "20 de 84". Toda exclusão deliberada é nomeada e
contada. Se a lista corta, ela diz.

---

## P-13 · Nenhuma conclusão de causa

🔒 **INVARIANTE**

O sistema mede cliques e mostra cliques. Não afirma que um botão "converte melhor" por estar no
topo, não afirma que a queda de cliques foi causada pelo *deploy* de ontem, e não chama intenção de
resultado: **clique no WhatsApp é intenção de contato, não conversa iniciada** — não se sabe o que
aconteceu depois que a aba abriu.

Abertura de formulário e envio de formulário são eventos distintos e nunca se somam.

---

## P-14 · Sinal derivado precisa de salvaguarda contra alarme falso

🔒 **INVARIANTE**

Qualquer afirmação do tipo "isto parou de acontecer" precisa de duas travas, porque é o sinal mais
útil e o mais fácil de transformar em ruído:

1. **Volume mínimo.** Algo que aconteceu duas vezes na vida não "parou" — nunca teve regularidade
   que permitisse afirmar nada.
2. **Contexto ativo.** Se a coleta inteira parou, tudo parece ter sumido, e a lista aponta sete
   problemas onde existe um só, no lugar errado.

Alarme falso treina o operador a ignorar a lista, e aí o sinal verdadeiro também se perde.

---

## P-15 · Só se declara aprovado o que foi executado

🔒 **INVARIANTE**

Nenhum critério de aceite desta especificação pode ser marcado como atendido sem execução. Teste que
constrói o caminho que o usuário não tem prova o mecanismo e esconde a tela quebrada.

Toda salvaguarda nova é verificada por **controle negativo**: quebra-se a salvaguarda de propósito e
confirma-se que exatamente os testes certos falham. Salvaguarda que não falha quando quebrada não
está sendo testada.
