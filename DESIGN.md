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
| `CabecalhoFx` | O canvas Matrix, restrito à faixa direita do cabeçalho. |
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
