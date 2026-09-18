---
name: client-portfolio
description: Cliente → Sites, Carteira, agrupamento na aba Sites e agregações por cliente. Use ao modificar clientes, sites, a Carteira da Visão geral, o painel do cliente, buscas, filtros ou qualquer número agregado por cliente.
---

# Cliente e carteira

## O que já existe

- `clients` 1:N `sites` (`client_id not null`), validado no servidor e no banco. Cliente é a
  unidade de trabalho; site é o que se mede.
- `/clientes` lista e cadastra; o NOME leva ao workspace `/clientes/[clienteId]`, que mostra os
  sites com os MESMOS números de cada tela de site (`getKpis`) e os problemas dele (sinais de
  `listarOtimizacoes` filtrados por site — a definição é uma só, o filtro é em memória).
- `/sites` agrupa por cliente com `agruparSitesPorCliente` (`src/lib/clientes.ts`): a ordem é a da
  consulta, a função não reordena. O cabeçalho do grupo diz quantos sites pedem ação, derivado de
  `resumoDeConfiguracao`.
- `/visao-geral` é a Carteira: `CARTEIRA_SQL` por site, totais por `totalizarCarteira`, série da
  conta por `getSerieDaConta` (mesmas janelas por fuso do site).

## Regras

- **Carteira conta clientes; sites são contados à parte.** Nunca some sites como se fossem clientes.
- **Estado agregado é derivado na hora**, nunca gravado: o estado de configuração vem de
  `estadoDaConfiguracao(resumo)`, o de rastreamento de `derivarEstado` em `sites.ts`, o de
  atenção da Carteira de `precisamAtencao`. Se precisar de "saúde do cliente", derive das mesmas
  funções — não crie coluna `status`.
- **Zero ≠ indisponível.** Site sem coleta aparece como "Indisponível", nunca 0.
- Σ numeradores ÷ Σ denominadores. Média das taxas dos sites é outro número.
- Uma consulta por tela, não por linha: `resumoDeConfiguracao(accountId, ids[])`,
  `listarSites`, `listarOtimizacoes` já são por lote. Não faça N+1 num `map`.
- Arquivar cliente com site ativo tem regra própria; `removerCliente` está sem porta de propósito.
- Busca por página deve devolver a página DENTRO do cliente, nunca solta.
