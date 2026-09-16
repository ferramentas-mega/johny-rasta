-- Contas com acompanhamento de otimização ainda aberto.
--
-- ─── O buraco que isto fecha ─────────────────────────────────────────────────
--
-- O fechamento por verificação roda quando uma análise NOVA é gravada, e só
-- alcança os sinais do site que acabou de ser medido. Isso cobre o sinal
-- técnico e o de análise vencida — os dois somem por causa de uma medição.
--
-- O sinal de coleta ("site que coletava e parou") não some por medição nenhuma:
-- ele some quando os eventos voltam a chegar. Nada dispara um Lighthouse por
-- causa disso, então o acompanhamento daquele item ficava aberto para sempre no
-- banco, com o último status que o operador pôs. Some da lista (a lista mostra
-- sinais) e nunca aparece entre as resolvidas: o ciclo não se fechava.
--
-- ─── Por que uma função, e por que só o id ───────────────────────────────────
--
-- Mesmo desenho das outras duas funções de cron, e pela mesma razão: o cron não
-- tem sessão, mas TAMBÉM NÃO RODA SEM CONTA. Ele pergunta onde há trabalho e
-- depois abre uma transação por conta, dentro da política. Dar BYPASSRLS ao
-- papel do cron seria mais curto e trocaria um endpoint quebrado por um que
-- enxerga todas as contas de uma vez.
--
-- Devolve apenas identificadores de conta: nenhum título, nenhuma URL, nenhuma
-- nota. `search_path` fixo, como todas as `SECURITY DEFINER` deste projeto.

create or replace function app.contas_com_acompanhamento_aberto()
returns setof uuid
language sql
security definer
set search_path = app, public, pg_temp
as $$
  select distinct account_id
    from optimizations
   where status <> 'resolvida_por_verificacao'
$$;

revoke all on function app.contas_com_acompanhamento_aberto() from public;
grant execute on function app.contas_com_acompanhamento_aberto() to app_user;
