---
name: site-analysis-workflow
description: Fluxo URL monitorada → análise (PageSpeed/CrUX) → nota por dispositivo → sinal derivado → acompanhamento → reanálise → fechamento por medição. Use ao modificar qualquer área de qualidade técnica, otimizações, fila de auditoria, sinais, evidências ou correções elegíveis.
---

# Fluxo de análise

## Como está no código

```
monitored_urls ──solicitarAnalise──▶ audit_jobs ──/api/auditorias/processar──▶ lighthouse_results
                                                  (uma por chamada; cron diário)   crux_snapshots
                                                                                       │
                                SINAIS_SQL (src/server/qualidade/otimizacoes.ts) ◀─────┘
                                     │ lista (/otimizacoes, /clientes/[id], /avisos)
                                     ▼
                              optimizations (o que o operador marcou)
                                     │ aguardando_nova_analise → enfileirarReanalise
                                     ▼
                              fecharPorVerificacao (FATO_DE_RESOLUCAO)
```

Arquivos: `src/server/qualidade/{pagespeed,fila,otimizacoes}.ts`, `src/lib/{otimizacoes,correcoes,evidencias}.ts`,
telas em `sites/[siteId]/qualidade` e `/otimizacoes`.

## Regras que não podem quebrar

- **Nota pertence a (URL, dispositivo).** Nunca "a nota do site"; nunca média.
- **Laboratório ≠ campo.** Lighthouse mede TBT (coluna `tbt_ms`), não INP. Painéis separados.
- **HTTP 200 não é sucesso**: `runtimeError` no corpo lança e o job volta à fila. `registrarFalha`
  não toca em `lighthouse_results`. Toda chamada externa com `cache: 'no-store'`.
- **Sinal é derivado; fechamento exige fato positivo** (nova medição do mesmo dispositivo, com
  nota, depois da marcação). Ausência do sinal não fecha nada.
- **Fechamento fora da transação da medição**; `resolvidoPor` distingue `nova medição` de
  `varredura diária`.
- **Estimativa não se soma**: mostre a MAIOR; auditoria sem estimativa continua na lista, depois.
- **Histórico é série**: buraco interrompe a linha; um ponto não tem variação; direção depende da
  métrica e quem chama informa.
- Status que promete futuro precisa de mecanismo: `aguardando_nova_analise` enfileira ou recusa
  com código.
- Uma análise por dia (plano Hobby). Não crie teto no código; muda-se o cron.

## Ao acrescentar um sinal

Pergunte: duas ocorrências diferentes podem produzir a mesma chave? Se sim, falta coluna em
`ChaveDoSinal` e no índice único. Depois escreva o teste em `tests/unit/otimizacoes.spec.ts`.
