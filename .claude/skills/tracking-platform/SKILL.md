---
name: tracking-platform
description: O coletor universal (t.js, f.js), o endpoint /api/collect, instalação por plataforma (HTML, WordPress, React/Vite SPA, Next.js, GTM, construtores, Claude Code), verificação por evento e diagnóstico. Use ao trabalhar em rastreamento, instalação, snippets, diagnóstico de instalação ou nas etapas do assistente de configuração.
---

# Plataforma de rastreamento

## O que já é universal (não reescreva sem ler)

`public/t.js` (309 linhas, sem dependência): `sendBeacon` com `fetch keepalive` de reserva; um uid
por gesto e dedupe no servidor; desiste se instalado duas vezes (`window.__painelColetor`);
pushState/replaceState/popstate para SPA sem duplicar em hash; detecta `wa.me`, `tel:`, `mailto:`
sem marcação; `data-track-id/-sub/-pos` para nomear botões; respeita
`window.painelConsentimento = false`; token de diagnóstico com 30 min no `sessionStorage`; **não lê
campo de formulário**. `public/f.js` escuta o `submit` do formulário existente e manda só os
campos de contato; nunca troca destino nem cancela envio.

`/api/collect` roda como `app_ingest` (sem GRANT em leads/usuários), escopo por site
(`app.site_id`), força `is_test` quando há token, normaliza caminho, dedupe por `event_uid`.

## Instalação por plataforma

`PLATAFORMAS` (`src/lib/recursos.ts`) é a lista única — alimenta o seletor, o esquema da Action e
a restrição do banco. Instruções em `configurar/instrucoes.ts`; snippets em `src/lib/snippets.ts`
(`snippetColetor`, `snippetFormularioAutomatico`, `instrucaoParaClaudeCode`,
`conferenciaNoConsole`). Há teste que falha se uma plataforma nova cair na instrução genérica.

| Plataforma | Onde | Cuidado próprio |
|---|---|---|
| html | `</head>` de cada página / cabeçalho compartilhado | página sem script não é medida |
| wordpress | tema ou plugin de inserção, CABEÇALHO global | cache; tema atualizado perde edição |
| react_next | `app/layout.tsx` (`next/script`) ou `_document.tsx` | nunca em página; SPA já tratada |
| vite_spa | `index.html` da raiz | nunca dentro de componente (remonta) |
| gtm | tag HTML personalizado, All Pages, publicar | instalar no GTM E no tema = duplo |
| construtor | campo "código no head" do site inteiro | plano grátis pode não permitir |

## Regras

- **Verificação é evento recebido com token de diagnóstico** — nunca presença do snippet, nunca
  tempo decorrido, nunca "copiei o código". `src/lib/instalacao.ts` explica a espera.
- **O painel NÃO busca a página do cliente** (SSRF; e HTML com a tag não prova execução). A
  conferência roda no console do navegador do operador (`conferenciaNoConsole`).
- Diagnóstico distingue: ausente / carregou mas não rodou (CSP, bloqueador, consentimento) /
  instalado duas vezes (`getTagsDuplicadas`) / só eventos das páginas do painel / evento sem token.
- **Site ID é público; nenhum segredo no snippet.** O que protege é o `domain` do site.
- Prompt para Claude Code: técnico, limitado ao workspace, com a frase de autorização do
  usuário; **sem** "não recuse", "ignore", "confie em mim". Não suponha Next.js.
- Domínio, GitHub ou hospedagem diferentes do painel não são suspeitos: é o normal de agência.
- Nunca colete `input[type=password]` nem conteúdo de formulário no analytics.
