-- Plataformas de instalação além de WordPress, React/Next e HTML.
--
-- O coletor (`t.js`) sempre foi universal: HTML puro, navegação de SPA por
-- pushState, consentimento. O que era estreito era o CADASTRO — a lista de
-- plataformas decidia quais instruções mostrar, e quem tinha um site em Vite,
-- num construtor (Wix, Webflow, Framer) ou instalava tudo pelo Google Tag
-- Manager caía em "HTML ou outra plataforma" e recebia a instrução genérica.
--
-- Só ALARGA o conjunto permitido. Nenhum valor existente muda de significado e
-- nenhuma linha precisa ser reescrita: migração aditiva, aplicável antes ou
-- depois do código.

alter table sites drop constraint if exists sites_platform_check;

alter table sites
  add constraint sites_platform_check
  check (platform in (
    'wordpress',
    'react_next',
    'vite_spa',     -- React, Vue ou Svelte com Vite: um index.html só, e a SPA
    'gtm',          -- Google Tag Manager: tag HTML personalizada, sem tocar no site
    'construtor',   -- Wix, Webflow, Framer, Squarespace e afins: campo "código no head"
    'html',
    'desconhecida'
  ));
