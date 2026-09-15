# Identidade visual

A estética vem do protótipo exportado do Claude Design e foi preservada valor a valor ao portar
para Next.js. Nada foi reinventado: os tokens abaixo são exatamente os do objeto `THEMES` original.

---

## Tokens

Definidos em `src/styles/theme.css`, como variáveis CSS no `:root`. Escuro é o padrão; claro
permanece disponível e é alternado por `data-tema` no elemento `<html>`.

### Escuro (padrão)

| Token | Valor | Onde aparece |
|---|---|---|
| `--bg` | `#000000` | Fundo da aplicação |
| `--side` | `#020502` | Menu lateral |
| `--card` | `#030703` | Superfície dos painéis |
| `--elev` | `#0A150C` | Campos, botões secundários |
| `--bd` | `#1A6B2E` | Bordas |
| `--bdc` | `#2FC957` | Borda de cartão de indicador |
| `--gold` | `#70FF8B` | Verde luminoso dos destaques |
| `--gold-fill` | `rgba(112,255,139,.12)` | Fundo de item ativo |
| `--on-gold` | `#04120A` | Texto sobre o verde luminoso |
| `--tx` | `#EEF8F0` | Texto principal |
| `--tx2` | `#A1B5A6` | Texto secundário |
| `--tx3` | `#809887` | Texto terciário, notas |
| `--pos` / `--neg` | `#39C965` / `#FF8585` | Variação positiva / negativa |
| `--glow` | `0 0 18px rgba(112,255,139,.28)` | Brilho dos títulos |

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
| Velocidade | 33 ms por linha | 33 ms por linha |
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
