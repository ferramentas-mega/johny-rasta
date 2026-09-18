---
name: product-architecture
description: Hierarquia e arquitetura global do Painel de Sites — Carteira → Cliente → Site → Rastreamento/Análise → Sinal (problema) → Acompanhamento → Nova verificação → Avisos. Use ao criar, mover, remover ou reorganizar rotas, módulos, telas ou funcionalidades, e antes de acrescentar item ao menu.
---

# Arquitetura do produto

Investigue antes de alterar. As entidades já existem; o trabalho quase sempre é
**ligar** o que existe, não criar.

## Hierarquia (como está no código)

| Conceito | Onde vive | Observação |
|---|---|---|
| Carteira | `/visao-geral` (`getSerieDaConta`, `CARTEIRA_SQL`) | conta CLIENTES; sites são contados à parte |
| Cliente | `clients`, `/clientes`, `/clientes/[id]` (workspace) | entidade central; `listarClientes` |
| Site | `sites` (1 cliente : N sites), `/sites` agrupado por cliente | `domain` autoriza a origem; `public_id` endereça o coletor |
| Página | `pages` (derivada dos eventos) e `monitored_urls` (cadastro para análise) | nota técnica pertence a (URL, dispositivo) |
| Rastreamento | `public/t.js`, `/api/collect`, `site_features` | estado derivado de `max(occurred_at)` |
| Análise | `audit_jobs` → `lighthouse_results`, `crux_snapshots` | laboratório e campo não se misturam |
| Problema | `SINAIS_SQL` (derivado) | nunca gravado; some quando o fato some |
| Acompanhamento | `optimizations` (o que o operador marcou) | chave = 5 colunas de `ChaveDoSinal` |
| Nova verificação | `enfileirarReanalise`, `fecharPorVerificacao` | fechar exige FATO POSITIVO |
| Avisos | `src/lib/avisos.ts` (derivado), sino no cabeçalho, `/avisos` | sem tabela, sem "lido" |

## Regras

- Menu global: Visão geral · Clientes · Sites · Leads · Otimizações · Configurações. Ferramenta que
  pertence a um site vai nas abas do site (`Abas.tsx`), não no menu.
- **Refresh não é nova análise.** `BotaoAtualizar` refaz a leitura; `solicitarAnalise` enfileira medição.
- Aviso é consequência de fato derivado. Não crie tabela de notificação para o que o banco já sabe.
- Antes de criar tela: a qual entidade pertence? de onde alguém clica? qual ação vem depois? já
  existe equivalente? (uma Server Action sem porta na tela é recurso que não existe — ver CLAUDE.md).
- Não duplique definição: quem lista e quem fecha um sinal usam o MESMO SQL; quem pergunta onde há
  trabalho e quem faz o trabalho usam o MESMO critério.

## O que ainda não existe (não finja que existe)

Tarefas como entidade própria, histórico de eventos gravado, relatório exportável, Web Push,
workspace de página com abas próprias. Estão registrados em "O que ficou de fora" no CLAUDE.md.
