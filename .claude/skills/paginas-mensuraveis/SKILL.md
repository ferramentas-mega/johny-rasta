---
name: paginas-mensuraveis
description: Monta o prompt de design de uma PÁGINA DE CLIENTE que o Painel de Sites consegue medir — seções, marcação dos botões, formulário e as armadilhas que deixam a página bonita e invisível. Use ao criar site ou landing page para um cliente que será acompanhado neste painel.
---

# Prompt de página que o painel consegue medir

Adaptado de um "arquiteto de prompt de UI" genérico. O que veio de lá é a
estrutura — contexto, direção visual, layout, seções, componentes, regras
visuais, interação. O que muda é **para que serve**, e isso muda quase tudo.

---

## O que este projeto NÃO é

A receita original mira página de marketing SaaS: herói, seção de recursos,
preços, rodapé. **O Painel de Sites não tem nada disso.** Toda tela dele fica
atrás de autenticação, carrega `noindex` e nenhuma é feita para busca — não há
`sitemap.xml` e não deve haver.

Então gerar prompt de landing page *para o painel* é resolver um problema que
não existe. O uso real é o outro lado: **as páginas de cliente**, que o painel
mede. É para elas que esta skill existe.

E daí sai a primeira regra, que a receita genérica atropelaria: **a identidade
Matrix é do PAINEL, não do cliente.** A página do cliente usa a marca do
cliente. Nada de verde sobre preto por padrão.

---

## O que o painel mede

Esta é a lista inteira. Uma seção que não produz um destes eventos é uma seção
que o relatório não enxerga — e aí a página pode estar convertendo sem que
ninguém consiga mostrar.

| Evento | O que é |
|---|---|
| `page_view` | carregamento de página |
| `cta_click` · `whatsapp` | clique que leva ao WhatsApp |
| `cta_click` · `phone` | clique em telefone |
| `cta_click` · `email` | clique em e-mail |
| `cta_click` · `form_open` | abertura de formulário |
| `cta_click` · `outro` | demais botões marcados |
| `form_submit_success` | envio de formulário concluído |

Ao desenhar as seções, a pergunta de cada uma é: **qual destes ela produz?** Um
herói bonito sem caminho de contato não produz nenhum.

---

## O contrato de marcação

Isto vai dentro do prompt gerado, não fica para depois. Página entregue sem a
marcação vira trabalho de garimpo no HTML alheio.

**Coletor**, antes de `</head>` ou no fim do `<body>`:

```html
<script async src="https://SEU-PAINEL/t.js" data-site="PUBLIC_ID"></script>
```

**Botões**, para aparecerem no inventário com nome e posição:

```html
<a href="https://wa.me/55…"
   data-track-id="cta-whatsapp-hero"
   data-track-sub="whatsapp"
   data-track-pos="Hero">Falar no WhatsApp</a>
```

- `data-track-id` — o nome no relatório. Sem ele o coletor inventa um
  `auto:<subtipo>`, e todos os botões de WhatsApp da página viram um só.
- `data-track-sub` — `whatsapp`, `phone`, `email`, `form_open` ou `outro`.
- `data-track-pos` — **rótulo** de onde o botão está ("Hero", "Rodapé",
  "Preços"). É texto que você escreve, não coordenada: o painel não tem mapa de
  calor e não vai ter com este dado. Escolha rótulos estáveis, porque é por eles
  que se compara "o botão do topo converte mais que o do rodapé".

**Formulário**, o jeito curto:

```html
<script async src="https://SEU-PAINEL/f.js" data-site="PUBLIC_ID"></script>
```

O `f.js` escuta o envio de qualquer formulário da página e reconhece nome,
e-mail, telefone e mensagem pelos padrões usuais dos campos. Não precisa mexer
no HTML do formulário. Para excluir um, `data-painel-ignorar` nele; para nomear,
`data-painel-nome="Orçamento"`. Se o envio for por JavaScript próprio, chame
`painelFormulario.enviar({ nome, email, formulario })`.

Ele recusa sozinho o que não é lead: formulário com campo de senha, busca, e
qualquer um marcado para ignorar.

---

## As armadilhas que deixam a página invisível

A receita genérica não tem como saber destas. São as que aparecem de verdade:

- **Formulário em iframe de outro domínio** (Typeform, Google Forms). O coletor
  não enxerga dentro do iframe: o lead chega no serviço e não no painel. Se for
  inevitável, o serviço precisa entregar o envio ao endpoint de formulários —
  não existe conector automático.
- **Navegação sem recarregar** (SPA, rolagem com troca de URL). Só o primeiro
  `page_view` sai. Cada troca de rota precisa avisar o coletor.
- **Banner de consentimento que bloqueia o script.** A página fica no ar, o
  relatório fica vazio, e não há erro em lugar nenhum. Decida isso ao desenhar,
  não depois.
- **Botão que é `<div>` com `onclick`.** Marque igual; o coletor usa o atributo,
  não a tag — mas sem `data-track-id` ele não tem o que registrar.
- **Mesmo `data-track-id` repetido em botões diferentes.** Vira um número só, e
  a comparação entre posições morre.

Verificar não é olhar o HTML: script bloqueado por CSP, consentimento ou
extensão **está no HTML e não mede nada**. Quem verifica é evento recebido — a
tela de Rastreamento do site tem o diagnóstico com token de 30 minutos, e é por
ele que se confirma.

---

## A estrutura do prompt gerado

Mesmas oito seções da receita original, com o conteúdo trocado:

1. **Contexto do produto** — o que o cliente vende, para quem, e **como o
   contato acontece hoje** (WhatsApp? telefone? formulário?). É o que decide as
   seções.
2. **Direção visual** — a marca do CLIENTE. Restrições explícitas, porque a
   receita genérica tende ao mesmo SaaS de sempre.
3. **Layout** — contêiner, grade, ritmo de espaçamento. Celular primeiro: é onde
   o clique de WhatsApp acontece.
4. **Seções da página** — cada uma com o evento que produz. Se não produz
   nenhum, ela é de apoio, e isso precisa estar dito.
5. **Componentes** — e, ao lado de cada botão, o `data-track-id` e o
   `data-track-pos` já escolhidos.
6. **Regras visuais** — paleta, tipografia, sombras, cantos.
7. **Conteúdo** — textos reais ou a instrução de que são provisórios.
8. **Interação** — e aqui uma regra do painel que vale para a página também:
   `prefers-reduced-motion` respeitado.

**Saída em português.** A receita original pedia inglês "para colar em builders
de IA"; os clientes e os textos são em português, e prompt na língua do conteúdo
evita tradução no meio do caminho.

---

## Depois de publicar

1. Abra a aba **Rastreamento** do site no painel e comece um diagnóstico.
2. Abra a página pelo link do diagnóstico e faça os gestos: ver a página,
   clicar no WhatsApp, enviar o formulário.
3. Os eventos do diagnóstico nascem marcados como teste e **não entram no
   relatório** — por isso o token vale 30 minutos, e por isso não se cola esse
   link em grupo nenhum: visita real que chegar com ele some do relatório em
   silêncio.
4. O inventário de tags e botões mostra o que foi reconhecido e o que ficou como
   `auto:` — é a lista do que falta marcar.
