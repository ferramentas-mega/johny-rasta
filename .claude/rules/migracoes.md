---
paths:
  - "supabase/migrations/**"
  - "scripts/migrate.ts"
  - "scripts/test-db.ts"
---

Migração é só aditiva e nunca editada depois de aplicada — escreva outra. Tabela nova leva
`account_id`, `FORCE ROW LEVEL SECURITY`, política por `app.current_account_id()` e GRANT mínimo
por papel. Migração que RESTRINGE política sobe depois do código. Nunca apague dado para
simplificar. Detalhes: skill `data-migrations`.
