---
name: data-migrations
description: Migrações de banco seguras neste projeto — nomenclatura, ordem de publicação, RLS e GRANT em tabela nova, e o que nunca se apaga. Use ao criar ou alterar tabela, coluna, restrição, política, função ou índice em supabase/migrations.
---

# Migrações

## Convenções

- `supabase/migrations/AAAAMMDDHHMMSS_descricao.sql`. **Nunca edite uma migração já aplicada**;
  escreva outra. `npm run db:migrate` aplica em ordem, uma vez cada (`schema_migrations`).
- Testes recriam `painel_matrix_test` do zero com as mesmas migrações (`scripts/test-db.ts`): a
  migração que quebra aparece na primeira rodada de `npm test`.
- Produção: `npm run producao` / Supabase como `postgres` (tem `BYPASSRLS`).

## Ordem de publicação (assimetria que já custou)

- Migração **aditiva** (coluna, tabela, alargar CHECK): pode ir antes ou depois do código.
- Migração que **restringe** política ou escopo: **código primeiro**, confirme que está no ar,
  depois a migração (`20260916000012` teria parado a coleta em silêncio na ordem inversa).

## Tabela nova, checklist

1. `account_id` + `FORCE ROW LEVEL SECURITY` + política por `app.current_account_id()`.
2. GRANT só ao papel que precisa (qualidade técnica: só `app_user`).
3. Índice único sobre TUDO que distingue a identidade (a chave do sinal precisou de `dispositivo`).
4. Índice parcial para deduplicação de fila (`audit_jobs`: só `pendente`/`executando`).
5. `NOT NULL` só no que é sempre preenchido — um campo opcional gravado em coluna `not null`
   derrubou a transação e perdeu o lead.
6. Teste de isolamento em `tests/unit/autorizacao.spec.ts`.

## Nunca

Apagar sites, páginas, usuários, análises, métricas, acompanhamentos ou histórico para
simplificar; inventar associação (cliente para site órfão); `DO UPDATE` em upsert de papel público
(precisa de UPDATE; use `DO NOTHING` + `SELECT`); texto livre para `at time zone`.
