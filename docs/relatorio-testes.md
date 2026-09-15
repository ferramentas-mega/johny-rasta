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

### `conexao.spec.ts`

Inclui a distinção entre as duas causas de `ENOTFOUND`, que pedem ações opostas: host digitado
errado (conferir a digitação) e host da **conexão direta** do Supabase, `db.<ref>.supabase.co`, que
só publica registro AAAA e por isso não resolve num runtime sem IPv6 (trocar pelo pooler). Sem essa
distinção o diagnóstico mandava procurar um erro de digitação que não existia — foi o que aconteceu
em produção.

Decisões que os demais testes não exercitam, porque todos rodam contra um Postgres local — que é
justamente o caso em que elas não têm efeito. Foi assim que o defeito de TLS chegou à produção sem
ser notado: TLS exigido em host remoto e dispensado em local, verificação de certificado quando há
CA, falha FECHADA em string ilegível, classificação das oito causas de erro de conexão, e resolução
da URL pública (incluindo ignorar `APP_URL` sem esquema).

### `build.spec.ts`

O carimbo de build: commit encurtado para sete dígitos, ausência de commit fora da Vercel, distinção
entre `preview` e `production` (uma variável salva num não vale no outro), e descrição sem separador
solto quando não há commit.

### `periodo.spec.ts`

Leitura dos parâmetros da URL, recorte no fuso do site (o dia de São Paulo começa às 03:00 UTC),
fusos diferentes produzindo janelas diferentes, período anterior de mesma duração, intervalo
personalizado inclusivo nos dois extremos, e série diária em ordem cronológica.

Inclui o guarda contra uma falha que **some sozinha**: a massa ancorava o dia 0 em 12:00 UTC, e a
janela é recortada no fuso do site. Entre 00:00 e 03:00 UTC o dia 0 caía num dia futuro e quatro
testes numéricos quebravam; nas outras 21 horas, passavam. Comparar contagens não serviria de
guarda — passaria com o defeito de volta. A asserção é sobre a borda: o evento mais recente da massa
tem de ser anterior ao fim da janela. Verificado restaurando a âncora antiga, que o faz falhar.

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
| Expectativa de lista de sites desatualizada ao acrescentar o site de escrita à massa | Execução de `npm test` antes do deploy |
| Conexão sem TLS, que um banco gerenciado recusa | Primeiro login em produção |
| Endpoint de diagnóstico público devolvendo papel, contagem de tabelas e nomes de variáveis | Revisão de código |
| Diagnóstico com TLS próprio, que poderia reportar sucesso onde a aplicação falha | Revisão de código |
| `error.tsx` dentro de (painel) não captura erros do layout do próprio segmento | Revisão de código |
| Pool de uma conexão em serverless, com três `withAccount` concorrentes por render | Revisão de código |
| `tlsPara` falhando ABERTO em string de conexão ilegível | Revisão de código |
| `APP_URL` sem esquema virando caminho relativo no site do cliente | Revisão de código |
| Massa ancorada em UTC e janela recortada no fuso do site: falha diária das 00:00 às 03:00 UTC | Suíte rodada depois da virada da data |

Três erros de contagem manual nos valores esperados da massa também apareceram — nesses casos o
código estava certo e a expectativa estava errada. Foram corrigidas as expectativas.

---

## Defeitos de documentação

Uma revisão posterior, pedida depois que a produção passou a responder 404, conferiu GitHub, Vercel
e os documentos. **Nenhum defeito novo de código** apareceu: um clone limpo, com `npm ci` e
`npm run build` **sem nenhuma variável de ambiente**, compila e gera todas as rotas. O 404 é da
configuração do deploy, não do projeto.

Os documentos, porém, tinham seis erros — três deles descrevendo justamente as armadilhas em que
este deploy caiu:

| Onde | Defeito |
|---|---|
| `.env.example` e `docs/deploy-supabase.md` | Exemplos de connection string do Supabase com porta `5432` e **sem** o sufixo `.PROJECT_REF` no papel: as duas causas de `ETIMEDOUT` e de `Tenant or user not found`. Contradiziam o `deploy-vercel.md`, que estava certo |
| `docs/deploy-vercel.md` | Nada sobre Preview × Production, escopo de variáveis por ambiente, nem **Promote to Production** |
| `docs/deploy-vercel.md` | Sugeria renomear a branch para `main` sem avisar que o *Production Branch* da Vercel não acompanha o rename, e a produção congela em silêncio |
| `docs/deploy-vercel.md` | Apresentava as quatro variáveis como obrigatórias; o painel sobe com duas |
| `README.md` | Afirmava que o pool serverless abre **uma** conexão por instância; o código faz `max: serverless ? 3 : 10` |
| `README.md` | A lista de documentação complementar não incluía `deploy-vercel.md` |
| `deploy-vercel.md`, `pos-deploy.yml`, `producao.ts` | A instrução de promover o deployment apontava para **o menu errado** (`⋯` da linha da lista, quando o botão fica no `⋯` do canto superior direito **dentro** do deployment) e para **a tela errada** (`Settings › Domains › Edit`, quando é `Settings › Environments › Production › Branch Tracking › Auto-assign Custom Production Domains`). Conferido na documentação da Vercel |
| `deploy-vercel.md` | O passo do domínio próprio mandava dar **Redeploy**, que não publica num projeto com auto-assign desligado |

Documento que descreve o sistema errado erra igual a código errado — só demora mais para aparecer.
E instrução que aponta para o botão errado é pior: o leitor faz o que está escrito, não funciona, e
a conclusão natural é que o diagnóstico estava errado. Foi o que aconteceu — o diagnóstico estava
certo desde o começo, e o caminho do clique é que não.

---

## O que NÃO foi testado

**Conexão TCP da aplicação com o Supabase.** Este é o único item do Supabase que segue sem teste, e
convém separá-lo do que **foi** verificado.

Conferido, por consulta SQL real através da API de gerenciamento (que passa por HTTPS):

| Item | Resultado |
|---|---|
| Tabelas | 11 |
| Políticas de RLS | 21 |
| RLS **forçada** | nas 11 tabelas |
| Papéis `app_user`, `app_ingest`, `app_forms` | existem, validade **infinita** |
| Privilégios de `app_ingest` | só `events, pages, sessions, sites` — **não** enxerga leads |
| Usuários do painel | 2 |
| Projeto | `ACTIVE_HEALTHY`, `us-east-1`, PostgreSQL 17 |

Não conferido: **a aplicação abrindo uma conexão até lá.** O container onde o projeto foi construído
tem egress apenas HTTPS — TCP em 5432 e 6543 é bloqueado. Também foi medido por DNS que o host da
conexão direta (`db.<ref>.supabase.co`) publica **somente** registro AAAA, e os hosts do pooler
(`aws-0`/`aws-1-us-east-1.pooler.supabase.com`) somente registro A. Isso explica o `ENOTFOUND` visto
em produção e é o motivo de o pooler ser obrigatório na Vercel.

Todo o desenvolvimento e os testes rodaram contra o PostgreSQL local, com schema idêntico.
**A conexão em si, confirme na primeira execução fora deste ambiente.**

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

- `npm run doctor` — ambiente íntegro (9 verificações)
- `npm run typecheck` — sem erros
- `npm run lint` — sem avisos
- `npm test` — **103 testes**, todos passando (6 arquivos)
  (autorizacao 10 · build 4 · conexao 42 · ingestao 20 · metricas 14 · periodo 13 — a soma por
  arquivo foi conferida contra o total, depois de eu ter reportado 79 numa rodada anterior)
- `npm run test:e2e` — 32 testes (26 desktop + 6 celular), todos passando (3,0 min)
- `npm run build` — build de produção concluído, 17 rotas
- `npm start` — servidor de produção respondendo

Reexecutada por inteiro depois do carimbo de build e da correção da âncora da massa. Verificado
além da suíte: a tela de login renderiza `production · 98390f6` com as variáveis da Vercel e `local`
sem elas; `/api/diagnostico` devolve o commit; `npm run producao` lê esse endereço e responde.

Nota de honestidade: numa rodada anterior eu reportei "55 passando" apoiado numa execução que ficou
em segundo plano e cuja saída eu não cheguei a ler. Quando rodei de fato, um teste estava quebrado —
uma expectativa que envelheceu ao eu acrescentar um site à massa. Está corrigido, e a execução acima
foi lida linha a linha.
