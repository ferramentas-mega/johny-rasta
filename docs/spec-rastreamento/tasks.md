# Tarefas

Ordenadas por dependência. Cada uma tem **pronto quando** verificável — e nenhuma pode ser marcada
sem execução (P-15).

Convenção: `T-###` · `→` dependências · 🧪 teste que a prova · ⚠️ controle negativo obrigatório.

Os nomes em 🧪 são os **testes reais** desta implementação (`tests/unit/`), citados literalmente —
servem de gabarito do que o teste equivalente precisa afirmar, não de nome a copiar.

---

## Fase 1 — Esquema e isolamento

**A fase 1 não se pula.** Isolamento retroajustado significa auditar cada consulta já escrita, e a
que passar despercebida é a que vaza.

### T-001 · Tabelas do rastreamento
Criar `sites`, `pages`, `sessions`, `events` conforme [`data-model.md`](data-model.md), com as
restrições de checagem e os índices.

**Pronto quando:** clique sem subtipo é recusado **pelo armazenamento**, não só pela aplicação.
🧪 inserção direta violando `events_subtype_matches_type` falha.

### T-002 · Índice único de idempotência
→ T-001

**Pronto quando:** duas inserções com a mesma chave produzem uma linha.
⚠️ **Controle negativo:** remova o índice e confirme que o teste de idempotência falha. Se passar
sem o índice, ele nunca provou nada — a aplicação estava deduplicando sozinha, e isso não cumpre P-1.

### T-003 · Papel público com privilégio mínimo
→ T-001

Credencial separada, com escrita apenas no que ele grava. **Nenhum privilégio** sobre dados
pessoais.

**Pronto quando:** a tentativa de ler leads com essa credencial falha **por permissão**.
🧪 `it('o papel de analytics não consegue ler leads — é negativa do banco, não da interface')`
🧪 `it('o papel de analytics não consegue ler usuários, clientes nem submissões')`
🧪 `it('o papel de analytics não pode apagar eventos')`

### T-004 · Escopo por transação e políticas por site
→ T-003

**Pronto quando:**
- com o escopo do site A, dado do site B **não existe — com o id correto em mãos**;
- **sem escopo, toda tabela é vazia** (o padrão é negar).

🧪 `it('com o site A resolvido, o lead do RIVAL não existe — mesmo com o id em mãos')`
🧪 `it('não lê eventos de outro site')` · `it('não dá para plantar evento no site de outra conta')`
🧪 `it('sem site resolvido, a tabela inteira é vazia — o padrão é negar')`
⚠️ **Controle negativo:** troque a política por permissiva e confirme que **os dois** testes falham.

### T-005 · Massa de teste com três escopos
→ T-004

Três sites, ao menos dois em contas diferentes. Um site **dedicado à escrita**, separado dos que os
testes numéricos medem.

**Pronto quando:** os valores esperados estão escritos à mão, derivados da massa.

**Duas armadilhas já pagas:**
- **Fuso.** Quem responde "que dia é hoje" precisa ser a mesma fonte que a consulta usa. Massa
  ancorada em UTC com janela recortada em fuso local produz teste que passa em 21 horas do dia e
  falha em 3.
- **Site compartilhado.** Suíte que grava mirando site que outra suíte mede faz a ordem de execução
  mudar totais — e um teste numérico falha de forma intermitente.

---

## Fase 2 — Ingestão

### T-006 · Validação com esquema fechado
→ T-001

**Pronto quando:** `cta_click` sem subtipo é recusado; `uid` que não é UUID é recusado; campo
desconhecido é ignorado sem derrubar a requisição.
🧪 `it('recusa cta_click sem subtipo')` · `it('recusa uid que não seja UUID')`

### T-007 · Normalização de caminho
→ T-006

**Pronto quando:** `/planos`, `/planos/` e `/planos?x=1` produzem a mesma página; caminho sem barra
inicial é corrigido; a raiz é preservada.
🧪 `it('trata variações da mesma página como uma só')`

### T-008 · Resolução de página sem privilégio de atualização
→ T-007, T-003

"Insere, ignora conflito" seguido de leitura (D-15).

**Pronto quando:** funciona com o papel público **sem** privilégio de UPDATE na tabela de páginas.

### T-009 · Janela de sessão
→ T-008

**Pronto quando:** eventos próximos do mesmo visitante ficam na mesma sessão; após 30 min de
inatividade abre sessão nova; visitantes diferentes nunca compartilham sessão; evento atrasado não
empurra a sessão para trás.
🧪 `it('depois de 30 minutos de inatividade, abre uma sessão nova')`
🧪 `it('visitantes diferentes nunca compartilham sessão')`

### T-010 · Gravação idempotente do evento
→ T-002, T-009

**Pronto quando:** o mesmo `uid` reenviado grava uma linha; `uid`s diferentes do mesmo visitante
contam como cliques distintos.
🧪 `it('o mesmo uid reenviado grava uma linha só')`
🧪 `it('uids diferentes do mesmo visitante contam como cliques distintos')`

### T-011 · Carimbo defensivo
→ T-010

**Pronto quando:** relógio adiantado não planta evento no futuro nem reescreve passado remoto.
🧪 `it('não permite plantar evento no futuro')`

### T-012 · Marca de teste decidida no servidor
→ T-010

**Pronto quando:** evento com token de diagnóstico e **sem** a marca de teste é gravado como teste.
🧪 `it('um evento marcado como teste não altera os indicadores')`
⚠️ **Controle negativo:** faça o servidor confiar no campo do cliente e confirme que o teste falha.

---

## Fase 3 — Endpoint

### T-013 · Rota pública com a ordem obrigatória
→ T-012

A ordem de [`contratos/api-coleta.md`](contratos/api-coleta.md#ordem-de-processamento), sem inversão.

**Pronto quando:** cada código de resposta do contrato é produzido pela condição que o contrato
nomeia.

### T-014 · Corte de corpo antes da leitura
→ T-013

**Pronto quando:** corpo declarando mais de 16 KB é recusado **sem** o corpo ser lido.

### T-015 · CORS e conferência de origem
→ T-013

**Pronto quando:** origem de outro domínio é recusada; subdomínio é aceito; **origem ausente é
aceita**; `OPTIONS` responde 204.

### T-016 · Limite por site
→ T-013

Armazenamento compartilhado, incremento atômico, janela fixa, chave derivada do site **já
resolvido**, falha aberta.

**Pronto quando:** estourar o limite devolve 429 com `Retry-After`; com o armazenamento do limitador
indisponível, a requisição **passa** e o erro é registrado.
⚠️ **Controle negativo:** mova o contador para memória de processo e confirme que o teste de
concorrência falha. Se passar, o teste não está exercendo paralelismo — e um limitador que não
limita é pior que nenhum.

### T-017 · Cabeçalho de diagnóstico
→ T-013

**Pronto quando:** duplicata responde **204** com `X-Painel-Evento: duplicado`.

---

## Fase 4 — Coletor

### T-018 · Esqueleto e guarda de instalação dupla
**Pronto quando:** dois `<script>` iguais no mesmo documento produzem uma visualização.

### T-019 · Identificadores e origem
→ T-018

**Pronto quando:** o identificador de visitante sobrevive à navegação e **funciona em navegação
privativa** (caindo para valor de memória); as UTMs da primeira página valem para a sessão inteira.
🧪 navegar internamente não reescreve a origem.

### T-020 · Envio que sobrevive à navegação
→ T-019

**Pronto quando:** o envio usa `sendBeacon` (com queda para `fetch` com `keepalive`); o tipo de
conteúdo **não dispara** *preflight*; falha de rede é engolida.
🧪 clique que navega para fora do site ainda registra o evento.

### T-021 · Ouvinte de clique
→ T-020

Fase de captura, ancestral rastreável mais próximo, um evento por gesto.

**Pronto quando:**
- botão cujo manipulador chama `stopPropagation` continua sendo medido;
- link para WhatsApp **com** identificador declarado produz **um** evento;
- clique no `<span>` dentro do `<a>` é medido;
- clique em elemento não marcado não gera nada.

### T-022 · Visualização e troca de rota
→ T-020

**Pronto quando:** troca de rota sem recarregar produz visualização; repetir o mesmo caminho não.

### T-023 · Porta manual e consentimento
→ T-021

**Pronto quando:** a chamada manual produz evento; consentimento negado interrompe **toda** coleta
daquele documento.

### T-024 · O coletor quebrado não impede o clique
→ T-021

**Este é o teste mais fácil de esquecer e o mais caro de descobrir em produção** (A-11).

**Pronto quando:** com o coletor lançando exceção no ouvinte, o link continua navegando e o
formulário continua enviando.
⚠️ **Controle negativo:** acrescente um `preventDefault` e confirme que o teste falha.

---

## Fase 5 — Diagnóstico

### T-025 · Token com formato fechado
→ T-021

**Pronto quando:** texto livre no parâmetro **não** vira token.

### T-026 · Prazo de 30 minutos no navegador
→ T-025

**Pronto quando:** token vindo da URL reinicia a contagem; token vencido é **apagado** e a visita
segue normal; conteúdo ilegível no armazenamento não quebra o coletor.
⚠️ **Controle negativo:** remova a conferência de prazo e confirme que o teste de expiração falha.

### T-027 · Diagnóstico novo encerra os anteriores
→ T-025

### T-028 · Tela de verificação
→ T-027, T-013

**Pronto quando:** a verificação passa **por evento recebido com o token** — nunca por presença do
script no HTML, nunca por tempo decorrido (P-4).
⚠️ **Controle negativo:** faça-a passar por tempo decorrido e confirme que o teste falha.

---

## Fase 6 — Leituras

### T-029 · Definição única de elegibilidade
→ T-005

**Pronto quando:** existe **uma** definição de "evento elegível", compartilhada por toda leitura.
⚠️ **Controle negativo:** duplique a definição, mude uma cópia, e confirme que o teste de coerência
entre telas falha. Se não falhar, esse teste não existe — e ele é o que impede duas telas
discordarem (P-11).

### T-030 · Leitura por janela
→ T-029

**Pronto quando:** agrupa por botão dentro do período; identificador em mais de uma página mostra
"todas"; **o total fecha com o total de cliques da leitura por página** (A-10).

### T-031 · Inventário histórico
→ T-029

**Pronto quando:**
- **não** é recortado por período;
- mostra texto e posição **mais recentes**;
- ignora evento de teste;
- não enxerga botão de outro site;
- site sem clique devolve lista vazia, **não erro**.

🧪 `it('NÃO é recortado por período: o histórico inteiro entra')`
🧪 `it('mostra o texto MAIS RECENTE, não um qualquer')`
🧪 `it('ignora evento de teste: diagnóstico do operador não é botão de visitante')`
🧪 `it('não enxerga botão de outro site')`

### T-032 · Marca de detecção automática
→ T-031

**Pronto quando:** o botão sem nome declarado é distinguível do declarado, **sem heurística de
texto** (D-4).

---

## Fase 7 — Estado e interface

### T-033 · Derivação pura do estado
→ T-031

Função pura: agregados + instante + site ativo → estado. Fora da consulta, testável sem
armazenamento.

**Pronto quando, e todos são testes separados:**
- nomeado, posicionado e recebendo cliques está **apenas medindo**;
- detectado sem identificador é **"sem nome", não erro**;
- recém-aparecido é **"novo", e não cobra nada**;
- botão com volume e quinzena sem clique **parou de aparecer**;
- **botão SEM volume nunca some** — não havia regularidade para afirmar nada;
- **com o SITE parado, nenhum botão some** — o problema é outro, e é um só;
- **a borda do prazo não dispara antes da hora**; a do volume também não.

⚠️ **Controle negativo:** remova a trava de site ativo e confirme que o teste correspondente falha.
É a trava que evita apontar sete problemas onde existe um (P-14).

### T-034 · Precedência e ordenação
→ T-033

**Pronto quando:** **sumiço vence "sem nome"** — o botão quebrado importa antes do mal nomeado; a
ordenação é por urgência e só depois por volume; a função **não altera** o array recebido.
🧪 `it('sumiço vence "sem nome": o botão quebrado importa antes do mal nomeado')`

### T-035 · Próxima ação para todo estado
→ T-033

**Pronto quando:** todo estado tem rótulo e ação, **sem texto vazio**. Estado sem próxima ação é só
um rótulo bonito.
🧪 `it('tem rótulo e ação, sem texto vazio')`

### T-036 · Telas
→ T-034, T-030

**Pronto quando:**
- a tela declara que **botão nunca clicado não aparece** (P-7);
- clique em WhatsApp aparece como **intenção de contato** (P-13);
- todo teto de linhas exibe o total (P-12);
- **nenhum componente calcula número** (RF-037);
- **o caminho começa pelo clique** — há um link que leva até a tela (D-16).

⚠️ **Controle negativo:** remova o link de navegação e confirme que o teste falha. Se ele montar a
URL à mão, prova o mecanismo e esconde a tela inalcançável.

### T-037 · Resumo do inventário
→ T-034

**Pronto quando:** conta separadamente o que **exige ação** e o que está bem; inventário vazio não
quebra e **não afirma nada**.

---

## Fase 8 — Detecção de coletor duplicado

### T-038 · Consulta de visualizações repetidas
→ T-029

**Pronto quando:** duas visualizações da mesma sessão e página em menos de 2 s acusam;
**visualizações espaçadas não acusam nada**; **sessões diferentes no mesmo instante não são
duplicação**.
🧪 `it('duas visualizações da mesma sessão em menos de 2s acusam coletor duplicado')`
🧪 `it('sessões DIFERENTES no mesmo instante não são duplicação')`

### T-039 · Exibição com a explicação do prejuízo
→ T-038

**Pronto quando:** a tela diz **o que dobra** — visualizações, páginas por sessão — e que a conversão
cai pela metade sem nada ter piorado. Ninguém desconfia de um número que só subiu (D-18).

---

## Fase 9 — Publicação

### T-040 · Ordem de migração conferida
→ tudo

**Pronto quando:** migração **aditiva** vai antes do código; migração **restritiva** vai depois do
código publicado e confirmado no ar (plan §7).

### T-041 · Verificação em produção
→ T-040

**Pronto quando:** a política de segurança de conteúdo é medida no **pacote publicado**, nunca em
desenvolvimento (D-17); o domínio de produção serve o commit enviado.

---

## Definição de pronto — o conjunto

A implementação está completa quando as 12 afirmações de
[`spec.md` §6](spec.md#6-critérios-de-aceite-do-conjunto) passam, **executadas**.

Três lembretes que o histórico deste projeto justifica:

1. **Todo controle negativo marcado acima é obrigatório.** Salvaguarda que não falha quando quebrada
   não está sendo testada.
2. **Teste que constrói o caminho que o usuário não tem** prova o mecanismo e esconde a tela
   quebrada (D-16).
3. **Postergar a fase 1** significa auditar cada consulta já escrita depois — e a que passar
   despercebida é a que vaza.
