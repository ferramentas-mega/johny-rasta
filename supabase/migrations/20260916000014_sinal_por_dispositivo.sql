-- O sinal técnico pertence a uma URL E A UM DISPOSITIVO.
--
-- ─── O defeito ───────────────────────────────────────────────────────────────
--
-- A chave do acompanhamento era (site, tipo, url, título), e o título do sinal
-- técnico é o mesmo nos dois dispositivos: "Desempenho baixo em página
-- monitorada". Então uma página lenta no celular E no computador produzia DUAS
-- linhas na lista — uma por dispositivo, como deve ser — que casavam com UMA
-- única linha de acompanhamento.
--
-- As consequências, todas silenciosas:
--
--  * marcar "em andamento" na linha do celular mudava também a do computador;
--  * a evidência guardada como "antes" era a de quem foi clicado, e passava a
--    valer para o outro dispositivo, que tinha outra nota;
--  * o fechamento por verificação gravava como "depois" a última medição
--    daquela URL, de qualquer dispositivo — podendo creditar ao celular a
--    melhora que aconteceu no computador.
--
-- É exatamente o que o CLAUDE.md já proibia em outro lugar: "Nota técnica
-- pertence a uma URL e a um dispositivo. Nunca a um cliente, nunca a um site
-- inteiro." A regra valia para a tela de qualidade e não valia para esta chave.
--
-- ─── A coluna, e por que ela é anulável ──────────────────────────────────────
--
-- Nem todo sinal tem dispositivo. "URL prioritária nunca analisada" é sobre a
-- ausência de análise, e "site parou de coletar" vale para o site inteiro —
-- nesses, nulo é a resposta honesta, e não um 'mobile' de enchimento.
--
-- Por isso o índice usa `coalesce(dispositivo, '')`: em índice único NULL não
-- colide com NULL, e sem o coalesce dois sinais de coleta do mesmo site
-- conviveriam sem conflito. É a mesma razão do coalesce já aplicado a `url`.
--
-- ─── Ordem de publicação ─────────────────────────────────────────────────────
--
-- Esta migração é ADITIVA: acrescenta coluna e acrescenta índice, sem tirar
-- nada. Sobe ANTES do código, como manda a assimetria registrada no CLAUDE.md.
--
-- O índice ANTIGO continua aqui de propósito: o código em produção neste momento
-- nomeia (site_id, tipo, coalesce(url,''), titulo) no `on conflict`, e o Postgres
-- exige um índice que case exatamente com esse alvo. Removê-lo agora quebraria a
-- marcação até o deploy chegar. Quem o remove é a migração seguinte, depois do
-- código no ar.

alter table optimizations
  add column if not exists dispositivo text
    check (dispositivo in ('mobile', 'desktop'));

comment on column optimizations.dispositivo is
  'Dispositivo do sinal técnico. Nulo quando o sinal não é por dispositivo.';

create unique index if not exists optimizations_sinal_v2
  on optimizations (site_id, tipo, coalesce(url, ''), coalesce(dispositivo, ''), titulo);
