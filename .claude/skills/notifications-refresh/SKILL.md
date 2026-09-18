---
name: notifications-refresh
description: Atualização sem recarregar (BotaoAtualizar, router.refresh, auto-atualização na espera), carimbo de hora dos dados, central de avisos derivada e sino do cabeçalho. Use ao mexer em refresh, cache, avisos, e ao planejar Web Push ou service worker.
---

# Atualização e avisos

## Atualizar (existe)

`src/components/BotaoAtualizar.tsx`, dentro do `Cabecalho` de toda tela:

- `router.refresh()` numa `useTransition`: refaz só os Server Components; estado de cliente,
  rota, filtros e rolagem ficam. **Nunca `location.reload()`.**
- `DADOS DE hh:mm:ss` = hora do render no servidor (`geradoEm`), formatada no cliente depois da
  hidratação. Não é região viva (`role="status"` é da confirmação de formulário).
- `atualizarACada` (segundos) só em tela de ESPERA (Rastreamento sem evento, etapa de
  verificação), e só com a aba visível. Não ligue na Visão geral.
- **Refresh ≠ nova análise.** Nova análise é `solicitarAnalise` + `/api/auditorias/processar`.
- Não há cache de dado no cliente: cada tela é `force-dynamic`. O `fetch` do Next cacheia GET por
  padrão — toda chamada externa de medição leva `cache: 'no-store'`.

## Avisos (existe)

`src/lib/avisos.ts` (`derivarAvisos`, puro, testado) + `src/server/services/avisos.ts`
(`listarAvisos`, memorizada por render com `cache()` do React). Origens: sinais abertos de
Otimizações, site sem evento algum, recurso com erro ou sem verificação. `SinoAvisos` no
cabeçalho, página `/avisos`.

- **Sem tabela, sem "marcar como lido"**: o aviso some quando o fato some. Gravar aviso criaria a
  segunda fonte de verdade que o projeto proíbe.
- Um fato, um aviso: "sem eventos recentes" já é sinal de coleta; não duplique.
- Todo aviso tem `href` para onde agir.

## Web Push (existe)

`src/server/services/push.ts` + `src/lib/push.ts` (puro: `novosParaEnviar`, `mensagensParaPush`),
rota `/api/push` (GET chave pública + dispositivos do usuário; POST/DELETE inscrição; tudo com
sessão), `public/sw.js` (repasse puro: `push` → `showNotification`, `notificationclick` → abre a
URL; sem `fetch`, sem `caches` — há teste), `AtivarNotificacoes` em Configurações.

- `push_subscriptions` (uma por navegador; várias por usuário; RLS por conta, serviço filtra por
  `user_id`) e `push_enviados` (chave do aviso já avisado, por conta).
- **Deduplicação por mudança de estado**: só aviso de gravidade alta NOVO dispara; a chave sai do
  registro quando o aviso some, e volta a avisar se o fato voltar. Vários do mesmo cliente viram
  UMA mensagem com deep link para o cliente.
- Disparo: cron diário (`/api/auditorias/agendar`, contas de `app.contas_com_push()`) e depois de
  cada medição (`/api/auditorias/processar`), fora da transação, catch só registra.
- 404/410 do serviço de push apagam a inscrição. Outros erros só registram.
- VAPID: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; sem elas, no-op que devolve 0 e
  a tela diz "não configurado". A privada nunca sai do servidor.
- `requestPermission` só depois do clique; "Agora não" fica em `localStorage`.
- CSP: `worker-src 'self'` existe por causa do SW (`strict-dynamic` ignora `'self'` em
  `script-src`).
