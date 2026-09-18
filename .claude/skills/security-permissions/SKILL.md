---
name: security-permissions
description: Autorização server-side, isolamento entre contas e entre sites, papéis do Postgres, segredos, limites e o que o rastreamento nunca coleta. Use ao criar rota, Server Action, tabela, política, endpoint público, ou ao tocar em sessão, cron, segredos ou dados sensíveis. A skill `isolamento-entre-contas` detalha as políticas.
---

# Segurança e permissões

## Como a autorização funciona aqui

- **RLS `FORCE` em toda tabela; o padrão é negar.** A conta entra por
  `set_config('app.account_id', …, true)` em `withAccount`; sem ela, nada casa.
- Três papéis: `app_user` (painel), `app_ingest` (`/api/collect`, sem GRANT em leads/usuários),
  `app_forms` (`/api/forms/[id]`). Papéis públicos enxergam UM site (`app.site_id`).
- **A RLS não confere o `site_id` do formulário**: toda escrita do assistente passa por
  `exigirSiteDaConta`. `marcarOtimizacao` tem guarda de dono pelo mesmo motivo.
- Cron: `CRON_SECRET` em tempo constante (`segredoConfere`); GET recusa sessão; pergunta às
  funções `SECURITY DEFINER` estreitas quais contas têm trabalho e processa cada uma em
  `withAccount`. Nunca `BYPASSRLS`.
- Login: limitador por tentativa que zera no acerto (`zerarLimite`); duas funções
  `SECURITY DEFINER` com `search_path` fixo.
- CSP só em `NODE_ENV=production`; medir no `next start`, nunca no `next dev`.
- Entrada de Server Action é texto livre: valide com zod (`fuso` inválido derrubava a conta
  inteira; `urlPrincipal` sem validação estourava no render).

## Nunca

- Expor senha, segredo, chave privada, token privado, `CRON_SECRET`, chaves de API, VAPID privada.
- Logar dado sensível (o evento de submissão NÃO guarda conteúdo do formulário; há teste).
- Coletar `input[type=password]`, cartão, CVV ou conteúdo de formulário no analytics.
- Buscar URL escolhida pelo usuário a partir do servidor (SSRF). Saídas: só PageSpeed e CrUX.
- Confiar em botão escondido ou filtro de frontend como autorização.
- Usar repositório público como "prova de propriedade" em prompt gerado.

## Ao criar tabela

GRANT mínimo por papel, política por `account_id` (e `site_id` para papéis públicos), teste em
`tests/unit/autorizacao.spec.ts` que tenta ler de outra conta com o id certo em mãos.
