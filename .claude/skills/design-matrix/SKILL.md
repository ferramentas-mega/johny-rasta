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

O sistema inteiro são **25 tokens**, definidos duas vezes em
`src/styles/theme.css` — uma por tema:

| Grupo | Tokens |
|---|---|
| Superfícies | `--bg` `--side` `--card` `--elev` `--hover` |
| Bordas | `--bd` `--bdc` `--rowbd` `--glow` |
| Texto | `--tx` `--tx2` `--tx3` |
| Marca | `--gold` `--gold-fill` `--gold-tx` `--on-gold` |
| Estado | `--pos` `--neg` `--ok-bg` `--ok-tx` `--soft-bg` `--soft-tx` `--warn-bg` `--warn-tx` |
| Fundos compostos | `--header-bg` `--brand-bg` |

Os valores são os do protótipo, preservados de propósito. `--gold` é **verde**
(`#70ff8b` no escuro, `#1f8f43` no claro) — o nome vem do componente de origem,
não da cor.

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
node .claude/skills/design-matrix/scripts/conferir-tokens.mjs
```

Sem argumento, sem banco, sem navegador — só lê arquivo. Sai com código 1 se
achar divergência, então dá para pôr no CI.

Ele responde três perguntas:

**1. Os dois temas definem o mesmo conjunto de tokens?** Um token que existe só
no escuro não dá erro: no claro ele herda o valor do `:root`, que é o escuro, e a
tela fica com texto quase preto sobre fundo quase preto. Silencioso e feio.

**2. Alguma tela escreve cor crua?** Aí é defeito, e ele reprova.

**3. As cores cruas OBRIGATÓRIAS ainda batem com o token que copiam?** Esta é a
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

A da `ChuvaMatrix` merece nota: no tema claro ela repete `#1F8F43`, que é
`--gold` claro; no escuro usa `#00FF41`, que **não** é token nenhum — é o verde
clássico do filme, escolhido para o efeito e não para a interface. Divergência
proposital, e é melhor que ela esteja escrita aqui do que pareça descuido.

---

## Acessibilidade e movimento

- `prefers-reduced-motion` zera a duração de toda animação no `theme.css`, e há
  prova de navegador que falha se um efeito novo ignorar isso. Animação de
  entrada usa `both` para o estado final valer mesmo sem animar.
- Foco visível é requisito testado, não preferência.
- Dica que só aparece no `title` não existe para quem está no celular: a
  explicação vai em texto.

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
