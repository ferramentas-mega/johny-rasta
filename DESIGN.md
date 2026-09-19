# Identidade visual

A estética vem do protótipo exportado do Claude Design e foi preservada valor a valor ao portar
para Next.js. Nada foi reinventado: os tokens abaixo são exatamente os do objeto `THEMES` original.

---

## Tokens

Definidos em `src/styles/theme.css`, como variáveis CSS no `:root`. Escuro é o padrão; claro
permanece disponível e é alternado por `data-tema` no elemento `<html>`.

### Escuro (padrão)

Um recorte. A lista completa e atual está em `src/styles/theme.css` — e `npm run design` confere que
os dois temas cobrem o mesmo conjunto. Esta tabela é para leitura, não é a fonte.

| Token | Valor | Onde aparece |
|---|---|---|
| `--bg` | `#000000` | Fundo da aplicação |
| `--side` | `#060b07` | Menu lateral |
| `--card` | `#0a120b` | Superfície dos painéis |
| `--elev` | `#121d14` | Campos, botões secundários |
| `--bd` | `#1A6B2E` | Bordas |
| `--bdc` | `#2FC957` | Borda de cartão de indicador |
| `--gold` | `#70FF8B` | Verde luminoso dos destaques |
| `--gold-fill` | `rgba(112,255,139,.12)` | Fundo de item ativo |
| `--on-gold` | `#04120A` | Texto sobre o verde luminoso |
| `--tx` | `#EEF8F0` | Texto principal |
| `--tx2` | `#A1B5A6` | Texto secundário |
| `--tx3` | `#809887` | Texto terciário, notas |
| `--pos` / `--neg` | `#39C965` / `#FF8585` | Variação positiva / negativa |
| `--glow` | `0 0 18px rgba(112,255,139,.28)` | Brilho do número em destaque (o `h1` usa `--titulo-grad`) |
| `--c1` … `--c5` | `#70ff8b` `#5bd1ff` `#ffd86b` `#ff7a7a` `#8fa394` | Paleta de DADOS: métrica, linha, pilha, etiqueta, fatia |
| `--f1` … `--f5` | as mesmas, em alfa `.14` | Fundo das etiquetas e da fatia inativa |
| `--tip` | `#08130b` | Fundo da dica do gráfico |
| `--titulo-grad` / `--botao-grad` | gradientes de `--gold` | Título do cabeçalho; botão primário |
| `--cabecalho-vidro` | `rgba(3,7,3,.72)` | Cabeçalho fixo translúcido (com `backdrop-filter`) |

O tema claro redefine os mesmos tokens. Como toda a interface consome apenas variáveis, alternar o
tema não exige nenhuma regra condicional nos componentes.

### Tipografia

- **Inter** — textos da interface.
- **JetBrains Mono** — números, rótulos técnicos, identificadores, títulos de página.

Ambas auto-hospedadas em `src/fonts/`, a partir dos `woff2` que vieram embutidos no projeto
exportado. São fontes variáveis: um arquivo por subconjunto cobre todos os pesos. Não há
dependência de rede em build nem em execução.

Para aplicar a monoespaçada, use a classe `.mono`.

---

## A escala fechada

Cor este projeto sempre teve sob controle. **Forma, não.**

Medido antes desta seção existir:

| O quê | Quantos valores distintos | Em quantos usos |
|---|---|---|
| Tamanho de fonte | **19** | 291 |
| Trilha (`letter-spacing`) | 8 | 8 |
| Raio de borda | 6 | 60 |

Os dezenove tamanhos eram 10 · 10,5 · 11 · 11,5 · 12 · 12,5 · 13 · 13,5 · 14 · 14,5 · 15 · 16 · 17 ·
18 · 19 · 26 · 28 · 32. **Quinze deles num intervalo de nove pixels.** Ninguém enxerga a diferença
entre 12 e 12,5 — o que se enxerga é o resultado: duas telas que dizem a mesma coisa com pesos
visuais diferentes, e ninguém consegue apontar o que está errado.

A sobrelinha caixa-alta era o caso mais claro: `11px/.1em` no cabeçalho de página, `10,5px/.12em` no
de painel. Mesmo papel, quatro valores, dois componentes.

Hoje o conjunto é **fechado** e `npm run design` reprova o que estiver fora dele:

| Token | Valor | Papel |
|---|---|---|
| `--tipo-micro` | 10,5px | selo, crachá, índice |
| `--tipo-legenda` | 11,5px | legenda, ressalva, sobrelinha |
| `--tipo-apoio` | 12,5px | texto secundário, célula |
| `--tipo-corpo` | 14px | corpo e rótulo de campo — o mesmo do `body` |
| `--tipo-secao` | 16px | título de painel |
| `--tipo-titulo` | 20px | título de bloco |
| `--tipo-display` | 28px | `h1` de página |
| `--tipo-numero` | 40px | o número de um indicador |
| `--tipo-heroico` | `clamp(4.5rem, 22vw, 9rem)` | código de tela de erro, e só |

Mais `--trilha-ampla` · `--trilha-media` · `--trilha-justa` · `--trilha-fechada`, e `--raio-p` ·
`--raio-m` · `--raio-g` · `--raio-pilula`. Peso também é token: `--peso-leve` · `--peso-medio` ·
`--peso-forte`.

Três decisões que não são arredondamento:

- **`--tipo-corpo` é 14px, não 13,5.** Os 13,5 apareciam em 22 lugares, mas encolher o texto de
  leitura para fechar uma escala é pagar legibilidade por simetria. Subiram eles.
- **Os degraus de baixo sobem ~8%, não os 20% da razão clássica.** Esta é uma interface densa: são
  quatro papéis de texto secundário com significados diferentes dentro da mesma tabela. Do
  `--tipo-secao` para cima os degraus abrem (1,19 · 1,25 · 1,4), porque ali o salto é de hierarquia.
- **`--tipo-numero` é maior que `--tipo-display`.** Numa tela de métrica o número é o assunto; o
  título é só onde ele fica.

---

## Elevação

Dois níveis, e eles **não são a mesma técnica nos dois temas** — é a parte que não dá para copiar de
um sistema claro e colar aqui.

| | Escuro | Claro |
|---|---|---|
| `--sombra-1` | filete de luz na borda de cima | sombra curta + lábio `inset` na base |
| `--sombra-2` | filete mais forte **+** sombra funda | três camadas empilhadas + lábio |

**No escuro, sombra projetada é invisível:** preto sobre preto não separa nada. Quem separa é a luz —
um `inset` claro na borda superior, como a quina de um objeto real iluminado de frente. No claro a
lógica inverte, e a sombra é empilhada em camadas curtas e longas em vez de um borrão só, que é como
a luz real se comporta.

O mesmo token nos dois casos, porque o **papel** é um: "esta superfície está acima do fundo".

`.cartao-elevado` sobe ao nível 2 ao apontar — e só o cartão que **leva** a algum lugar recebe a
classe. Cartão sem destino que reage ao ponteiro promete um clique que não existe.

---

## Movimento como token

`--mov-rapido` (140ms) · `--mov-medio` (240ms) · `--mov-lento` (420ms) · `--curva-saida`.

A curva é uma desaceleração forte: rápida no início, assentando no fim. É o que faz a entrada
parecer que **parou**, em vez de ter sido interrompida.

O bloco `prefers-reduced-motion` no topo do `theme.css` continua zerando todas — e há prova de
navegador que falha se um efeito novo ignorar isso.

---

## O vocabulário extraído da referência

A escala fechada (acima) resolveu **consistência**. Isto resolve **aparência** — e veio de uma
página de referência (`signal-ai`), medida por frequência de classe, não por impressão.

Um registro de erro antes: na primeira tentativa analisei o CSS do **aplicativo** que empacotou a
página, e não a página. Achei os tokens padrão do shadcn (acromáticos, `--radius: .5rem`) e conclui
que "a paleta não era nada". Era verdade sobre o editor e irrelevante sobre o documento. **Ao
analisar um site exportado, analise o HTML entregue — não o CSS da ferramenta que o gerou.**

O que a página de fato usa:

| Traço | Evidência | O que virou aqui |
|---|---|---|
| Peso leve domina | `font-light` 248× · `extralight` 46× · `semibold` 1× | `--peso-leve` no `h1` e nos números |
| Trilha fechada no grande | `tracking-tight` 36× · `tighter` 7× | `--trilha-justa` · `--trilha-fechada` |
| Rótulo caixa-alta espaçado | `tracking-widest` 56× | `Sobrelinha`, com brilho tênue |
| Pílula em tudo | `rounded-full` 126× | `--raio-pilula` em selo e aviso |
| Raio generoso no cartão | `rounded-2xl` · `[20px]` · `[32px]` | `--raio-g` (16px) |
| Superfície levantada | `bg-zinc-900/50` + `backdrop-blur` | `--lustro` sobre `--card` |
| Borda de acento em alfa baixo | `border-<cor>-500/20` | `--gold-bd` |
| Leitura folgada | `leading-relaxed` 62× | `line-height: 1.6` no corpo |

### As duas receitas literais

**O número.** Na referência:

```
text-7xl font-light tracking-tighter text-emerald-400 leading-none
drop-shadow-[0_0_12px_rgba(52,211,153,.6)]
```

A coincidência que tornou isto natural: **o número de destaque dela já era verde com brilho.** Nós
já tínhamos `--gold-tx` e `--glow`. O que faltava não era cor — era peso e trilha. Hoje o número é
`--tipo-numero` (40px) em `--peso-leve` com `--trilha-fechada`, verde, com brilho.

**O cartão.** Na referência:

```
bg-zinc-900/50 rounded-2xl border border-zinc-800
shadow-[inset_0_1px_10px_rgba(0,0,0,1), 0_1px_0_rgba(255,255,255,.05)]
+ hairline em gradiente atravessando o topo, sumindo nas pontas
```

Virou a classe `.cartao`: raio 16, `--sombra-cartao` (profundidade por dentro), e a **costura** —
um filete de luz de 1px cobrindo a metade central da borda superior, num `::before`, com
`overflow: hidden` para não vazar pelas quinas. Medido no navegador: 134,75px sobre um cartão de
271,5px, gradiente verde sumindo nas duas pontas.

`--card` **não mudou**. Os valores vêm do protótipo, e trocá-los mudaria toda superfície de uma vez;
o levantamento entra por cima, num gradiente que morre em 45%.

### A regra de peso, e o que ela não cobre

**Peso leve só em tamanho grande** — `--tipo-display`, `--tipo-numero`, `--tipo-heroico`. Peso fino
reduz o contraste **percebido**, e a WCAG não desconta isso: a medição passa e o olho reprova. Este
painel é feito de legenda pequena.

**`npm run design` NÃO pega a violação dessa regra** — verificado por controle negativo: pôr
`--peso-leve` num `--tipo-legenda` não acusa nada. É regra de revisão, não de ferramenta, e está
escrita aqui em vez de fingir cobertura.

### O que ficou de fora da referência

- **A paleta acromática e a Inter em peso 200** — trocaria a identidade por uma que a referência nem
  tinha de propósito (os tokens dela eram os de fábrica).
- **Peso fino em texto pequeno** — pela regra acima.
- **`backdrop-filter` sobre dado** — o verificador compõe alfa sobre `--bg` para medir contraste, e
  fundo borrado torna a composição imprevisível.
- **Tailwind e shadcn** — não existem aqui, e a CSP recusa script de CDN.

---

## Escala de superfície e espaçamento

Dois sistemas que faltavam, e os dois vieram de auditoria, não de gosto.

**Superfície.** Cinco níveis existiam, mas com degraus de 1,03 → 1,01 → 1,09 → 1,07 de razão de
luminância. `--side` sobre `--bg` em 1,01 é invisível: profundidade que ninguém enxerga não é
profundidade, é preto. Hoje: **1,06 → 1,04 → 1,10 → 1,11**.

O teto não é estético. Levantar superfície no escuro baixa o contraste do texto claro:

| Rampa | Degraus | Pior par (`--tx3`) |
|---|---|---|
| Anterior | 1,03 · 1,01 · 1,09 · 1,07 | 5,59 |
| **Adotada** | 1,06 · 1,04 · 1,10 · 1,11 | **5,03** |
| Testada, recusada | 1,08 · 1,10 · 1,21 · 1,28 | 3,67 ✗ |

Para calibrar: a rampa de exemplo de um SaaS dark de referência (`#08090A` · `#0D0F10` · `#121416` ·
`#171A1D`) tem degraus de 1,04 a 1,06 — **mais tímidos que os adotados aqui**.

No tema claro a amarração foi literal: `--elev` não podia escurecer um passo sequer, porque `--tx3`
tinha folga de 0,03 sobre o mínimo. Escurecer o **texto** (#607064 → #56655a) foi o que liberou a
**superfície** a descer, e a separação entre campo e cartão subiu de 1,159 para 1,204.

**Espaçamento.** Medido: 22 valores distintos de padding e gap, entre eles 6, 7, 9, 11, 14, 17, 18 e
20 — o "17px aqui, 23px ali" que o brief nomeia. Hoje `--esp-1` a `--esp-9`, de 4 em 4 (4 · 8 · 12 ·
16 · 20 · 24 · 32 · 40 · 48). A densidade é de ferramenta de operação: o respiro de cartão fica em
16px, não em 24.

---

## Barra lateral recolhível

Adaptada de um componente que expandia ao passar o MOUSE. Aqui é por **botão**, e a escolha
persiste. Três motivos concretos:

1. Uma barra que abre e fecha sozinha desloca todo o conteúdo à direita sempre que o ponteiro a
   cruza sem intenção — e este é um sistema onde se passa o dia.
2. Passagem de mouse não existe para quem navega por teclado.
3. Quem trabalha recolhido continua recolhido amanhã. O estado é aplicado pelo script inline do
   `layout.tsx` **antes da primeira pintura**, como o tema: senão a barra nasce aberta e encolhe.

Recolhida são 64px. O que acontece com cada parte:

| Parte | Recolhida |
|---|---|
| Rótulo | sai da TELA por `clip-path`, **nunca** `display: none` — o link precisa continuar tendo nome |
| Contagem (Clientes 2) | vira selo sobre o ícone — sumiria junto com o rótulo, e o 2 é metade da informação |
| Dica | `::after` com o rótulo, respondendo a ponteiro **e a foco** |
| Marca | encolhe para o glifo |
| Nome da conta | some |
| **Sair** | **fica** — esconder a saída da conta atrás de outra tela ninguém percebe até precisar |

Sem `framer-motion`: animar uma largura é `transition`. Abaixo de 860px nada disto vale — lá a
navegação é a barra inferior, ao alcance do polegar.

---

## Entrada escalonada das linhas

A referência usa `staggerChildren: 0.25` com 0,5s por linha. A ideia — as linhas assentando uma após
a outra — é boa; os números, não: **seis linhas levariam 1,5s** até a última aparecer, e numa
ferramenta de operação isso é lentidão vestida de polimento.

Aqui o passo é 35ms e a duração vem de `--mov-medio`: a cascata continua perceptível e a última
linha chega em menos de meio segundo. Sete degraus; da oitava linha em diante todas entram juntas,
porque uma cascata de trinta linhas vira espera.

O escalonamento é por posição em CSS, não por índice em JavaScript — que exigiria a linha saber
quantas irmãs tem, e transformaria a tabela em componente cliente.

---

## Componentes

| Componente | Papel |
|---|---|
| `Marca` | O glifo `>_` e o nome do painel. Isolado para troca por logo. |
| `MenuLateral` | Navegação principal. Item ativo derivado do `pathname`. |
| `Cabecalho` | Título, estado do rastreamento, filtros e efeitos. |
| `ChuvaMatrix` | O canvas Matrix. Um motor, duas variantes: `cabecalho` e `tela`. |
| `CabecalhoFx` | Casca fina sobre `ChuvaMatrix` na variante do cabeçalho. |
| `TextoMatrix` | Rótulo que "decodifica" em binário e volta ao texto real. |
| `TelaDeErro` | Moldura única de 404, erro de renderização e erro do layout raiz. |
| `ControlesAparencia` | Liga/desliga efeitos, alterna tema. |
| `CartaoIndicador` | Um número, seu escopo e a comparação com o período anterior. |
| `Painel` | Bloco de conteúdo com título, subtítulo e ações. |
| `Tabela` | Tabela com cabeçalhos explicativos e linha de totais. |
| `Grafico` | Série diária com dois eixos independentes. |
| `filtros` | Seletores de site, período e intervalo personalizado. |
| `Formulario` | Campos, seleção, botões e retorno de erro. |

### A marca

Nenhum arquivo de logo foi fornecido, então a marca é o glifo `>_` em tipografia monoespaçada,
dentro de um quadrado com borda verde. Está isolado em `src/components/Marca.tsx`: trocar por uma
imagem é mexer só nesse arquivo, sem tocar no layout do menu.

---

## Movimento

Animações decorativas ficam **concentradas no cabeçalho**. O resto da interface não se move.

O canvas Matrix (`CabecalhoFx`) respeita três coisas:

1. **`prefers-reduced-motion`** — quem pede menos movimento no sistema começa com os efeitos
   desligados, sem precisar clicar em nada.
2. **O botão FX** — desligar é permanente e persiste entre sessões. Não é só visual: o canvas
   realmente para de desenhar.
3. **Aba em segundo plano** — o desenho para quando `document.hidden`, para não queimar CPU numa
   aba esquecida.

O estado vive em `data-fx` no `<html>`, aplicado por um script inline **antes da primeira pintura**,
para a página não piscar entre um estado e outro.

### A chuva: um motor, duas variantes

`ChuvaMatrix` tem uma implementação só. Duplicá-la em dois componentes faria as duas divergirem na
primeira correção aplicada a apenas um deles. A variante decide onde a chuva mora, o tamanho do
dígito e a velocidade:

| | `cabecalho` | `tela` (login) |
|---|---|---|
| Posição | `absolute`, sobre o cabeçalho | `fixed`, viewport inteira |
| Dígito | 20px | 28px |
| Velocidade | 55 ms (celular) · 90 ms (desktop) | idem |
| Atenuação | máscara lateral, protegendo o título | véu por cima (`.veu-de-fundo`) |

A velocidade é campo da variante, ainda que hoje as duas usem o mesmo valor: mudar uma delas não
deve exigir mexer no motor. Como o véu que apaga o rastro é aplicado uma vez por **passo**, e não
por segundo, mudar a velocidade não encurta o rastro — ele mantém a mesma quantidade de dígitos.

Quatro decisões que custaram iteração e por isso ficam registradas:

**Uma linha inteira por passo, com acumulador de tempo.** Uma versão avançava 0,32 de linha por
quadro e desenhava o glifo na posição fracionária: em vez de uma coluna de texto, saía um borrão
vertical com os dígitos desalinhados entre si. Descer exatamente uma linha é o que faz cada número
cair sob o anterior. O acumulador desacopla isso da taxa de quadros — 120 Hz e 60 Hz têm a mesma
velocidade.

**`globalCompositeOperation = 'destination-out'` para apagar o passado.** O componente de referência
pinta `rgba(0,0,0,0.1)` por cima porque o canvas dele cobre uma página preta: o preto acumulado *é*
o fundo. Aqui o canvas é **transparente, sobreposto ao painel** — pintar preto com `source-over`
nunca zera nada; acumula uma camada opaca e deixa resíduo verde, e a chuva vira uma parede estática
de dígitos. `destination-out` reduz o **alfa** do que já foi desenhado: o dígito velho some de
verdade, e onde não há chuva o canvas continua transparente.

**A fonte precisa vir resolvida.** `ctx.font` usa o parser de fonte do CSS, que **não** resolve
`var(--fonte-mono)` fora de uma árvore de estilo. String inválida é ignorada **em silêncio**, e o
contexto fica em `10px sans-serif`. Como o espaçamento das linhas é calculado em JS, aumentar o
tamanho aumentava só o vazio entre os dígitos. O valor é lido do elemento e concatenado já
resolvido.

**O véu do login é uma camada, não opacidade do canvas.** Baixar a opacidade apagaria o dígito
inteiro junto com o rastro, e o efeito sumiria. `.veu-de-fundo` escurece o conjunto preservando o
contraste entre a cabeça brilhante e a cauda — mais forte no centro, que é onde o cartão fica. No
tema claro o véu é **branco**: a intenção é afastar o fundo do primeiro plano, e preto sobre tela
clara faria o contrário. É `aria-hidden` e `pointer-events: none`, com teste — uma camada
`fixed; inset: 0` por cima do formulário é o jeito clássico de tornar uma tela inutilizável sem
nenhum erro aparecer.

---

### O menu que decodifica

`TextoMatrix` troca cada letra do rótulo por um dígito binário e a devolve ao original, da esquerda
para a direita. Quem dispara é o ponteiro, o teclado (`onFocus`, para quem navega sem mouse ver o
mesmo efeito) ou a própria navegação — o item que acabou de virar o ativo decodifica uma vez, como
confirmação do que o usuário acabou de fazer.

Duas decisões que separam isto de um enfeite:

**O nome acessível nunca muda.** A versão de referência substitui o texto do elemento. Num link de
navegação, isso faz um leitor de tela anunciar "1 0 1 1 0" em vez de "Clientes". Aqui a camada
animada é `aria-hidden` e o rótulo real continua no DOM, intacto.

**A largura é sempre a do texto real.** As duas camadas ficam na mesma célula de um `inline-grid`, e
a real some por `opacity` — não por `display` ou `visibility`, que a tirariam da árvore de
acessibilidade. Sem isso o menu estremeceria toda vez que "Configurações" virasse `10110101010110`.
Layout que pula durante a animação é pior que não ter animação.

**Não anima ao montar.** O original anima uma vez, na montagem. Com seis itens, isso seria um
letreiro a cada carregamento. O componente só reage quando o contador `disparo` muda.

---

## Responsividade da casca

A casca do painel era um `flex-wrap` com o menu pedindo 240px. Abaixo dessa largura o menu quebrava
para uma linha própria e **ocupava a tela inteira**: no celular era preciso rolar marca, seis itens e
o rodapé de conta antes de chegar a qualquer número.

A correção é trocar o eixo numa media query, não encolher o menu. Abaixo de 860px:

| | Desktop | Celular |
|---|---|---|
| Casca | Duas colunas | Coluna única |
| Menu | Barra lateral de 248px | Faixa de ~60px grudada no topo |
| Navegação | Empilhada | Uma linha, rolando na horizontal |
| Marca | Visível | Oculta — já aparece no cabeçalho da tela |
| Conta | Rodapé da barra | Fim da mesma faixa, só as iniciais e "Sair" |

O indicador do item ativo era uma barra à esquerda; deitado, ele vai para baixo — entre dois itens
vizinhos numa linha, uma barra lateral desaparece.

Onde o ponteiro é grosseiro (`@media (pointer: coarse)`), os alvos de toque têm no mínimo 44px. Não
vale para o mouse: botões desse tamanho deixam a interface esparramada.

---

## Instalação como aplicativo

`src/app/manifest.ts` declara nome, `start_url` na Visão geral (a raiz só redireciona), `display:
standalone` e a cor de tema do menu — para a barra do sistema combinar com a interface em vez de
recortar um retângulo branco no topo.

Os ícones são gerados a partir do mesmo desenho do favicon: 192 e 512 "any", mais um 512
**maskable** com o glifo na zona segura e o fundo sangrando até a borda, porque o Android recorta o
ícone em formas diferentes conforme o fabricante.

`viewport-fit=cover` deixa a interface ir até as bordas em telas com recorte, e o respiro volta pelas
variáveis `env(safe-area-inset-*)`. O zoom **não** é limitado: impedir o zoom tira do usuário a única
saída quando a fonte está pequena demais para ele.

---

## As telas de erro

`TelaDeErro` é a moldura de três casos, com o mesmo visual do login: chuva ao fundo, véu, cartão de
vidro com os feixes, e o código em monoespaçada gigante decodificando ao abrir (o mesmo
`TextoMatrix`, não uma segunda implementação).

| Arquivo | Quando aparece | Código |
|---|---|---|
| `src/app/not-found.tsx` | Rota inexistente, e todo `notFound()` deliberado | 404 |
| `src/app/error.tsx` | Falha ao renderizar uma tela | 500 |
| `src/app/global-error.tsx` | Falha no **layout raiz** | 500 |

O terceiro existe porque `error.tsx` captura o que está abaixo dele, mas não o colapso do layout que
o envolve — e é o layout raiz que carrega o tema. Por isso `global-error.tsx` monta `<html>` e
`<body>` do zero e importa tema e fontes por conta própria.

O texto do 404 não promete que a página "foi movida": ela também é a resposta a quem tenta abrir,
pela URL, um registro **de outra conta**. Nesse caso 404 é deliberado — dizer "403, existe mas não é
seu" confirmaria a existência do registro para quem não deveria saber.

O diagnóstico do `error.tsx` foi preservado inteiro ao trocar a moldura: ele aponta a causa provável
(conexão com o banco) e onde ler o motivo exato. Uma tela bonita que só diz "algo deu errado" custa
uma investigação.

---

## A tela de login

O cartão adota a aparência de um componente pronto (shadcn + Tailwind + framer-motion + lucide):
vidro com desfoque, quatro feixes de luz percorrendo a borda, campos com ícone, botão de revelar a
senha e estado de espera.

**Nada dessa pilha entrou no projeto.** Instalar Tailwind aqui trocaria o sistema visual inteiro por
causa de um cartão, e framer-motion custaria ~40 kB de JS para animar quatro retângulos que o CSS
anima de graça. Os ícones são quatro traçados em SVG, escritos no próprio arquivo — a biblioteca
inteira não se paga por eles, e este é o único lugar do painel que os usa.

As animações são `@keyframes` em `theme.css` (seção "Cartão de vidro"), então o bloco
`prefers-reduced-motion` que já existia as neutraliza sem guarda própria.

Três elementos do componente de referência ficaram **de fora de propósito**, e há teste que falha se
algum voltar sem a implementação junto:

| Fora | Por quê |
|---|---|
| "Lembrar de mim" | A sessão tem uma duração só, definida no servidor. Caixa que não muda nada promete o que não existe |
| "Esqueci minha senha" | Recuperação de senha não está implementada. Link para rota inexistente é um 404 fantasiado de funcionalidade |
| "Entrar com o Google" e "Criar conta" | Não há OAuth, e as contas vêm do seed ou de SQL |

O botão de revelar troca o `type` do mesmo `<input>`, em vez de recriá-lo: recriar limparia o campo,
e o usuário redigitaria a senha inteira só por ter conferido o que escreveu. Ele expõe `aria-pressed`
e tem nome acessível, porque só há um ícone dentro.

---

## Responsividade

- Grades usam `repeat(auto-fit, minmax(min(100%, Npx), 1fr))`: um cartão por linha no celular,
  quatro no desktop, sem media query por breakpoint.
- Itens de grade levam `min-width: 0`, senão uma tabela larga estoura a coluna em vez de rolar.
- Tabelas largas rolam **dentro do próprio contêiner** (`overflow-x: auto`). A página nunca ganha
  barra de rolagem lateral — há teste de celular verificando isso em todas as telas.

## Acessibilidade

- Foco sempre visível: contorno de 2px na cor de destaque, via `:focus-visible`.
- O item ativo do menu e a aba ativa usam `aria-current="page"`, e há exatamente um de cada.
- Botões de alternância expõem `aria-pressed`.
- O gráfico tem `role="img"` e um rótulo que descreve a série e a escala.
- O canvas decorativo é `aria-hidden` e não recebe eventos de ponteiro.
- Os textos de definição dos indicadores são alcançáveis por teclado (`tabIndex={0}`), não apenas
  por passar o mouse.

---

## O que mudou em relação ao protótipo

A estética foi preservada. Três mudanças foram de legibilidade, não de estilo:

1. **O gráfico ganhou um segundo eixo, com números reais.** Antes a série de formulários era
   redimensionada para 55% da escala de visitas e desenhada com os rótulos das visitas — o desenho
   sugeria centenas onde o cartão dizia dezenas.
2. **As tabelas ganharam linha de totais**, e os cabeçalhos passaram a declarar o escopo de cada
   coluna. Sem isso não havia como perceber que duas tabelas contavam conjuntos diferentes.
3. **Os cartões ganharam identificadores estáveis** (`data-testid`), para que os testes verifiquem
   os números sem depender do texto do rótulo.
