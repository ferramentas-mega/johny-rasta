---
name: ui-ux-system
description: Como se constrói interface neste projeto — componentes existentes, estados assíncrono/vazio/erro, feedback de ação, responsivo e acessibilidade. Use ao criar ou modificar qualquer tela ou componente. Para cor, tipografia e tokens, a skill `design-matrix` é a autoridade e tem o verificador.
---

# Sistema de UI/UX

Esta skill é o mapa; `design-matrix` é a lei visual (tokens, escala fechada, `npm run design`).
Leia as duas antes de mexer em tela.

## Antes de criar componente, procure em `src/components/`

| Precisa de | Use |
|---|---|
| Cartão de número / indicador | `CartaoNumero`, `CartaoIndicador` (`Cartoes.tsx`) |
| Painel com título | `Painel` |
| Tabela com total, hover, sticky | `Tabela` (+ `Etiqueta`) |
| Estado vazio com explicação/CTA | `EstadoVazio` |
| Cabeçalho de página (h1, estado, filtros, atualizar, sino) | `Cabecalho` |
| Botão atualizar / hora dos dados | `BotaoAtualizar` (já dentro do `Cabecalho`) |
| Sino de avisos | `SinoAvisos` (já dentro do `Cabecalho`) |
| Cartão de site com progresso | `CartaoSite` |
| Avatar de iniciais | `Avatar` |
| Formulário (campo, seleção, botão, retorno) | `Formulario.tsx` |
| Sparkline / série | `Minigrafico`, `Grafico`, `Evidencias` |
| Página de sinal (URL + dispositivo) | `PaginaDoSinal` |
| Ícone | `icones.tsx` (SVG próprio; sem lucide) |

Padrão repetido em dois lugares vira componente — o cartão de número foi desenhado à mão em três
páginas e escapou de uma mudança de estilo (CLAUDE.md).

## Estados que toda tela assíncrona precisa ter

- **Carregando**: Server Components + `useTransition`/`useActionState`; botão desabilitado com
  texto ("Salvando…", "Executando…").
- **Vazio**: `EstadoVazio` com explicação; CTA só quando existe próximo passo real.
- **Erro**: `role="alert"` com o erro real; **nunca** fallback para dado de demonstração.
- **Sem base**: "Indisponível" / "Sem base de cálculo" — nunca 0.
- **De quando**: `DADOS DE hh:mm:ss` no cabeçalho.

## Responsivo e acessibilidade

- ≤860px: barra lateral some, `MenuInferior` no rodapé (6 destinos, teste conta). Não acrescente
  item ao menu sem passar em `responsivo.spec.ts`.
- Tabela larga rola dentro do próprio contêiner (`overflow-x`), nunca a página.
- Nome acessível não pode depender de `::after`; rótulo escondido usa `clip-path`, nunca
  `display: none`.
- Feedback de formulário em `role="status"` — e é a ÚNICA região viva da tela.
- `:hover`, `:focus-visible` e media query vivem em `theme.css`, não em estilo inline.

## Evite

Glow fora do `h1` e do número em atenção; cartão dentro de cartão; tamanho/raio fora da escala
(`npm run design` reprova); ícone sem função; texto em `--gold` (é preenchimento; texto é `-tx`).
