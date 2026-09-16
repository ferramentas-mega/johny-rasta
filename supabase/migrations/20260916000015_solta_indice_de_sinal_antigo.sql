-- Remove o índice de sinal sem dispositivo.
--
-- A segunda metade de `20260916000014_sinal_por_dispositivo.sql`, e ela vem
-- separada porque a ordem importa: enquanto este índice existir, ele PROÍBE duas
-- linhas de acompanhamento que difiram só pelo dispositivo — que é justamente o
-- que a migração anterior passou a permitir.
--
-- Então o par se publica assim, e só assim:
--
--   1. `…14` (aditiva: coluna + índice novo) → aplicar ANTES do código.
--   2. Deploy do código que nomeia o alvo novo no `on conflict`.
--   3. `…15` (esta) → aplicar DEPOIS, com o código já no ar.
--
-- Invertida, a etapa 3 chegaria primeiro e o `on conflict (site_id, tipo,
-- coalesce(url,''), titulo)` do código antigo não acharia índice que casasse:
-- marcar a situação de um item passaria a falhar até o deploy.

drop index if exists optimizations_sinal;
