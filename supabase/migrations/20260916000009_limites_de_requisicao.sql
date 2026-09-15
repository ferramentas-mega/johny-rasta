-- Limites de requisição, com estado no banco.
--
-- Por que no banco e não em memória: a aplicação roda em funções serverless.
-- Um contador num `Map` do processo é reiniciado a cada invocação fria e não é
-- compartilhado entre instâncias — ou seja, não limita nada. Quem tenta força
-- bruta abre requisições em paralelo, e cada uma cai numa instância diferente.
--
-- O custo é uma consulta por requisição limitada. Nos endpoints públicos isso
-- se soma a escritas que já acontecem; no login, acontece uma vez por tentativa.

create table rate_limits (
  -- A chave já carrega o escopo: 'login:email@x', 'collect:<site_id>',
  -- 'forms:<site_id>'. Sem coluna de tipo separada, porque nada consulta por
  -- tipo — só por chave exata.
  chave       text        not null,
  -- Início da janela. Duas linhas da mesma chave em janelas diferentes
  -- coexistem, e a antiga é descartada pela limpeza.
  janela      timestamptz not null,
  contagem    integer     not null default 0,
  primary key (chave, janela)
);

-- A limpeza é oportunista, não agendada: um cron a mais estouraria o limite de
-- dois do plano Hobby, e o volume aqui é pequeno.
create index rate_limits_janela on rate_limits (janela);

-- ─── privilégios ─────────────────────────────────────────────────────────────
--
-- Esta tabela NÃO tem RLS por conta, e a razão é que ela é consultada ANTES de
-- existir conta: o login acontece sem sessão, e a coleta roda com um papel que
-- não tem conta nenhuma. Ela também não guarda dado de ninguém — só uma chave
-- opaca e um contador.
--
-- O que a protege é o GRANT: os papéis públicos podem incrementar o próprio
-- contador e nada mais. Não há SELECT para eles, então nem o endpoint de coleta
-- consegue ler quantas requisições outro site fez.
grant select, insert, update on rate_limits to app_user;
grant insert, update         on rate_limits to app_ingest, app_forms;

-- A função faz o incremento e devolve a contagem numa chamada só, o que evita a
-- corrida entre um SELECT e um UPDATE. `SECURITY DEFINER` porque os papéis
-- públicos não têm SELECT na tabela — e não precisam: eles só recebem de volta
-- o número, nunca as linhas.
create or replace function app.consumir_limite(
  p_chave text,
  p_janela_segundos integer
) returns integer
language plpgsql
security definer
set search_path = app, public, pg_temp
as $$
declare
  v_janela timestamptz;
  v_total  integer;
begin
  -- Janela fixa, alinhada ao relógio: `to_timestamp(floor(epoch / n) * n)`.
  -- Uma janela deslizante seria mais justa, e custaria guardar cada carimbo.
  v_janela := to_timestamp(floor(extract(epoch from now()) / p_janela_segundos) * p_janela_segundos);

  insert into rate_limits (chave, janela, contagem)
       values (p_chave, v_janela, 1)
  on conflict (chave, janela)
  do update set contagem = rate_limits.contagem + 1
    returning contagem into v_total;

  return v_total;
end;
$$;

revoke all on function app.consumir_limite(text, integer) from public;
grant execute on function app.consumir_limite(text, integer) to app_user, app_ingest, app_forms;

-- Zera o contador de uma chave.
--
-- Existe por causa do login, e a distinção importa: o limitador é cobrado a cada
-- TENTATIVA, inclusive as que dão certo. Sem esta função, quem acerta a senha
-- onze vezes em cinco minutos é bloqueado — e isso não é hipótese de laboratório,
-- foi a suíte de navegador travando em `waitForURL` depois do décimo login da
-- execução.
--
-- Um acerto prova que quem pediu sabe a senha, ou seja, não é a varredura contra
-- a qual o limite existe. Continuar cobrando dele confunde as duas coisas e pune
-- exatamente o usuário legítimo. Força bruta nunca acerta, então o contador dela
-- nunca é zerado.
--
-- `SECURITY DEFINER` porque os papéis públicos não recebem DELETE na tabela.
create or replace function app.zerar_limite(p_chave text)
returns void
language sql
security definer
set search_path = app, public, pg_temp
as $$
  delete from rate_limits where chave = p_chave;
$$;

revoke all on function app.zerar_limite(text) from public;
grant execute on function app.zerar_limite(text) to app_user, app_ingest, app_forms;

-- Limpeza das janelas vencidas. Chamada de vez em quando pelo próprio caminho
-- de requisição, com baixa probabilidade — varrer a cada chamada custaria mais
-- que o limite economiza.
create or replace function app.limpar_limites(p_antes_de timestamptz)
returns void
language sql
security definer
set search_path = app, public, pg_temp
as $$
  delete from rate_limits where janela < p_antes_de;
$$;

revoke all on function app.limpar_limites(timestamptz) from public;
grant execute on function app.limpar_limites(timestamptz) to app_user, app_ingest, app_forms;
