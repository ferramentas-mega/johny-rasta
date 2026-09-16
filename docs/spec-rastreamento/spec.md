# Especificação — rastreamento de cliques em botões

**O QUÊ.** Sem escolha de linguagem, framework ou banco: essas ficam em [`plan.md`](plan.md).

Cada requisito tem identificador estável (`RF-###` funcional, `RNF-###` não funcional), a marca
🔒/🔧 de [invariante ou vínculo](README.md#invariante--vínculo-de-stack), e critérios de aceite
escritos como afirmações verificáveis.

---

## 1. Problema

Uma agência precisa responder, sobre o site de um cliente: **em que botão as pessoas clicam, e onde
esse botão está na página.**

Hoje isso é respondido por conversa ("acho que o do topo funciona melhor") ou por ferramenta que
mede outra coisa. O que falta é um número medido, com definição escrita, que o operador possa levar
para a reunião sem ter de defender de onde ele veio.

**O problema vizinho, e por que ele não está aqui:** "onde na tela as pessoas clicam" é mapa de
calor, exige capturar movimento de ponteiro, e é outro produto — com outra conversa sobre
consentimento. Ver [`research.md`](research.md#d-9--por-que-não-há-mapa-de-calor).

---

## 2. Quem usa, e o que cada um precisa

| Ator | Precisa | Não deve conseguir |
|---|---|---|
| **Visitante** do site do cliente | Que o site funcione. Nada mais | Ser identificado como pessoa |
| **Operador** da agência | Instalar, confirmar que funciona, ler os números | Confirmar instalação sem evidência |
| **Cliente** final | Um relatório que ele possa conferir | — (não tem acesso; ver §7) |
| **Endpoint público** | Gravar eventos de um site | Ler dados de outro site, ou dados pessoais |

---

## 3. Cenários

### C-1 · Instalar e confirmar

Um operador cadastra o site, recebe uma linha de script, entrega a quem publica a página. Depois
abre o diagnóstico no painel, abre o site do cliente **pelo link do diagnóstico**, clica no botão de
WhatsApp, e o painel confirma: *evento recebido*.

**O que precisa ser verdade:** a confirmação vem do evento que chegou, não de o script estar no
HTML (P-4). E o evento do teste não entra em relatório nenhum (P-3).

### C-2 · Ler o que performou

Ao fim da semana, o operador abre o relatório do período e vê os botões ordenados por cliques, com o
texto do botão, a página e a posição declarada.

**O que precisa ser verdade:** o total dessa tabela fecha com o total de cliques da tabela por
página, por construção — as duas contam o mesmo conjunto (P-11).

### C-3 · Descobrir que a marcação está incompleta

O operador vê uma linha chamada `auto:whatsapp` com 240 cliques. Isso significa: o coletor detectou
os cliques sozinho, mas **todos os botões de WhatsApp do site viraram uma linha só**. Ele recebe a
instrução do que acrescentar no HTML.

**O que precisa ser verdade:** o clique já foi contado. O que falta é legibilidade, e a tela precisa
dizer exatamente isso — não "erro".

### C-4 · Descobrir que um botão sumiu

Um `data-track-id` se perdeu numa refatoração. Duas semanas depois, o botão aparece como **"Parou de
aparecer"**, com a instrução de conferir se sobreviveu ao último *deploy*.

**O que precisa ser verdade:** as duas salvaguardas de P-14. Se a coleta do site inteiro parou,
nenhum botão é acusado — o problema é outro, e é um só.

### C-5 · Descobrir coletor instalado duas vezes

As visualizações dobram, a taxa de conversão cai pela metade, e nada piorou no site. Ninguém
desconfia de um número que só subiu.

**O que precisa ser verdade:** o sistema acusa — páginas com duas visualizações da mesma sessão
separadas por menos de dois segundos.

---

## 4. Requisitos funcionais

### 4.1 Captura no navegador

**RF-001** 🔒 O coletor registra clique em elemento que tenha identificador de rastreamento
declarado, **ou** que seja link para WhatsApp, telefone ou e-mail.
*Aceite:* clique em elemento fora desses critérios não gera evento.

**RF-002** 🔒 Um gesto que casa com mais de um critério gera **um** evento.
*Aceite:* um link para WhatsApp que também tem identificador declarado produz uma linha, não duas.

**RF-003** 🔒 A captura funciona mesmo que a página interrompa a propagação do evento no próprio
manipulador.
*Aceite:* um botão cujo manipulador chama `stopPropagation` continua sendo medido.

**RF-004** 🔒 Sem identificador declarado, o coletor atribui um identificador de **grupo** derivado
do subtipo, marcado como automático.
*Aceite:* o identificador resultante é distinguível de um declarado, sem heurística de texto.

**RF-005** 🔒 O evento carrega: identificador do botão, texto visível (limitado), posição declarada,
subtipo, caminho da página, identificador de sessão do visitante, dispositivo, origem, e chave de
idempotência do gesto.
*Aceite:* nenhum outro campo. Ver RF-006.

**RF-006** 🔒 O coletor **não lê campo de formulário** (P-2).
*Aceite:* inspeção do código-fonte do coletor não encontra leitura de `input`, `textarea` ou
`select` para envio.

**RF-007** 🔒 Existe uma porta manual para o site registrar ação própria (abertura de modal, botão
que não é link), com os mesmos campos e os mesmos limites.
*Aceite:* chamada com subtipo inválido não derruba a página.

**RF-008** 🔒 Instalado duas vezes no mesmo documento, o segundo coletor desiste.
*Aceite:* uma visualização, não duas — para o caso de mesma instância. Duas instâncias **distintas**
do script continuam produzindo dois eventos, e é isso que RF-024 detecta.

**RF-009** 🔒 As UTMs da **primeira** página valem para a sessão inteira.
*Aceite:* navegar internamente não reescreve a origem do visitante.

**RF-010** 🔒 Troca de rota sem recarregar (aplicação de página única) produz visualização nova;
repetir o mesmo caminho não.
*Aceite:* voltar/avançar para o caminho já corrente não gera evento.

### 4.2 Diagnóstico de instalação

**RF-011** 🔒 O token de diagnóstico tem formato fechado, gerado pelo painel.
*Aceite:* texto livre no parâmetro é ignorado — não vira token.

**RF-012** 🔒 O token expira em **30 minutos**, aplicado no navegador, antes do envio (P-5).
*Aceite:* passados 30 minutos, os eventos daquela aba voltam a ser eventos normais.

**RF-013** 🔒 O token sobrevive à navegação entre páginas do site e morre quando a aba fecha.
*Aceite:* não vira cookie nem armazenamento persistente. Não é identidade; é rótulo temporário.

**RF-014** 🔒 Abrir um diagnóstico novo encerra os anteriores do mesmo site.

**RF-015** 🔒 Evento com token é evento de teste, **decidido no servidor** (P-3).
*Aceite:* evento com token e sem a marca de teste é gravado como teste mesmo assim.

### 4.3 Ingestão

**RF-016** 🔒 Evento com a mesma chave de idempotência grava **uma** linha (P-1).
*Aceite:* segunda tentativa é reconhecida como duplicata e responde sucesso, sem gravar.

**RF-017** 🔒 A deduplicação é atômica no armazenamento, não uma leitura seguida de escrita.
*Aceite:* duas requisições simultâneas com a mesma chave produzem uma linha.

**RF-018** 🔒 Clique sem subtipo é **recusado**.
*Aceite:* a validação rejeita; não existe subtipo padrão inventado no servidor.

**RF-019** 🔒 Relógio adiantado no cliente não planta evento no futuro nem reescreve passado remoto.
*Aceite:* carimbo fora da janela aceitável é substituído pelo do servidor.

**RF-020** 🔒 Eventos do mesmo visitante dentro de **30 minutos** de inatividade ficam na mesma
sessão; passado isso, abre sessão nova. Visitantes diferentes nunca compartilham sessão.

**RF-021** 🔒 Variações da mesma página (com e sem barra final, com parâmetros, com âncora) são uma
página só.
*Aceite:* `/planos`, `/planos/` e `/planos?x=1` produzem a mesma linha.

**RF-022** 🔒 O endpoint aceita apenas requisições cuja origem corresponda ao domínio cadastrado do
site, ou às páginas de teste do próprio painel.

**RF-023** 🔒 Há limite de taxa **por site**, cobrado depois de resolver o site.
*Aceite:* cobrar pelo identificador cru permitiria encher a tabela de contadores com identificadores
inventados — a implementação não faz isso.

### 4.4 Leitura — e são duas

**RF-024** 🔒 **Leitura por janela**: cliques agrupados por botão dentro de um período, com texto,
página, subtipo, posição e contagem.
*Aceite:* o total fecha com o total de cliques da leitura por página (P-11).

**RF-025** 🔒 **Inventário**: todo botão já clicado no site, **sem recorte de período**.
*Aceite:* um botão sem clique nos últimos sete dias continua no inventário. Recortá-lo o faria
parecer removido do site.

**RF-026** 🔒 O inventário mostra texto e posição **mais recentes**, não quaisquer um.
*Aceite:* o rótulo muda quando alguém reescreve a página; mostrar texto antigo faria o operador
procurar algo que não está mais escrito lá.

**RF-027** 🔒 Eventos de teste ficam fora das duas leituras.

**RF-028** 🔒 Nenhuma leitura enxerga botão de outro site.

**RF-029** 🔒 O inventário deriva um estado por botão, com precedência fixa:

| Estado | Quando | Próxima ação |
|---|---|---|
| **Parou de aparecer** | Tinha volume e ficou 14 dias sem clique, **com o site ativo** | Conferir se o botão e o identificador sobreviveram ao *deploy* |
| **Sem nome** | Detectado automaticamente, sem identificador declarado | Acrescentar identificador e posição |
| **Sem posição** | Nomeado, sem posição declarada | Acrescentar a posição |
| **Novo** | Primeiro clique há menos de 7 dias | Nada |
| **Medindo** | Nomeado, posicionado, recebendo cliques | Nada |

*Aceite:* a ordem da tabela **é** a precedência — um botão quebrado importa antes de um mal nomeado.
Estado sem próxima ação é só um rótulo bonito; todos têm.

**RF-030** 🔒 "Parou de aparecer" exige **volume mínimo de 10 cliques históricos** e **site ainda
coletando** (P-14).
*Aceite:* com o site parado, nenhum botão é acusado.

**RF-031** 🔒 A lista ordena por urgência, depois por volume.
*Aceite:* ordenar por volume poria no topo justamente o que está funcionando.

**RF-032** 🔒 O sistema acusa **coletor instalado duas vezes**: visualizações da mesma sessão e
mesma página separadas por menos de dois segundos.
*Aceite:* recarregar de verdade leva mais que isso; duas tags disparam praticamente no mesmo
instante. Sessões diferentes no mesmo instante não são duplicação.

**RF-033** 🔒 Todo teto de linhas exibe o total (P-12).

### 4.5 O que a interface afirma

**RF-034** 🔒 A tela declara que **botão nunca clicado não aparece** (P-7).

**RF-035** 🔒 A tela nomeia clique em WhatsApp como **intenção de contato**, não conversa iniciada
(P-13).

**RF-036** 🔒 Abertura de formulário e envio de formulário aparecem como eventos distintos e nunca
se somam.

**RF-037** 🔒 Nenhum componente de interface calcula número: os totais saem da camada de consulta.
*Aceite:* duas telas nunca discordam do mesmo indicador.

---

## 5. Requisitos não funcionais

**RNF-001** 🔒 O coletor **nunca** atrasa nem impede a ação do visitante (P-6).
*Aceite:* nenhum `preventDefault`; nenhum `await` antes de navegar; falha de rede engolida.

**RNF-002** 🔒 O envio sobrevive à navegação imediata.

**RNF-003** 🔒 O envio não dispara requisição de *preflight*.
*Aceite:* o tipo de conteúdo escolhido é simples. O custo é que o corpo não é JSON declarado, e o
servidor precisa analisar texto.

**RNF-004** 🔒 O coletor não tem dependência externa nem etapa de compilação.
*Motivo:* ele roda no site de terceiro, sob a política de segurança de conteúdo **deles**. Toda
dependência é uma chance a mais de ser bloqueado — e o bloqueio é silencioso.

**RNF-005** 🔒 Corpo grande demais é recusado **antes de ser lido**.

**RNF-006** 🔒 O limitador de taxa vive em armazenamento compartilhado, não em memória de processo.
*Motivo:* em ambiente sem estado, um contador em memória reinicia a cada invocação fria e não é
compartilhado entre instâncias. Um limitador que não limita é pior que nenhum: dá impressão de
proteção.

**RNF-007** 🔒 O limitador **falha aberto**. Se o armazenamento não responde, a requisição segue, e
o erro é registrado.
*Motivo:* derrubar a coleta inteira porque a tabela de contadores está indisponível troca um
problema pequeno por um grande.

**RNF-008** 🔒 O papel usado pelo endpoint público não tem privilégio para ler dados pessoais.
*Aceite:* a tentativa falha por permissão do armazenamento, não por conferência no código.

**RNF-009** 🔒 Sem escopo fixado, nenhuma linha é visível e nenhuma escrita passa (P-10).

**RNF-010** 🔒 Consentimento existente na página é respeitado.
*Aceite:* uma preferência declarada como negada interrompe toda coleta daquele documento.

---

## 6. Critérios de aceite do conjunto

A implementação está pronta quando **todos** passam, executados (P-15):

| # | Afirmação | Como se prova |
|---|---|---|
| A-1 | Um gesto nunca vira dois | Mesmo `uid` duas vezes → 1 linha; `uid`s distintos → 2 |
| A-2 | Diagnóstico não entra em relatório | Evento marcado como teste não altera nenhum indicador |
| A-3 | O token expira | Após 30 min, eventos daquela aba voltam a ser normais |
| A-4 | Isolamento vale no armazenamento | Com escopo do site A, dado do site B não existe — **com o id em mãos** |
| A-5 | O padrão é negar | Sem escopo, a tabela inteira é vazia |
| A-6 | O inventário não mente sobre sumiço | Botão sem volume nunca some; com o site parado, nenhum some |
| A-7 | Precedência é a de produto | Sumiço vence "sem nome" |
| A-8 | Coletor duplicado é detectado | Duas visualizações < 2s na mesma sessão acusam; sessões diferentes não |
| A-9 | O inventário é histórico | Não é recortado por período |
| A-10 | Os dois totais fecham | Tabela por botão = coluna de cliques da tabela por página |
| A-11 | O clique funciona com o coletor quebrado | Coletor lançando exceção; o link continua navegando |
| A-12 | Nada pessoal no analytics | O evento correspondente a um envio de formulário não carrega o conteúdo dele |

**A-11 é o mais fácil de esquecer e o mais caro de descobrir em produção.**

---

## 7. Fora de escopo

| Item | Por quê |
|---|---|
| **Mapa de calor** | A posição é um **rótulo** que o operador escreve, não coordenada. Derivar mapa daí é desenhar pontos onde ninguém mediu clique |
| **Replay de sessão** | Exige gravar o DOM e suas mutações — inclusive o que a pessoa digitou antes de enviar. Muda o que o coletor **é** (P-2) |
| **Identificação de pessoa** | O identificador de visitante é rotativo e não se liga a identidade |
| **Conteúdo de formulário pelo coletor de analytics** | Proibido por P-2. Existe caminho próprio, com lista branca |
| **Portal do cliente final** | Não há telas nem acesso para o cliente |
| **Exportação de relatório** | Não implementada. Requisitos de honestidade de um arquivo exportado estão anotados, mas fora daqui |
| **Atribuição entre dispositivos** | O identificador é por navegador. Mesma pessoa em dois aparelhos são dois visitantes, e o sistema não finge o contrário |

---

## 8. Glossário

- **Gesto** — uma ação do visitante. Unidade da idempotência.
- **Evento** — uma linha gravada. Um gesto produz no máximo um.
- **Sessão** — janela de atividade de um visitante, encerrada por 30 min de inatividade.
- **Subtipo** — a natureza do clique: WhatsApp, telefone, e-mail, abertura de formulário, outro.
- **Identificador do botão** — o nome no relatório. Declarado, ou automático (de grupo).
- **Posição** — **rótulo** textual de onde o botão está ("Hero", "Rodapé"). Nunca coordenada.
- **Elegível** — evento que entra nas agregações: não é teste, e pertence a sessão dentro da janela.
- **Diagnóstico** — teste conduzido pelo operador, marcado por token com prazo.
- **Automático** (`auto:`) — botão medido sem nome declarado. O clique conta; o relatório é ilegível.
