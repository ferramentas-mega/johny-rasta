# Medição de desempenho

Registro ANTES/DEPOIS da fase de otimização. Nada aqui é estimativa: os números
vêm de `medir-baseline.mjs`, que navega as rotas do painel no build de
produção local (`next start`) contra o banco de teste, com o Postgres logando
toda consulta com duração. O que ele registra por rota: TTFB, DOMContentLoaded,
load, requisições, bytes no fio, e — do log do Postgres — o número de statements
SQL, a soma das durações e as consultas repetidas na mesma navegação.

O que NÃO está aqui: a produção (app.johnyweb.com) não é alcançável do
ambiente em que se mede, e a latência de rede até o Supabase não foi medida.
Em produção o custo de cada statement é um RTT; por isso o número que importa
nesta tabela é o **nº de SQL por rota**, não os milissegundos.

## Como repetir

```bash
# 1. Postgres local logando toda consulta (como superusuário):
#    alter system set log_min_duration_statement = 0;
#    alter system set log_line_prefix = '%m [%p] %d ';  select pg_reload_conf();
# 2. Build de produção contra o banco de teste, na porta 3123
npm run build
# (variáveis DATABASE_URL* apontando para painel_matrix_test, SESSION_SECRET, APP_URL)
npx next start --port 3123
# 3. Medir e gerar o relatório
SAIDA_MEDICAO=/tmp/medicao node docs/desempenho/medir-baseline.mjs
SAIDA_MEDICAO=/tmp/medicao node docs/desempenho/gerar-relatorio.mjs
```

- `baseline-antes.md` / `.json` — medido em 2026-09-19, antes de qualquer alteração.
