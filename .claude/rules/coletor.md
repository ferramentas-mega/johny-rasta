---
paths:
  - "public/t.js"
  - "public/f.js"
  - "src/app/api/collect/**"
  - "src/app/api/forms/**"
  - "src/server/services/ingestao.ts"
  - "src/lib/snippets.ts"
---

O coletor nunca lê campo de formulário, nunca coleta senha, e não pode atrapalhar o site
(`sendBeacon`, nada aguardado). `/api/collect` roda como `app_ingest`, com escopo por site e sem
acesso a leads; `is_test` é decidido no servidor quando há token. Snippet leva só dado público.
Verificação é evento recebido, nunca presença da tag. Detalhes: skill `tracking-platform`.
