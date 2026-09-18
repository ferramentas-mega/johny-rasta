-- Tarefas: o que alguém decidiu FAZER sobre um problema.
--
-- Problema e tarefa não são a mesma coisa. O problema é derivado ("LCP de
-- 5,2 s na /contato, no celular") e some quando a medição não o encontra mais.
-- A tarefa é uma decisão humana ("converter o hero para WebP") — tem dono, tem
-- prazo, tem "feito". Concluir a tarefa NÃO resolve o problema: quem resolve é
-- a próxima medição, e por isso concluir uma tarefa ligada a uma página oferece
-- a reanálise (mesmo mecanismo de `aguardando_nova_analise`).
--
-- O vínculo com o sinal é a MESMA chave de `ChaveDoSinal` (tipo, url,
-- dispositivo, título), gravada por cópia: o sinal não tem id, e a tarefa
-- precisa continuar apontando para ele mesmo depois que ele some — é o que
-- permite a pergunta "a correção funcionou?". Todos nulos = tarefa avulsa.
--
-- Aditiva: tabela nova, nada existente muda.

create table tasks (
  id            uuid        primary key default gen_random_uuid(),
  account_id    uuid        not null references accounts(id) on delete cascade,
  site_id       uuid        not null references sites(id)    on delete cascade,
  titulo        text        not null check (length(titulo) between 1 and 200),
  descricao     text        check (descricao is null or length(descricao) <= 2000),
  prioridade    smallint    not null default 2 check (prioridade between 1 and 3),
  status        text        not null default 'aberta'
                            check (status in ('aberta','em_andamento','concluida','cancelada')),
  -- Vínculo com o sinal (cópia da chave). Sem índice único: o mesmo problema
  -- pode gerar mais de uma tarefa, de propósito.
  sinal_tipo        text    check (sinal_tipo is null or sinal_tipo in ('tecnico','comercial','coleta','atualizacao')),
  sinal_url         text,
  sinal_dispositivo text    check (sinal_dispositivo is null or sinal_dispositivo in ('mobile','desktop')),
  sinal_titulo      text,
  prazo         date,
  criada_em     timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  concluida_em  timestamptz
);

create index tasks_abertas on tasks (account_id, site_id, prioridade, criada_em desc)
  where status in ('aberta','em_andamento');

alter table tasks enable row level security;
alter table tasks force  row level security;
create policy tasks_tenant on tasks for all to app_user
  using (account_id = app.current_account_id())
  with check (account_id = app.current_account_id());

-- Somente o painel. Os papéis públicos não recebem GRANT algum.
grant select, insert, update, delete on tasks to app_user;
