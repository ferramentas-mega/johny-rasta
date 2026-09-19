---
name: design-matrix
description: Sistema visual do Painel de Sites — tokens do tema Matrix, onde cada tipo de estilo mora, e o verificador que aponta quando alguém sai do sistema sem querer. Use ao mexer em cor, tipografia, espaçamento ou componente visual deste projeto, e antes de colar componente pronto de fora.
---

# Sistema visual do Painel de Sites

Adaptado de uma skill genérica de design system. O que veio de lá é a **ideia**:
tokens num lugar só, consistência verificável, e uma ferramenta que o
desenvolvimento roda. O que saiu, e por quê, está em "O que não se aplica" no
fim — vale ler antes de trazer qualquer outra receita pronta para cá.

---

## O que este projeto tem

**Não há Tailwind, não há shadcn, não há biblioteca de componentes.** Não é
omissão a corrigir: é a decisão que preservou a identidade exportada do
protótipo. Componente de fora que dependa de `className="text-foreground"` chega
aqui sem estilo nenhum — e instalar as três coisas para ganhar um gráfico troca
o sistema visual inteiro. Já aconteceu duas vezes nesta base (um funil e uma
chuva Matrix): nas duas, aproveitar a ideia em SVG com os tokens do tema custou
menos e não trouxe dependência.

O sistema de COR são **49 tokens**, definidos duas vezes em
`src/styles/theme.css` — uma por tema:

| Grupo | Tokens |
|---|---|
| Superfícies | `--bg` `--side` `--card` `--elev` `--hover` |
| Bordas | `--bd` `--bdc` `--rowbd` `--glow` |
| Texto | `--tx` `--tx2` `--tx3` |
| Marca | `--gold` `--gold-fill` `--gold-tx` `--on-gold` |
| Estado | `--pos` `--neg` `--pos-tx` `--neg-tx` `--ok-bg` `--ok-tx` `--soft-bg` `--soft-tx` `--warn-bg` `--warn-tx` |
| Estado (cont.) | `--neg-bg` |
| Elevação | `--sombra-1` `--sombra-2` `--sombra-cartao` `--lustro` `--costura` `--gold-bd` |
| Fundos compostos | `--header-bg` `--brand-bg` `--cabecalho-vidro` |
| Dados (v2) | `--c1` `--c2` `--c3` `--c4` `--c5` `--f1` `--f2` `--f3` `--f4` `--f5` `--tip` `--titulo-grad` `--botao-grad` |

Os valores são os do protótipo, preservados de propósito — com as duas exceções
de contraste listadas adiante. `--gold` é **verde** (`#70ff8b` no escuro,
`#1d8840` no claro): o nome vem do componente de origem, não da cor.

---

## Onde cada estilo mora

A regra que evita o erro mais comum aqui:

- **Estilo inline** — layout e cor de um componente específico. É o padrão do
  projeto e está certo.
- **Classe no `theme.css`** — tudo que estilo inline **não consegue**:
  `:hover`, `:focus-visible`, `@media`, `::before`, animação. O menu lateral
  inteiro já foi inline e os itens não reagiam ao ponteiro, porque `:hover` não
  existe em `style={{}}`.
- **Nunca cor crua** numa tela. A interface lê o tema por `var(--token)`; hex
  literal não troca com o tema e quebra o modo claro sem dar erro.

Layout responsivo: trocar o **eixo** numa media query, não encolher o menu. Um
`flex-wrap` numa casca de duas colunas vira uma tela inteira de menu no celular.

---

## O verificador

```bash
npm run design
```

Roda no CI, junto de tipos e lint.

Sem argumento, sem banco, sem navegador — só lê arquivo. Sai com código 1 se
achar divergência.

Ele responde quatro perguntas:

**1. Os dois temas definem o mesmo conjunto de tokens?** Um token que existe só
no escuro não dá erro: no claro ele herda o valor do `:root`, que é o escuro, e a
tela fica com texto quase preto sobre fundo quase preto. Silencioso e feio.

**2. Alguma tela escreve cor crua?** Aí é defeito, e ele reprova.

**3. Todo par texto-sobre-fundo alcança 4,5:1?** Ver a seção de contraste
abaixo.

**4. As cores cruas OBRIGATÓRIAS ainda batem com o token que copiam?** Esta é a
parte que a skill genérica não tinha e que este projeto precisa. Quatro lugares
não conseguem ler CSS e por isso têm de repetir o valor:

| Arquivo | Por quê |
|---|---|
| `src/app/manifest.ts` | manifesto PWA: o Chrome lê JSON, não folha de estilo |
| `src/app/layout.tsx` | `meta theme-color`: pinta a barra do navegador antes de o CSS existir |
| `src/components/ChuvaMatrix.tsx` | canvas: `ctx.fillStyle` não resolve `var(--token)` |
| `src/lib/snippets.ts` | texto para o console do navegador do CLIENTE, fora da nossa interface |

O script não os proíbe — **rastreia**. Hoje são cinco cópias, e ele nomeia cada
uma com o token correspondente. É o defeito silencioso de verdade: mudar
`--side` e esquecer o manifesto deixa a barra do navegador com a cor antiga,
nada quebra, ninguém vê, e a identidade fica meio velha e meio nova.

A da `ChuvaMatrix` merece nota: no tema claro ela repete o verde da marca; no escuro usa `#00FF41`, que **não** é token nenhum — é o verde
clássico do filme, escolhido para o efeito e não para a interface. Divergência
proposital, e é melhor que ela esteja escrita aqui do que pareça descuido.

---

## Contraste: 4,5:1, medido

Veio de uma skill de UI genérica, e é o único critério dela que dá para
**medir** em vez de opinar. O verificador confere os pares texto-sobre-fundo em
cada tema (23 pares), compondo fundo com alfa sobre `--bg` antes de calcular — `rgba(…,
.12)` sobre preto não é a cor que se vê.

Medido antes de a conferência existir: o tema **claro reprovava em sete pares**.
`--tx3` sobre `--elev` dava 3,78:1, e `--tx3` é o token de toda legenda da
interface. O escuro passava inteiro.

O que a medição revelou não foi problema de paleta, e sim de **token errado**:
`--gold-tx` (#186e34, 6,33:1) já existia exatamente para texto, e quase todo
componente usava `--gold` (4,14:1). É o ponto que a skill de UI faz sobre nome
semântico — `color-error`, não `color-red`. Hoje existem também `--pos-tx` e
`--neg-tx`, pela mesma razão.

Duas mudanças de valor foram necessárias, as duas só no tema claro:

| Token | Era | É | Por quê |
|---|---|---|---|
| `--tx3` | `#6b7d6f` | `#607064` | 3,78:1 sobre `--elev` |
| `--gold` | `#1f8f43` | `#1d8840` | deixava `--on-gold` em 4,04:1 |

**Ao escolher cor de texto, use a variante `-tx`.** `--gold`, `--pos` e `--neg`
são preenchimento, borda e traço.

## A escala é um conjunto fechado

Cor sempre esteve sob controle aqui. **Forma, não.** Medido: **19 tamanhos de
fonte distintos em 291 usos** — quinze deles num intervalo de nove pixels (10,
10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 18, 19). Mais 8
trilhas e 6 raios.

Ninguém enxerga 12 contra 12,5. Enxerga-se o resultado: duas telas que dizem a
mesma coisa com pesos diferentes, sem que dê para apontar o quê. O caso mais
claro era a sobrelinha caixa-alta — `11px/.1em` no cabeçalho de página,
`10,5px/.12em` no de painel. Mesmo papel, quatro valores.

Hoje são 9 tamanhos, 4 trilhas, 4 raios e 3 pesos, em `:root` (não mudam com o tema:
descrevem forma, não cor). **Valor cru reprova, e token fora do conjunto também**
— `var(--tipo-medio)` não existe no CSS, o navegador ignora **em silêncio**, e o
tamanho fica o herdado.

Ao precisar de um tamanho que não existe, a pergunta é *que papel é este?*. Se
for papel novo, vira token com nome e comentário — foi assim que entrou
`--tipo-heroico`, o `clamp` do número da tela de erro, usado num lugar só.
Escala sem quem a defenda dura até a próxima tela.

Duas exceções, e são a mesma ideia — não é valor de escala, é outra coisa que
por acaso mora na mesma propriedade: `borderRadius: '50%'` (geometria) e
`letterSpacing: 'normal'` (RESET, um filho desfazendo a trilha fechada que
herdou do pai).

**Peso leve SÓ em tamanho grande** (`--tipo-display`, `--tipo-numero`,
`--tipo-heroico`). Peso fino reduz o contraste PERCEBIDO, e a WCAG não desconta
isso: a medição passa e o olho reprova. **O verificador NÃO pega isto** —
conferido por controle negativo. É regra de revisão, e está escrita em vez de
fingir cobertura.

Componentes que existem para o papel não se repetir:
`Sobrelinha` (rótulo caixa-alta, um tamanho, tom `marca` ou `discreto`),
`CartaoNumero` (rótulo + número + a nota que diz o que ele não é) e a classe
`.cartao`. O `CartaoNumero` nasceu de um achado: ele estava DESENHADO À MÃO
dentro de três páginas, e por isso ficou de fora quando o tratamento de cartão
mudou — **quem procura componente não encontra o que não é componente.**

---

## Elevação: a técnica muda com o tema

Dois níveis, e **não são a mesma técnica nos dois temas**. É o ponto em que
receita de sistema claro colada aqui falha em silêncio.

No **escuro**, sombra projetada é invisível — preto sobre preto não separa nada.
Quem separa é a luz: um `inset` claro na borda de cima. No **claro**, a sombra é
que separa, empilhada em camadas curtas e longas, com lábio `inset` na base.

Mesmo token (`--sombra-1`, `--sombra-2`), porque o papel é um só. `.cartao-elevado`
sobe ao nível 2 ao apontar, e leva `!important` porque a sombra de repouso é
estilo inline — inline vence classe.

---

## Acessibilidade e movimento

- `prefers-reduced-motion` zera a duração de toda animação no `theme.css`, e há
  prova de navegador que falha se um efeito novo ignorar isso. Animação de
  entrada usa `both` para o estado final valer mesmo sem animar.
- Foco visível é requisito testado, não preferência.
- Dica que só aparece no `title` não existe para quem está no celular: a
  explicação vai em texto.

---

## Ao analisar um site trazido de fora

Já aconteceu duas vezes, e a primeira foi **errada** — o registro do erro vale mais que a conclusão.

**O erro:** chegou o pacote publicado de uma landing page. Analisei o CSS do **aplicativo** que a
empacotou (o editor no-code), achei os tokens padrão do shadcn — acromáticos, `--radius: .5rem` — e
conclui que "a paleta não era nada". Era verdade sobre o editor e **irrelevante** sobre a página.
Resultado: entreguei higiene estrutural e nenhuma mudança de aparência, que não era o pedido.

**A regra que sai disso: analise o HTML ENTREGUE, não o CSS da ferramenta que o gerou.** Num pacote
exportado, o `index.html` é o documento; `assets/*.css` pode ser o editor inteiro.

**O acerto**, medindo a página por frequência de classe: `font-light` 248× e `font-extralight` 46×
contra 1 de `semibold`; `tracking-widest` 56×; `rounded-full` 126×; `leading-relaxed` 62×;
superfícies `bg-zinc-900/50`; bordas de acento em `-500/20`. E duas receitas literais — o número
(`text-7xl font-light tracking-tighter text-emerald-400` + `drop-shadow` verde) e o cartão
(`rounded-2xl` + sombra interna funda + hairline em gradiente no topo).

A coincidência que tornou a adaptação natural: **o número de destaque dela já era verde com
brilho**, que é o que este projeto sempre teve. Faltava peso, trilha e raio — não cor.

O método, para o próximo pacote: **o que aqui é medível, e o que é só a impressão que causa?**
Frequência de classe, contagem de valores distintos e razão de contraste são medíveis. "Parece
sofisticado" não é.

---

## O que não se aplica

A skill original oferecia gerar a paleta a partir de uma cor de marca, escala
tipográfica modular, grid de 8pt e exportação para JSON/CSS/SCSS. Nada disso
entra:

- **Gerar paleta** jogaria fora a decisão que o `theme.css` existe para manter —
  os valores são do protótipo e a identidade veio junto com eles.
- **Escala e grid genéricos** brigariam com os tamanhos já calibrados nas telas,
  e trocá-los em massa é uma mudança visual grande disfarçada de refatoração.
- **SCSS** não existe no projeto, e **JSON de tokens** só serviria se houvesse um
  consumidor — não há.

Se um dia houver segundo consumidor dos tokens (um portal do cliente, por
exemplo), aí o JSON passa a ter uso. Hoje seria mais um arquivo para sair de
sincronia — que é precisamente o problema que o verificador acima existe para
pegar.
