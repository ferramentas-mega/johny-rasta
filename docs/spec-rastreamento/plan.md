# Plano técnico

**COMO.** O que [`spec.md`](spec.md) exige, traduzido em arquitetura — com matriz de adaptação onde
a escolha de stack importa, e sem alternativa onde o invariante decide sozinho.

---

## 1. Peças, e de quem é a responsabilidade

```
  navegador do visitante            servidor público              armazenamento
 ┌───────────────────────┐        ┌──────────────────┐         ┌────────────────┐
 │ coletor (1 arquivo)   │  POST  │ endpoint /collect│         │ sites          │
 │  • ouvinte de clique  │ ─────► │  • tamanho       │ ──────► │ pages          │
 │  • uid por gesto      │  204   │  • validação     │  tx     │ sessions       │
 │  • prazo do token     │ ◄───── │  • origem        │         │ events         │
 │  • sendBeacon         │        │  • limite/site   │         │ rate_limits    │
 └───────────────────────┘        │  • escopo do site│         └────────────────┘
                                  └──────────────────┘                 │
                                                                       │ leitura
  painel (autenticado)                                                 ▼
 ┌────────────────────────────────────────────────────────────────────────────┐
 │ leitura por janela  ──► tabela por botão (período)                         │
 │ inventário          ──► estado derivado (puro, testável sem armazenamento) │
 │ detecção duplicada  ──► páginas com visualização repetida                  │
 └────────────────────────────────────────────────────────────────────────────┘
```

**A fronteira que importa:** a derivação de estado dos botões é **pura** — recebe os agregados e
devolve o estado. Sem isso, cada regra de "parou de aparecer" exigiria subir armazenamento para ser
testada, e as regras deixariam de ser testadas.

---

## 2. Matriz de adaptação por stack

| Necessidade | Vínculo atual 🔧 | Invariante que serve 🔒 | Como adaptar |
|---|---|---|---|
| Dedup atômica | Índice único + `on conflict do nothing` | P-1 | Qualquer restrição de unicidade com escrita condicional atômica. **Nunca** leitura seguida de escrita |
| Isolamento | RLS `FORCE` + variável de transação | P-10 | Se o armazenamento não tem política por linha: uma camada de acesso que **não aceita** consulta sem escopo. Filtro voluntário no código não cumpre |
| Menor privilégio | Papel de banco sem GRANT em dados pessoais | RNF-008 | Credencial separada do endpoint público, com permissão só no que ele escreve |
| Limite de taxa | Tabela + função atômica | RNF-006 | Qualquer armazenamento compartilhado (Redis etc.). **Nunca** memória de processo |
| Transação | Transação por requisição, escopo local a ela | P-10 | Onde não houver transação, o escopo precisa ser argumento obrigatório de toda consulta |
| Validação | Esquema declarativo com enums fechados | RF-018 | Qualquer validador. Enum fechado, nunca texto livre em subtipo |
| Coletor | JS puro, sem *build* | RNF-004 | Não adapte. Ver §3 |

**Duas linhas não são negociáveis, e valem repetir:**

1. **Dedup por leitura-e-escrita não cumpre P-1**, em nenhum stack. Entre uma e outra cabe outra
   requisição.
2. **Filtro por escopo escrito à mão em cada consulta não cumpre P-10.** O ponto é que o padrão seja
   negar quando alguém esquecer — e alguém vai esquecer.

---

## 3. O coletor

**Não adapte para o framework do painel.** Ele roda no site de terceiro, sob a política de segurança
**deles**. Toda dependência é uma chance a mais de ser bloqueado, e o bloqueio é silencioso: o site
fica no ar, o relatório fica vazio, e não há erro em lugar nenhum.

Requisitos de forma:
- Arquivo único, JS puro, servido estático. Sem *bundler*, sem *polyfill*, sem CDN de terceiro.
- Envolto em função imediatamente invocada com guarda de instalação dupla.
- Toda leitura de armazenamento do navegador dentro de `try`/`catch` — navegação privativa e
  bloqueio de site data são casos normais, não excepcionais.
- Nenhuma exceção escapa. Uma exceção não tratada num ouvinte global pode quebrar comportamento da
  página hospedeira.

**Ordem interna, que também é a ordem de leitura do arquivo:**

1. Guarda de instalação dupla
2. Descoberta do próprio `<script>` e do identificador do site
3. Resolução do token de diagnóstico **com prazo**
4. Consentimento
5. Identificadores (visitante, gesto)
6. Origem — capturada **uma vez**, na primeira página (RF-009)
7. Envio
8. Visualização de página, com interceptação de troca de rota
9. Ouvinte de clique
10. Porta manual

O passo 3 antes do 5 não é acidente: se o token for inválido ou vencido, ele precisa ser descartado
antes de qualquer evento ser montado.

---

## 4. O endpoint

Ordem obrigatória, e cada passo está aqui por um motivo:

| # | Passo | Se inverter |
|---|---|---|
| 1 | Recusar corpo grande demais, **pelo cabeçalho**, antes de ler | Ler o corpo carrega dezenas de MB na memória só para a validação dizer que é inválido |
| 2 | Analisar o texto como JSON, em `try` | Corpo malformado vira exceção não tratada |
| 3 | Validar com esquema fechado | — |
| 4 | Conferir que a credencial do coletor existe | Sem ela, o endpoint precisa **parar**, e só ele. O painel segue com a credencial de leitura |
| 5 | Abrir transação com o papel público | — |
| 6 | Resolver o site pelo identificador público **e fixar o escopo** | Fixar depois deixaria as escritas seguintes fora da política |
| 7 | Conferir a origem contra o domínio do site | Antes do passo 6 não há domínio para comparar |
| 8 | Cobrar o limite, **com a chave derivada do site resolvido** | Cobrar pelo identificador cru deixa qualquer um encher a tabela de contadores com ids inventados |
| 9 | Gravar (página → sessão → evento) | — |

**Respostas:** ver [`contratos/api-coleta.md`](contratos/api-coleta.md).

---

## 5. A ingestão

Três escritas em sequência, na mesma transação:

**Página.** Normaliza o caminho (D-14), depois "insere, ignora conflito" seguido de leitura. Não
usa "insere ou atualiza": exigiria privilégio de escrita que não é necessário (D-15).

**Sessão.** Procura sessão aberta do mesmo visitante, mesmo estado de teste, dentro da janela de 30
minutos. Ao atualizar o último instante visto, usa o **maior** entre o guardado e o novo — um evento
atrasado não pode empurrar a sessão para trás.

A sessão separa por estado de teste de propósito: uma sessão de diagnóstico e uma sessão real do
mesmo navegador não podem se misturar.

**Evento.** Insere ignorando conflito na chave de idempotência. **A ausência de linha retornada é a
informação** — é assim que se sabe que era duplicata.

O carimbo do evento é do cliente **se for plausível**: fora da janela aceitável, vale o do servidor
(RF-019).

A marca de teste é recalculada aqui, no servidor (P-3). Não se confia na que veio.

---

## 6. As leituras

**Definição única de elegibilidade.** Sessões da janela que não são teste, e os eventos delas.
Toda leitura parte daí — uma cópia por consulta divergiria na primeira correção feita só numa
(P-11).

**Leitura por janela.** Agrupa por identificador do botão dentro do período. Quando o mesmo
identificador aparece em mais de uma página, a coluna de página diz "todas" em vez de escolher uma.

**Inventário.** Sem recorte de período (D-5). Agrega por identificador do botão sobre o histórico
inteiro do site, excluindo teste, e traz: subtipo, texto e posição **mais recentes**, contagem de
páginas distintas, total de cliques, primeiro e último instante.

Texto e posição mais recentes exigem agregação ordenada por instante — não "qualquer um" (RF-026).

**Derivação de estado.** Pura, fora da consulta. Recebe os agregados, o instante atual e se o site
está ativo; devolve o estado. A ordem das perguntas **é** a precedência (RF-029), e ela é decisão de
produto — não otimização.

**Detecção de coletor duplicado.** Janela móvel sobre visualizações da mesma sessão e página,
comparando cada uma com a anterior. Acusa diferenças menores que dois segundos (D-18).

---

## 7. Ordem de publicação

Duas assimetrias opostas, e inverter qualquer uma derruba a coleta **sem erro visível para quem
preenche o formulário**:

| Tipo de migração | Ordem | Por quê |
|---|---|---|
| **Aditiva** (cria tabela, coluna, índice) | Migração **antes** do código | O código novo precisa do objeto. O código antigo ignora o que não conhece |
| **Restritiva** (aperta política, adiciona obrigatoriedade) | Código **antes** da migração | A política nova exige algo que só o código novo faz. Aplicada contra o código antigo, a coleta para em silêncio |

Para a política de escopo por site, concretamente: **publique o código que fixa o escopo, confirme
que está no ar, e só então aplique a migração que passa a exigi-lo.**

---

## 8. Estratégia de testes

Três camadas, e a de baixo é a que mais paga:

**Puros, sem armazenamento.** Derivação de estado, normalização de caminho, precedência, ordenação,
resumo. É aqui que as bordas são exercidas: o dia 14 exato, o décimo clique exato. *A borda não
dispara antes da hora* é um teste.

**Com armazenamento, contra massa fixa.** Idempotência, janela de sessão, isolamento, inventário
histórico, detecção de duplicata. Os valores esperados ficam **escritos à mão**, derivados da massa
— se uma consulta mudar de comportamento, o teste falha, que é o objetivo.

**De navegador, contra o pacote publicado.** O caminho que o operador percorre, começando pelo
clique (D-16). A política de segurança só existe em produção (D-17).

**Três regras que valem para as três camadas:**

1. **Controle negativo obrigatório** (P-15). Quebre a salvaguarda e confirme que exatamente os
   testes certos falham. Salvaguarda que não falha quando quebrada não está sendo testada.
2. **Teste de isolamento com o identificador correto em mãos.** Não basta "não aparece na lista" —
   tem de ser "não existe, mesmo pedindo pelo id".
3. **Teste com três escopos, não um.** Um esconde todo defeito de isolamento; dois escondem o
   vazamento que só vai num sentido.

**Armadilha de massa de teste já paga aqui:** massa ancorada num fuso e janela recortada em outro
produz teste que passa em 21 horas do dia e falha em 3. Quem responde "que dia é hoje" precisa ser a
mesma fonte que a consulta usa.

---

## 9. Sequência de implementação

Cada fase termina com algo verificável. Detalhamento em [`tasks.md`](tasks.md).

| Fase | Entrega | Verificável por |
|---|---|---|
| 1 | Esquema e isolamento | Escrita fora do escopo falha; sem escopo, leitura vazia |
| 2 | Ingestão | Idempotência e janela de sessão, contra armazenamento |
| 3 | Endpoint | Códigos de resposta do contrato |
| 4 | Coletor | Clique real vira linha; coletor quebrado não impede o clique |
| 5 | Diagnóstico com prazo | Evento de teste não altera indicador; token vence |
| 6 | Leituras | Os dois totais fecham; inventário é histórico |
| 7 | Estado e interface | Precedência; a tela declara o que não sabe |
| 8 | Duplicata e limite | Duas tags acusam; limite por site |

**A fase 1 vem antes de tudo e não se pula.** Isolamento retroajustado significa auditar cada
consulta já escrita — e a que passar despercebida é a que vaza.
