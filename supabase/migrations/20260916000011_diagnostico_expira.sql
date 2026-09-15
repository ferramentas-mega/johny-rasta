-- A sessão de diagnóstico passa a ter prazo.
--
-- ─── O risco que isto fecha ──────────────────────────────────────────────────
--
-- Todo evento que chega com um token de diagnóstico nasce `is_test` — decidido
-- no SERVIDOR, para que um teste jamais entre em relatório comercial. Essa
-- garantia tem um lado perigoso: o token vai na URL do site do cliente
-- (`?painel_diag=…`), e uma URL é a coisa mais fácil do mundo de se espalhar.
-- Basta o operador colar o link num grupo, deixar aberto numa aba que alguém
-- reaproveita, ou o endereço vazar para um índice, e **visitas reais passam a
-- ser marcadas como teste** — somem dos relatórios em silêncio, que é o pior
-- tipo de perda: ninguém percebe até o fechamento do mês.
--
-- A coluna `encerrada_em` existia desde o começo e nada nunca a preenchia. Uma
-- sessão aberta há três semanas continuava valendo.
--
-- ─── Por que prazo, e não checagem na ingestão ───────────────────────────────
--
-- O caminho óbvio seria o `/api/collect` consultar `diagnostic_sessions` antes
-- de aceitar o token. Não é possível de propósito: `app_ingest` não tem GRANT
-- nenhum nessa tabela, e afrouxar isso para resolver um problema de janela
-- trocaria uma perda de dado por uma ampliação de privilégio no papel mais
-- exposto do sistema.
--
-- Então o prazo é aplicado onde dá, sem mexer em privilégio:
--
--  1. **No coletor** (`t.js`), que guarda o token com a hora de validade e para
--     de enviá-lo quando vence. É a defesa que realmente impede o visitante
--     real de ser marcado, porque age antes do evento sair do navegador.
--  2. **Na verificação**, que só conta evento recebido dentro da janela. Um
--     token velho não verifica instalação nenhuma.
--
-- Trinta minutos: folgado para quem está instalando (abrir o site, navegar,
-- clicar, voltar e conferir) e curto o bastante para que um link vazado não
-- estrague a medição de um dia.

alter table diagnostic_sessions
  add column expira_em timestamptz not null default (now() + interval '30 minutes');

-- As sessões que já existem recebem o mesmo prazo contado da abertura. As
-- antigas nascem vencidas, que é a resposta certa: elas estavam abertas por
-- falta de prazo, não por alguém ainda estar testando.
update diagnostic_sessions set expira_em = aberta_em + interval '30 minutes';

-- A consulta que a tela faz é "existe sessão viva para este site?": procura por
-- site, descarta encerrada e compara o prazo.
create index diagnostic_sessions_vivas on diagnostic_sessions (site_id, expira_em desc)
  where encerrada_em is null;
