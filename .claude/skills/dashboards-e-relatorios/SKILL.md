---
name: dashboards-e-relatorios
description: Como se constrói tela de números e relatório neste projeto — de onde o número vem, por que não há biblioteca de gráfico, e o que um arquivo exportado precisa dizer sobre si mesmo. Use ao criar painel, indicador, gráfico ou exportação, e antes de aplicar qualquer receita pronta de dashboard.
---

# Telas de número e relatórios

Adaptado de uma receita genérica de dashboard (KPI no topo, gráficos no meio,
tabela embaixo, Chart.js por CDN, dados de exemplo quando não há dados reais).
A forma é boa e está preservada. O que muda são as regras por baixo — e elas
mudam bastante, porque quase toda decisão daquela receita é o oposto do que este
projeto decidiu.

---

## As quatro recusas

Antes de qualquer layout. São as regras do `CLAUDE.md` aplicadas a esta
categoria de tela, e a receita original viola três delas.

**1. Nenhum componente calcula número.** Os indicadores saem de
`src/server/metrics/queries.ts`, sobre CTEs compartilhadas. A receita original
monta uma classe `Dashboard` que filtra e agrega no navegador — é exatamente o
caminho para duas telas discordarem do mesmo indicador. Precisa de um número
novo? A consulta vai para `queries.ts`; o componente recebe pronto.

Há uma dívida conhecida e registrada: os totais de rodapé do Desempenho são
somados no componente. Existe prova de navegador exigindo que batam com os
cartões. Não é licença para repetir.

**2. Dado de exemplo NÃO existe.** A receita diz: sem dados, gere um conjunto
realista e avise que é exemplo. Aqui não. Erro de consulta mostra erro; sem
medição a tela diz "Indisponível" ou "Sem base de cálculo". Um número plausível
na tela é lido como medição — o aviso ao lado não desfaz isso.

**3. Zero e ausência são afirmações diferentes.** Zero diz "medimos e não
houve". Divisão por zero devolve `null`, não `0`. Num gráfico, medição ausente
**interrompe a linha**: ligá-la ao ponto seguinte desenha uma queda até o chão
que não aconteceu (`src/lib/evidencias.ts`).

**4. Corte silencioso faz lista incompleta parecer completa.** Todo teto de
linhas vem com o total ao lado: "12 de 37", "20 de 84", "outras 3 auditorias são
informativas". Se cortar, diga.

---

## Por que não há biblioteca de gráfico

**A CSP deste aplicativo recusa script de CDN.** `src/middleware.ts` publica
`script-src 'self' 'nonce-…' 'strict-dynamic'` — com `strict-dynamic`, os
navegadores ignoram as origens listadas e só executam script com nonce. Um
`<script src="cdn.jsdelivr.net/…/chart.js">` simplesmente não roda. E a política
só existe em produção: medida no `next dev` dá 4.536 violações de `eval` que
não têm nada a ver com isso. Meça no `next start`.

Vale notar que a receita original se contradiz nesse ponto: promete "funciona
completamente offline, sem busca externa" e carrega Chart.js de um CDN. As duas
coisas não podem ser verdade ao mesmo tempo.

**E não faria falta.** Os gráficos aqui são SVG renderizado no servidor:

| Onde | O que resolve |
|---|---|
| `src/components/Grafico.tsx` | série diária, dois eixos |
| `src/components/Funil.tsx` | funil de leads, lados curvos em três camadas |
| `src/components/Evidencias.tsx` | série de medições, com buraco que interrompe a linha |
| `src/lib/eixo.ts` | as marcas do eixo, com passo redondo |

Componente de servidor, sem estado, sem dependência: um funil de quatro etapas
não precisa de 400 KB de Recharts, e realce ao apontar é `:hover` no
`theme.css`. Duas vezes nesta base um componente pronto (Tailwind + shadcn) foi
trazido e as duas vezes o caminho foi **aproveitar a ideia** em SVG com os
tokens — não instalar o ecossistema.

O eixo merece nota, porque é o defeito que motivou `eixo.ts`: linhas igualmente
espaçadas rotuladas com `topo × [0,.25,.5,.75,1]` sobre um topo não divisível
por quatro produzem uma régua que mente sobre o próprio espaçamento — máximo 1
vira `0, 0, 1, 1, 1`. Quem lê um gráfico lê a distância entre as linhas.

---

## A forma que este projeto usa

A estrutura da receita original (cabeçalho com filtros, cartões, gráficos,
tabela) é a mesma. Só que aqui ela já tem componentes:

```
<Cabecalho kicker="…" titulo="…" meta="…" filtros={<SeletorPeriodo …/>} />
<div className="pagina">
  <Painel titulo="…" subtitulo="…">     ← cada bloco, com o que ele afirma
    <Tabela colunas={…} linhas={…} vazio="…" />
    <p>…a ressalva que impede o número de ser lido como outra coisa…</p>
  </Painel>
  <footer><Aviso tom="ok">FONTE: …</Aviso></footer>
</div>
```

Duas coisas que não são decoração:

- **O parágrafo de ressalva embaixo de cada painel.** "TBT não é INP", "não é
  posição no Google", "as economias não se somam", "a janela do CrUX não muda
  com o período escolhido". É o que impede o número de ser lido como algo que
  ele não é — e há provas de navegador exigindo essas frases.
- **O `Aviso` de rodapé nomeia a FONTE.** Laboratório e campo nunca no mesmo
  painel: a mesma página deu 12,0 s no Lighthouse e 3,2 s no CrUX, e os dois
  estão certos.

Cores: os 25 tokens do `theme.css`, nunca a paleta genérica da receita. Ver a
skill `design-matrix`.

Celular: há prova que percorre onze rotas e falha se alguma ganhar rolagem
lateral. Tabela larga vai em contêiner com `overflow-x: auto` — o corpo da
página não rola de lado.

---

## Período e fuso

Filtro de data não é filtro de array. `resolvePeriod` recorta com
`date_trunc('day', now() at time zone <fuso do site>)`, e o fuso é **do site**,
não do servidor. `dataHora()` sem fuso renderiza em UTC na Vercel, que foi um
defeito real aqui: o horário não batia com o relógio de quem olhava.

---

## Exportar relatório

**Não está implementado** — está no `CLAUDE.md`, em "O que ficou de fora". A
receita original é justamente sobre isso, então aqui fica o que um arquivo
exportado teria de respeitar para não virar mentira:

- **Carimbo de quando foi medido, visível**, e não a data em que o arquivo foi
  aberto. É a mesma razão pela qual este projeto não tem service worker que
  guarde dados: número em cache mente sobre quando foi medido.
- **Sem busca externa e sem CDN.** Os gráficos já são SVG gerado no servidor;
  embutidos no HTML, o arquivo abre offline de verdade — sem a contradição da
  receita original.
- **Os "Indisponível" viajam junto.** Um relatório que troca ausência por zero
  no caminho da exportação é pior que não exportar, porque parece medição e sai
  do painel onde alguém poderia conferir.
- **Um arquivo por conta.** A RLS não acompanha o arquivo depois que ele sai;
  quem gera é que precisa garantir que só entrou dado daquela conta.

---

## Sobre receitas prontas em geral

Vale para qualquer template de dashboard que chegue aqui. Três perguntas, nessa
ordem:

1. **De onde vem o número?** Se a resposta é "o componente calcula", pare.
2. **O que ele mostra quando não há dado?** Se a resposta é "zero" ou "exemplo",
   pare.
3. **De que ele depende?** CDN, Tailwind, shadcn e bibliotecas de gráfico são
   custo alto por aqui — CSP, sistema visual e peso. Quase sempre o que se quer
   é a ideia do desenho, e ela cabe em SVG com os tokens.

Um caso concreto, para calibrar: o repositório `davila7/claude-code-templates`
tem um diretório `dashboard/` que **não é painel de números** — é o site de
catálogo do próprio projeto (grade de componentes, busca, carrinho, Clerk,
Astro + Tailwind), sem um único gráfico. O nome prometia uma coisa e o conteúdo
era outra. Abra antes de adaptar.
