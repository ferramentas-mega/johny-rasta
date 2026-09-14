# Relatório de testes

Este documento diz o que foi executado, o que passou, o que **não** foi testado e por quê.
Nada aqui é declarado aprovado sem ter rodado.

Ambiente: Node 22.22, PostgreSQL 16 local, Chromium via Playwright.
Banco de testes: `painel_matrix_test`, recriado do zero a cada execução, isolado do banco de
desenvolvimento.

---

## Como reproduzir

```bash
npm run typecheck     # verificação de tipos
npm run lint          # ESLint
npm test              # vitest — unidade e integração
npm run test:e2e      # Playwright — navegador
npm run build         # build de produção
```

Os testes preparam a própria massa. Não é preciso rodar `db:seed` antes.

---

## Massa determinística

Definida em `scripts/test-db.ts`, com os valores esperados escritos à mão a partir dela. Duas
contas, para que o isolamento possa ser verificado de verdade:

| Conta | Cliente | Site | Papel na suíte |
|---|---|---|---|
| Agência Teste | Cliente Um | `alfa.teste` | Alvo das asserções numéricas |
| Agência Teste | Cliente Dois | `beta.teste` | Prova que os filtros separam sites |
| Agência Teste | Cliente Dois | `novo.teste` | Site sem nenhum evento |
| Agência Teste | Cliente Dois | `escrita.teste` | Alvo das suítes que gravam |
| Agência Rival | Cliente Rival | `rival.teste` | Alvo dos testes de isolamento |

`alfa.teste` em 7 dias produz: 8 sessões, 6 visitantes únicos, 14 visualizações, 8 cliques
(3 WhatsApp + 2 telefone + 2 e-mail + 1 abertura de formulário), 4 formulários de 3 contatos,
3 sessões convertidas.

Uma das sessões envia **dois** formulários. É esse detalhe que torna "sessões convertidas" (37,5%)
diferente de "envios por sessão" (50%) — no protótipo o modelo não admitia isso, e as duas taxas
davam sempre o mesmo número.

---

## Testes de unidade e integração (vitest)

Rodam contra o banco de testes, com transações reais e RLS ativa.

### `metricas.spec.ts`

| Verifica | Por quê |
|---|---|
| Totais exatos dos 9 indicadores | Valores fixos: a consulta não pode "acompanhar" uma mudança silenciosa |
| Únicos do período ≠ soma dos diários | v1 e v2 aparecem em dois dias; somar daria 8, o certo é 6 |
| Cliques em CTA = WhatsApp + contatos + aberturas | Os escopos precisam fechar entre si |
| Sessões convertidas ≠ envios por sessão | As duas fórmulas do §9 são contas distintas |
| Taxa de conversão nunca passa de 100% | — |
| Sem sessões, as taxas devolvem `null` | Zero por cento afirmaria "medimos e ninguém converteu" |
| **Soma da série diária de formulários = cartão** | O defeito nº 1 do diagnóstico |
| Soma da série diária de sessões = cartão | — |
| **Tabela por página e por botão dão o mesmo total** | A discrepância 169 × 207 da captura |
| Tabela de origens fecha com os cartões | — |
| Tabela por página soma MAIS sessões que o total | Consequência documentada, não defeito |
| Série cobre todos os dias, inclusive vazios | — |
| Trocar período e site muda os números | Filtro que não filtra é botão decorativo |

### `autorizacao.spec.ts`

| Verifica | Camada |
|---|---|
| Cada conta enxerga só os próprios sites | Serviço |
| Site de outra conta devolve `null` com o id correto em mãos | RLS |
| Leads de outra conta devolvem zero linhas (e o lead existe mesmo) | RLS |
| Sem conta na transação, nada é devolvido | RLS — o padrão é negar |
| Gravar linha carimbada com outra conta é rejeitado | RLS `WITH CHECK` |
| `app_ingest` recebe **permission denied** em `leads` | GRANT |
| `app_ingest` recebe permission denied em `users`, `clients`, `form_submissions`, `accounts`, `integrations` | GRANT |
| `app_forms` lê leads, mas não usuários nem contas | GRANT |
| `app_forms` não altera submissões gravadas | GRANT |
| `app_ingest` não apaga eventos | GRANT |

### `ingestao.spec.ts`

Normalização de caminhos, chave de deduplicação de lead, idempotência por `event_uid`, regra de
sessão de 30 minutos, recusa de `cta_click` sem subtipo, rejeição de carimbo no futuro, eventos de
teste fora das métricas, validação de formulário, reenvio idempotente, dois envios do mesmo contato
gerando um lead só, e **ausência de dado pessoal no evento de analytics da submissão**.

### `periodo.spec.ts`

Leitura dos parâmetros da URL, recorte no fuso do site (o dia de São Paulo começa às 03:00 UTC),
fusos diferentes produzindo janelas diferentes, período anterior de mesma duração, intervalo
personalizado inclusivo nos dois extremos, e série diária em ordem cronológica.

---

## Testes de navegador (Playwright)

### `fluxo-completo.spec.ts` — o fluxo do §12

Um teste só, do começo ao fim, com persistência real:

1. entrar no painel;
2. cadastrar um cliente;
3. confirmar que ele aparece no seletor do cadastro de sites;
4. cadastrar o site e capturar o identificador gerado;
5. confirmar que o site **não** aparece como coletando;
6. abrir a instalação e ver o snippet com o identificador certo;
7. abrir a página de teste, que carrega o coletor de verdade;
8. clicar no WhatsApp e confirmar que o evento sai;
9. enviar o formulário e receber confirmação;
10. ver o lead na tela de Leads;
11. conferir no dashboard: 1 sessão, 1 clique no WhatsApp, 1 formulário, estado "Coletando".

Mais dois testes de isolamento: a URL de um site de outra conta responde **404**, e nenhum dado da
conta rival aparece em nenhuma tela.

### `navegacao.spec.ts`

Item ativo do menu correspondendo à tela em todas as seções (exatamente um `aria-current` por vez),
abas do site com o menu seguindo em Sites, troca de período mudando os números, troca de site
atualizando os módulos, recarregar e abrir rota direta preservando o estado, voltar e avançar do
navegador, cartão de formulários levando aos leads daquele site, **renomear um site refletindo em
todas as telas**, e console do navegador sem erros em todas as rotas.

### `coerencia.spec.ts`

O que os testes de unidade provam nas consultas, aqui é conferido **na tela renderizada**: os totais
das duas tabelas, o total de formulários, a soma declarada da série, os dois eixos do gráfico
escalando de forma independente, as duas taxas mostrando valores diferentes, os cabeçalhos
declarando escopo, e um site sem coleta mostrando estado explícito em vez de zeros.

### `formularios.spec.ts`

Envio válido gravando e aparecendo no painel; envio sem contato recusado pelo servidor com erro no
campo; **falha do servidor mostrando erro e não uma confirmação falsa**; endpoint de coleta
recusando site inexistente e evento malformado; reenvio do mesmo evento reconhecido como duplicado.

### `responsivo.spec.ts` (Pixel 5)

Nenhuma rolagem horizontal em nenhuma tela, tabelas largas rolando dentro do próprio contêiner,
navegação por teclado, foco sempre visível, `prefers-reduced-motion` desligando os efeitos por
padrão, e a preferência de efeitos persistindo após recarregar.

---

## Defeitos encontrados durante o desenvolvimento

Os testes não foram escritos depois para confirmar o que já funcionava. Estes defeitos apareceram
por causa deles:

| Defeito | Como apareceu |
|---|---|
| `revalidatePath` chamado durante o render de uma página | Fluxo do §12 quebrou ao abrir a aba de Rastreamento |
| Snippet marcado como visto **depois** da leitura, exibindo o estado anterior | O mesmo teste, no passo seguinte |
| Formulário de edição não reabria ao trocar de alvo (componente cliente sobrevive à navegação) | Teste de renomear site |
| Consultas simultâneas na mesma conexão (`Promise.all` dentro de transação) | Aviso do driver `pg` durante uma captura de tela |
| `ON CONFLICT DO UPDATE` exigindo privilégio que os papéis públicos não têm | Primeiro POST real em `/api/collect` |
| Tela de desempenho estourando 8px na largura do celular | Suíte responsiva |
| Suítes que gravam poluindo o site medido por outras | Teste de período falhando conforme a ordem |

Três erros de contagem manual nos valores esperados da massa também apareceram — nesses casos o
código estava certo e a expectativa estava errada. Foram corrigidas as expectativas.

---

## O que NÃO foi testado

**Conexão da aplicação com o Supabase.** O schema está aplicado no projeto e foi conferido por
consulta (11 tabelas, 21 políticas, RLS forçada em todas, `app_ingest` limitado a
`events, pages, sessions, sites`). Mas o container onde o projeto foi construído só tem egress
HTTPS: conexões TCP em 5432/6543 são bloqueadas, e o host direto do Supabase resolve apenas em
IPv6. A aplicação rodando aqui não consegue falar com aquele Postgres. Todo o desenvolvimento e os
testes rodaram contra o PostgreSQL local, com schema idêntico. **Confirme na primeira execução fora
deste ambiente.**

**Integrações externas.** Nenhuma foi implementada nesta rodada, então não há o que testar.

**Carga e concorrência.** Não foram feitos testes de volume. A massa de desenvolvimento tem ~11 mil
sessões e ~20 mil eventos, e as consultas respondem rápido com os índices existentes, mas isso não
é um teste de carga.

**Navegadores além do Chromium.** A suíte roda só no Chromium disponível no ambiente.

**Recuperação de senha e criação de usuários pela interface.** Não implementadas; usuários são
criados por SQL ou pelo seed.

---

## Resultado da última execução

Preenchido a cada execução completa:

- `npm run typecheck` — sem erros
- `npm test` — 55 testes, todos passando
- `npm run test:e2e` — 32 testes (26 desktop + 6 celular), todos passando
- `npm run build` — build de produção concluído
