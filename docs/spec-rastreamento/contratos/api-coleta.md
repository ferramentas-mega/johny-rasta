# Contrato HTTP — endpoint de coleta

`POST /api/collect` · público · sem autenticação

O coletor roda no navegador do visitante. Não há segredo possível aqui: o identificador do site está
no HTML de quem instalou. O contrato é desenhado para isso.

---

## Requisição

```
POST /api/collect
Content-Type: text/plain;charset=UTF-8
Origin: https://site-do-cliente.com.br
```

**`text/plain` é deliberado** (D-2): `application/json` torna a requisição "não simples" e dispara
*preflight* `OPTIONS` — um ida-e-volta extra entre o clique e a abertura do WhatsApp. O corpo é
JSON; o servidor analisa manualmente.

### Corpo

```json
{
  "site": "sit_a1b2c3d4",
  "tipo": "cta_click",
  "subtipo": "whatsapp",
  "uid": "8f14e45f-ceea-4c3b-9f1a-2b7d9e0c1a55",
  "visitante": "3d9b1c77-2e4a-4f55-8a01-9c2d3e4f5a6b",
  "caminho": "/planos",
  "ocorridoEm": "2026-09-16T14:22:31.004Z",
  "dispositivo": "Celular",
  "botaoId": "cta-whatsapp-hero",
  "botaoTexto": "Falar no WhatsApp",
  "botaoPosicao": "Hero",
  "referenciador": "https://www.google.com/",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "institucional",
  "diagnostico": "diag_9f2a1b3c",
  "teste": true
}
```

| Campo | Tipo | Obrig. | Regra |
|---|---|---|---|
| `site` | texto 4–64 | **sim** | Identificador público |
| `tipo` | enum | **sim** | `page_view` · `cta_click` |
| `subtipo` | enum | condicional | **Obrigatório** quando `cta_click`. Enum fechado |
| `uid` | UUID | **sim** | Chave de idempotência **do gesto** |
| `visitante` | texto 8–64 | **sim** | Identificador do navegador |
| `caminho` | texto 1–512 | **sim** | Normalizado pelo servidor |
| `ocorridoEm` | ISO 8601 | não | Substituído se implausível |
| `dispositivo` | enum | não | `Celular` · `Tablet` · `Desktop` |
| `botaoId` | texto ≤128 | não | Declarado, ou `auto:<subtipo>` |
| `botaoTexto` | texto ≤160 | não | Rótulo no momento do clique |
| `botaoPosicao` | texto ≤64 | não | **Rótulo**, nunca coordenada |
| `referenciador` | texto ≤256 | não | Só se for de outra origem |
| `utmSource` / `Medium` / `Campaign` | texto ≤128 | não | Da **primeira** página da sessão |
| `diagnostico` | `diag_[a-f0-9]{8,64}` | não | Formato fechado |
| `teste` | booleano | não | **Não é a palavra final** — ver abaixo |

**Campos desconhecidos são ignorados.** Texto livre tem caracteres de controle removidos e é cortado
no limite, em vez de recusar a requisição inteira.

**`teste` não é a palavra final.** Se `diagnostico` está presente, o evento **é** teste,
independentemente do que este campo diga (P-3).

**`cta_click` sem `subtipo` é recusado**, e não recebe um subtipo padrão inventado: um clique que
não se sabe classificar não tem como declarar seu escopo no relatório (RF-018).

---

## Respostas

| Código | Quando | Corpo | O coletor deve |
|---|---|---|---|
| **204** | Registrado **ou duplicado** | vazio | Nada. Não repetir |
| **400** | JSON malformado ou validação | `{erro, detalhes[]}` | Não repetir |
| **403** | Origem não corresponde ao site | `{erro}` | Não repetir |
| **404** | Site inexistente ou arquivado | `{erro}` | Não repetir |
| **413** | Corpo maior que 16 KB | `{erro}` | Não repetir |
| **429** | Limite do site estourado | `{erro}` + `Retry-After` | Não repetir; o evento se perde |
| **503** | Credencial de coleta ausente | `{erro}` | Não repetir |
| **500** | Falha ao gravar | `{erro}` | Não repetir |

**Duplicata responde 204, e isso é decisão** (P-8): pedir ao coletor que tente de novo por causa de
idempotência seria pior que perder a informação. Do lado de dentro o duplicado é reconhecido e
nomeado, não confundido com gravação nova:

```
X-Painel-Evento: registrado | duplicado
```

Cabeçalho de diagnóstico para quem está instalando. **Não muda o código de resposta**, justamente
para o coletor não repetir.

**O coletor não trata nenhum código.** Todos são fim de linha — ele nunca repete por conta própria
(P-6, RNF-001). Os códigos existem para quem depura instalação, com as ferramentas do navegador
abertas.

**503 é só deste endpoint.** A coleta tem credencial própria; sem ela, este endpoint para e o painel
continua funcionando com a credencial de leitura. Prender o painel à credencial do coletor acoplaria
duas coisas que existem separadas justamente para terem privilégios diferentes.

---

## CORS

```
Access-Control-Allow-Origin:  <eco da origem recebida>
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age:       86400
Vary:                         Origin
```

**Eco da origem, e não `*`**, para que o navegador aceite a resposta caso o coletor venha a precisar
de credenciais.

`OPTIONS` responde 204 com os mesmos cabeçalhos. Na prática o coletor não o dispara — é isso que
`text/plain` compra —, mas o método existe para quem envia de outro jeito.

### Conferência de origem

Aceita quando o host da origem é o domínio do site, ou subdomínio dele (`www.` ignorado nos dois
lados), ou uma das páginas de teste do próprio painel.

**Origem ausente é aceita.** `sendBeacon` de mesma origem, e alguns navegadores, não a enviam.
Recusar quebraria coleta legítima — e a conferência de origem não é o que protege o endpoint (o
identificador é público de qualquer forma). Ela evita o caso trivial: alguém colando o script num
domínio que não é dele.

---

## Ordem de processamento

Obrigatória. Cada passo está aqui por um motivo, e inverter quebra alguma coisa:

```
1. tamanho pelo cabeçalho  → 413    antes de ler o corpo
2. analisar JSON           → 400
3. validar esquema         → 400
4. credencial configurada? → 503
5. abrir transação
6. resolver site + FIXAR ESCOPO → 404
7. conferir origem         → 403    (precisa do domínio do passo 6)
8. cobrar limite do site   → 429    (chave derivada do site do passo 6)
9. gravar página → sessão → evento
10.                        → 204
```

**O passo 1 antes do 2** porque ler o corpo carrega tudo na memória.
**O passo 6 antes do 7 e do 8** porque antes disso não há domínio para comparar nem site para cobrar
— cobrar pelo identificador cru deixaria qualquer um encher a tabela de contadores com ids
inventados.
**O escopo fixado dentro do passo 6**, não depois: as escritas seguintes precisam dele para passar
na política (P-10).

---

## Limites

| O quê | Valor | Raciocínio |
|---|---|---|
| Corpo | 16 KB | Um evento tem algumas centenas de bytes. Folga larga |
| Taxa | 600/min por site | Dez por segundo, sustentado. Passar disso é script solto ou falsificação |

O limitador **falha aberto** (RNF-007): armazenamento indisponível libera a requisição e registra o
erro.

---

## O que este contrato não protege

Dito explicitamente para que ninguém acredite no contrário:

- **O identificador do site é público.** Quem o tem envia eventos daquele site. É da natureza de um
  coletor no navegador.
- **A conferência de origem é falsificável** por quem não usa navegador.
- **A idempotência não impede inflar contagem** — basta gerar chaves novas.

Quem contém abuso é o **limite por site**. O que o isolamento garante é o alcance de um **erro**: no
máximo um site, nunca a base (D-10).
