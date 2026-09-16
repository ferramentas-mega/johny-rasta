# Rastreamento de botões — especificação portável

Conjunto de documentos em **SDD** (*Spec-Driven Development*) para reimplementar o rastreamento de
cliques em botões — o que hoje é o `t.js`, o `/api/collect` e as duas leituras de `events` — **em
outro aplicativo**, possivelmente com outra linguagem, outro banco e outro framework.

Não é um tutorial de instalação. Para instalar o coletor num site de cliente, veja
[`docs/instalacao-rastreamento.md`](../instalacao-rastreamento.md). Para as definições das métricas
já em produção, [`docs/metricas.md`](../metricas.md).

---

## Os documentos, e a ordem de leitura

| Documento | Responde | Quando ler |
|---|---|---|
| [`constitution.md`](constitution.md) | O que **nunca** pode ser violado | Antes de tudo. É o filtro de toda decisão posterior |
| [`spec.md`](spec.md) | **O QUÊ**: requisitos e critérios de aceite | Para saber o que construir |
| [`research.md`](research.md) | **POR QUÊ**: decisões e o que foi recusado | Quando discordar de um requisito |
| [`plan.md`](plan.md) | **COMO**: arquitetura e adaptação por stack | Antes de escrever código |
| [`data-model.md`](data-model.md) | Tabelas, restrições, índices, isolamento | Ao criar o esquema |
| [`contratos/coletor.md`](contratos/coletor.md) | Contrato do navegador (HTML e API) | Ao escrever o script de coleta |
| [`contratos/api-coleta.md`](contratos/api-coleta.md) | Contrato HTTP do endpoint | Ao escrever o servidor |
| [`tasks.md`](tasks.md) | Tarefas ordenadas e verificáveis | Para executar |

`spec.md` **não** contém escolha de tecnologia — essa separação é o ponto do SDD. Se você encontrar
"Postgres" ou "Next.js" dentro dele, é defeito da especificação, não licença.

---

## Invariante × vínculo de stack

Todo requisito está marcado com um dos dois:

- 🔒 **INVARIANTE** — vale em qualquer implementação. Violar muda o que o produto **afirma**, não
  como ele é construído. São os requisitos que custaram defeito real aqui.
- 🔧 **VÍNCULO** — é a forma que esta implementação deu ao invariante. Outro stack resolve de outro
  jeito, desde que o invariante correspondente continue valendo. Cada vínculo nomeia o invariante
  que serve.

Exemplo da diferença: "um gesto do usuário nunca vira dois eventos" é invariante; "índice único em
`events.event_uid` com `on conflict do nothing`" é o vínculo. Quem usar MongoDB resolve com outra
coisa — mas se resolver com `select` antes do `insert`, quebrou o invariante, porque entre um e
outro cabe outra requisição.

---

## O que esta especificação assume, e o que ela não sabe

**Assume** que o aplicativo de destino tem: um endpoint HTTP público alcançável pelo navegador do
visitante, um armazenamento transacional, e um conceito de "site" (ou propriedade, ou projeto)
endereçável por um identificador público.

**Não sabe** qual é o stack de destino. Onde a escolha importa, o `plan.md` traz uma matriz de
adaptação em vez de fingir que só existe um caminho. Onde a escolha **não** importa porque o
invariante decide sozinho, a especificação diz isso e não abre alternativa.

**Não cobre** o que este projeto decidiu não fazer, e o motivo está em `research.md`: mapa de calor,
replay de sessão, identificação de pessoa, e coleta de conteúdo de formulário pelo coletor de
analytics. As três primeiras não dão para fazer com este modelo de dado; a quarta é proibida pela
constituição.

---

## Escala do que está sendo especificado

Para calibrar esforço, o que existe hoje neste repositório e que os documentos descrevem:

| Peça | Tamanho |
|---|---|
| Coletor no navegador (`public/t.js`) | ~310 linhas, sem dependência, sem build |
| Endpoint de coleta | ~135 linhas |
| Ingestão (validação, sessão, gravação) | ~260 linhas, compartilhada com formulários |
| Leitura por janela + inventário | ~2 consultas SQL |
| Derivação de estado dos botões | ~185 linhas puras, testáveis sem banco |

Não é um sistema grande. O que é grande é a lista de coisas que dão errado em silêncio — e é dela
que `constitution.md` e `research.md` tratam.
