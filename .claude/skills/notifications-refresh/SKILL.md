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

## Web Push (NÃO existe — ao implementar)

- Tabela `push_subscriptions(user_id, endpoint unique, keys, user_agent, created_at, last_ok_at)`
  com RLS por conta E por usuário; várias por usuário; remover em 404/410 do serviço.
- VAPID: chave privada só no servidor (`src/server/segredos.ts`), pública ao cliente.
- Opt-in com contexto antes de `requestPermission`; nunca no carregamento.
- Service worker de repasse puro (o CLAUDE.md proíbe SW que guarde dado).
- Deduplicação por mudança de estado do fato derivado, não por tempo.
- Deep link não autoriza: a rota continua exigindo sessão.
