---
name: qa-product-review
description: Revisão final de uma funcionalidade ou fase — arquitetura, UX, UI, rastreamento, avisos, segurança e os comandos de verificação deste projeto, com controle negativo. Use antes de declarar qualquer etapa concluída ou de fazer commit de funcionalidade.
---

# Revisão de produto

Nada é concluído sem rodar. Suíte verde não prova que a tela ficou boa: olhe a captura.

## Comandos (todos, nesta ordem)

```bash
npm run design && npm run typecheck && npm run lint
npm test                             # vitest; recria painel_matrix_test
npm run build && E2E_PROD=1 npx playwright test   # CSP só existe em produção
```

Postgres parado? `service postgresql start`. Porta presa? `fuser -k 3100/tcp`. Tela "sem JS"?
Leia o log do servidor antes de procurar defeito no componente.

## Controle negativo

Toda verificação nova precisa de um caso que a FAÇA disparar (quebre de propósito, veja falhar,
restaure com `cp` da cópia — nunca `git checkout <arquivo>`). Verificador que só confirma o que
bate fica mudo quando algo deixa de bater.

## Perguntas

**Arquitetura** — pertence ao cliente, ao site ou à página? de onde alguém clica? já existia
equivalente? a definição está em UM lugar?

**UX** — a pessoa sabe onde está, o que aconteceu, qual o próximo passo? erro mostra erro (nunca
dado de demonstração)? vazio explica? zero e indisponível são diferentes?

**UI** — componente existente reaproveitado? `npm run design` passou? ≤860px sem rolagem
horizontal? nome acessível não depende de `::after`? única `role="status"`?

**Rastreamento** — verificação por evento com token? instrução da plataforma certa? diagnóstico
distingue causa? nada de senha/conteúdo de formulário?

**Avisos/atualização** — derivado, sem tabela? refresh sem reload? refresh ≠ nova análise?

**Segurança** — Server Action valida com zod? `exigirSiteDaConta`? RLS + GRANT na tabela nova?
teste tentando ler de outra conta? nenhum segredo em texto/log/commit?

**Dados** — migração aditiva? ordem código/migração certa? nada apagado?

**Testes** — o teste começa pelo clique (não monta a URL à mão)? valores esperados em
`scripts/test-db.ts`? teste que grava mira `escrita.teste`?
