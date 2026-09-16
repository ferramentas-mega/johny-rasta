# Contrato do coletor (navegador)

O que a página do cliente precisa conter, e o que o coletor promete em troca. É a interface pública
do subsistema — mudança aqui quebra site de terceiro em silêncio.

---

## Instalação

```html
<script async src="https://SEU-PAINEL/t.js" data-site="sit_xxxxxxxx"></script>
```

| Atributo | Obrigatório | O que faz |
|---|---|---|
| `data-site` | **sim** | Identificador público do site. Sem ele o coletor avisa no console e **não inicia** |
| `data-endpoint` | não | Sobrescreve o destino. Por padrão, a origem de onde o script foi servido |
| `data-teste` | não | `"true"` marca tudo como teste. Para páginas de demonstração |
| `data-consentimento` | não | `"negado"` desliga a coleta |

`async` é parte do contrato: o coletor nunca bloqueia a renderização da página hospedeira.

---

## Marcação de botões

```html
<a href="https://wa.me/5511999999999"
   data-track-id="cta-whatsapp-hero"
   data-track-sub="whatsapp"
   data-track-pos="Hero">Falar no WhatsApp</a>
```

| Atributo | Limite | O que decide |
|---|---|---|
| `data-track-id` | 128 | **O nome no relatório.** Sem ele, o coletor agrupa em `auto:<subtipo>` |
| `data-track-sub` | enum | `whatsapp` · `phone` · `email` · `form_open` · `outro`. Sem ele, deduzido do `href` |
| `data-track-pos` | 64 | **Rótulo** de lugar: "Hero", "Rodapé", "Preços" |
| `data-track-texto` | 160 | Sobrescreve o texto capturado. Use quando o rótulo é dinâmico |

### Três regras de quem escreve a marcação

**1. `data-track-id` único por botão físico.** O mesmo valor em botões diferentes vira **uma linha
só** no relatório, e a comparação entre posições morre (P-9). O sistema não acusa isso — mostra a
contagem de páginas distintas como pista.

**2. `data-track-pos` estável ao longo do tempo.** É por ele que se compara "o topo converte mais
que o rodapé". Renomear "Hero" para "Topo" numa revisão cria uma segunda série que parece um botão
novo.

**3. `data-track-texto` quando o rótulo é dinâmico.** O texto visível vai para o relatório (limitado
a 160 caracteres). Se ele contém valor calculado, nome de pessoa, ou qualquer coisa que não deveria
sair da página, **sobrescreva** — P-2 é responsabilidade compartilhada.

---

## O que é capturado sem marcação nenhuma

Links para WhatsApp (`wa.me`, `api.whatsapp.com`, `whatsapp://`), telefone (`tel:`) e e-mail
(`mailto:`) são detectados sozinhos.

O clique **conta**. O que falta é o nome legível: todos os links de WhatsApp da página viram
`auto:whatsapp`, uma linha só. O inventário mostra isso como estado "Sem nome", com a instrução do
que acrescentar.

**Nada além disso é capturado.** Clique em elemento não marcado e que não é um desses links não
gera evento algum.

---

## Porta manual

Para botão que não é link — `<div>` com `onclick`, abertura de modal, envio por JavaScript próprio:

```js
window.painel.evento('form_open', {
  botaoId: 'orcamento-modal',
  botaoTexto: 'Pedir orçamento',
  botaoPosicao: 'Preços',
});
```

Também expostos:

```js
window.painel.visitante()    // identificador do navegador, para ligar um envio à sessão
window.painel.diagnostico()  // token do diagnóstico em andamento, ou null
```

**`visitante()` NÃO é identidade pessoal.** É um valor rotativo, para ligar um envio de formulário à
sessão de analytics. Usá-lo como chave de cliente é erro de leitura do contrato.

---

## O que o coletor promete

| Promessa | O que significa na prática |
|---|---|
| **Nunca atrapalhar** | Nenhum `preventDefault`. Nada aguardado antes de navegar. Falha de rede engolida |
| **Um gesto, um evento** | Cada clique carrega um identificador próprio; repetição é descartada no servidor |
| **Nada de dado pessoal** | Não lê `input`, `textarea` nem `select`. Nome, e-mail e telefone só pelo endpoint de formulários |
| **Instalado duas vezes, desiste** | A segunda instância no mesmo documento não duplica nada |
| **Sem dependência** | JS puro, sem *build*, sem CDN de terceiro |

---

## O que o coletor NÃO faz

- **Não lê formulário** (P-2).
- **Não grava cookie.** Usa armazenamento do navegador para o identificador de visitante e
  armazenamento de sessão para o token de diagnóstico.
- **Não identifica pessoas.** Nem entre dispositivos.
- **Não captura posição de ponteiro, rolagem ou mutação de DOM.** Não há mapa de calor nem replay, e
  não dá para derivar nenhum dos dois deste dado (D-9).
- **Não busca nada da rede além do próprio envio.**

---

## Consentimento

Duas formas, ambas respeitadas antes de qualquer envio:

```js
window.painelConsentimento = false;           // em qualquer ponto, antes do clique
```
```html
<script src="…/t.js" data-site="…" data-consentimento="negado"></script>
```

**A armadilha, e ela é comum:** banner de consentimento que bloqueia o carregamento do script deixa
a página no ar e o relatório vazio, **sem erro em lugar nenhum**. Decida isso ao desenhar a página,
não depois de o cliente perguntar por que não há dados.

---

## Diagnóstico de instalação

O operador abre o site pelo link do painel, que acrescenta `?painel_diag=diag_<hex>`.

- **Formato fechado.** Texto livre no parâmetro é ignorado — não vira token.
- **Prazo de 30 minutos**, aplicado aqui, antes do envio (P-5).
- **Sobrevive à navegação** entre páginas do site; morre quando a aba fecha.
- **Todo evento com token nasce como teste**, e o servidor reforça isso (P-3).

> **Nunca cole esse link em grupo.** Enquanto o token vale, visitas **reais** que chegarem por ele
> são marcadas como teste e somem dos relatórios — em silêncio, que é o pior tipo de perda.

---

## Armadilhas que deixam a página invisível

Nenhuma delas dá erro. Todas já aconteceram.

| Armadilha | Sintoma | O que fazer |
|---|---|---|
| **Formulário em iframe de outro domínio** | O lead chega no serviço, não no painel | O serviço precisa entregar o envio ao endpoint de formulários. Não há conector automático |
| **Navegação sem recarregar** | Só o primeiro `page_view` sai | O coletor intercepta troca de rota; confirme que a sua o dispara |
| **Banner bloqueia o script** | Página no ar, relatório vazio | Decidir no desenho |
| **Botão é `<div>` com `onclick`** | Nada é medido | Marque igual — o coletor usa o atributo, não a tag |
| **Mesmo `data-track-id` repetido** | Vira um número só | Identificador único por botão |
| **Coletor instalado duas vezes** (layout + plugin) | Visualizações dobram, conversão cai pela metade | O inventário acusa (RF-032) |

**Verificar não é olhar o HTML.** Script bloqueado por política de segurança, consentimento ou
extensão **está no HTML e não mede nada**. Quem verifica é evento recebido (P-4).
