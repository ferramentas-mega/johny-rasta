import { test, expect } from '@playwright/test';
import { entrar } from './apoio';

/**
 * Carteira, painel do cliente, qualidade técnica e otimizações.
 *
 * As quatro telas novas. O que estes testes protegem é o que uma regressão
 * quebraria em silêncio: coerência entre o geral e o individual, e as recusas
 * que impedem a tela de afirmar mais do que mediu.
 */

test.beforeEach(async ({ page }) => {
  await entrar(page);
});

test('a carteira lista clientes, e o total é a soma das linhas', async ({ page }) => {
  await page.goto('/visao-geral');
  await expect(page.locator('h1')).toBeVisible();

  const linhas = page.locator('table tbody tr');
  const n = await linhas.count();
  expect(n).toBeGreaterThan(0);

  // Soma a coluna de sessões linha a linha e compara com o rodapé de total.
  let somaSessoes = 0;
  for (let i = 0; i < n; i += 1) {
    const texto = await linhas.nth(i).getByRole('cell').nth(2).innerText();
    somaSessoes += Number(texto.replace(/\./g, '').trim()) || 0;
  }
  const total = await page.locator('table tfoot').innerText();
  expect(total.replace(/\./g, '')).toContain(String(somaSessoes));
});

test('a busca filtra, fica na URL e sobrevive a voltar e avançar', async ({ page }) => {
  await page.goto('/visao-geral');
  const antes = await page.locator('table tbody tr').count();

  const primeiro = (await page.locator('table tbody tr a').first().innerText()).trim();
  await page.getByLabel('Buscar cliente').fill(primeiro.slice(0, 5));
  await page.keyboard.press('Enter');
  await page.waitForURL(/q=/);
  const depois = await page.locator('table tbody tr').count();
  expect(depois).toBeLessThanOrEqual(antes);

  await page.goBack();
  await expect(page.locator('table tbody tr')).toHaveCount(antes);
  await page.goForward();
  await expect(page.locator('table tbody tr')).toHaveCount(depois);
});

test('a aba Sites agrupa por cliente, e o nome do grupo abre o painel do cliente', async ({ page }) => {
  await page.goto('/sites');

  // Cada grupo é uma seção nomeada pelo cliente; os dois clientes da massa
  // aparecem, cada um com os próprios cartões dentro.
  const grupoUm = page.getByRole('region', { name: 'Cliente Um' });
  const grupoDois = page.getByRole('region', { name: 'Cliente Dois' });
  await expect(grupoUm).toBeVisible();
  await expect(grupoDois).toBeVisible();
  expect(await grupoUm.locator('.cartao-site').count()).toBeGreaterThan(0);
  expect(await grupoDois.locator('.cartao-site').count()).toBeGreaterThan(0);

  // Nenhum cartão fora do grupo do seu dono.
  for (const cartao of await grupoUm.locator('.cartao-site').all()) {
    await expect(cartao.locator('a[href^="/sites?cliente="]')).toHaveText('Cliente Um');
  }

  await grupoUm.getByRole('link', { name: 'Cliente Um' }).first().click();
  await page.waitForURL(/\/clientes\//);
  await expect(page.locator('h1')).toHaveText('Cliente Um');
});

test('busca e filtro de saúde em Sites preservam o cliente, e o cartão da Visão geral abre o filtro', async ({ page }) => {
  await page.goto('/sites');
  // Buscar pelo domínio de UMA página devolve a página dentro do grupo do cliente.
  await page.getByLabel('Buscar cliente ou página').fill('alfa.teste');
  await page.keyboard.press('Enter');
  await page.waitForURL(/q=alfa/);
  await expect(page.getByRole('region', { name: 'Cliente Um' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cliente Dois' })).toHaveCount(0);
  await expect(page.locator('.cartao-site')).toHaveCount(1);

  // Filtro por saúde: fica na URL e sobrevive a recarregar.
  await page.goto('/sites');
  await page.getByRole('button', { name: /^Sem medição/ }).click();
  await page.waitForURL(/saude=sem_medicao/);
  for (const c of await page.locator('.cartao-site-saude').all()) {
    await expect(c).toHaveAttribute('data-saude', 'sem_medicao');
  }
  await page.reload();
  await expect(page.getByRole('button', { name: /^Sem medição/ })).toHaveAttribute('aria-pressed', 'true');

  // Filtro sem resultado explica e oferece limpar.
  await page.goto('/sites?q=nao-existe-zzz');
  await expect(page.getByText('Nenhum site casa com a busca ou o filtro')).toBeVisible();
  await page.getByRole('link', { name: 'Limpar filtros' }).click();
  await expect(page).toHaveURL(/\/sites$/);

  // O cartão de saúde da Visão geral é acionável e abre a aba filtrada.
  await page.goto('/visao-geral');
  await page.getByTestId('cartao-Saúde crítica').click();
  await page.waitForURL(/\/sites\?saude=critico/);
  await expect(page.getByRole('button', { name: /^Críticos/ })).toHaveAttribute('aria-pressed', 'true');
});

test('na aba Clientes, o nome do cliente leva ao painel dele, e o painel lista os problemas', async ({ page }) => {
  await page.goto('/clientes');
  await page.getByRole('link', { name: 'Cliente Um', exact: true }).click();
  await page.waitForURL(/\/clientes\//);
  await expect(page.locator('h1')).toHaveText('Cliente Um');

  // O painel de problemas existe sempre — vazio com explicação, ou com a
  // tabela dos sinais. O que ele nunca mostra é um número sem origem.
  await expect(page.getByRole('heading', { name: 'Problemas em aberto', level: 2 })).toBeVisible();
  const cartao = page.getByText('Problemas em aberto', { exact: true }).first();
  await expect(cartao).toBeVisible();
});

test('abrir um cliente mostra os sites dele, e só os dele', async ({ page }) => {
  await page.goto('/visao-geral');
  const nome = (await page.locator('table tbody tr a').first().innerText()).trim();
  await page.locator('table tbody tr a').first().click();
  await page.waitForURL(/\/clientes\//);

  await expect(page.locator('h1')).toHaveText(nome);
  // Todo site listado pertence a este cliente: a tela do cliente não mistura.
  await expect(page.locator('table tbody tr')).not.toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Voltar para a carteira' })).toBeVisible();
});

test('conversão sem base aparece como "Sem base", nunca como 0%', async ({ page }) => {
  await page.goto('/visao-geral');
  const corpo = await page.locator('table').innerText();
  // Se alguma linha não tem sessões, ela precisa dizer "Sem base".
  const linhasSemSessao = (await page.locator('table tbody tr').all()).length;
  expect(linhasSemSessao).toBeGreaterThan(0);
  // Nenhuma taxa pode ser exibida como 0,0% junto de zero sessões.
  expect(corpo).not.toMatch(/\b0\t+0,0%/);
});

test('a aba de qualidade técnica abre e declara o que os números são', async ({ page }) => {
  await page.goto('/sites');
  const href = await page.locator('.cartao-site a[href*="/desempenho"]').first().getAttribute('href');
  const siteId = href!.split('/')[2];

  await page.goto(`/sites/${siteId}/qualidade`);
  await expect(page.locator('[aria-current="page"]').filter({ hasText: 'Qualidade técnica' })).toBeVisible();

  const texto = await page.locator('body').innerText();
  // As ressalvas não são decorativas: são o que impede o número de ser lido
  // como algo que ele não é.
  expect(texto).toContain('TBT não é INP');
  expect(texto).toContain('não posição no Google');
  expect(texto).toMatch(/não representa as demais páginas/i);
});

test('as correções elegíveis aparecem, separadas do que é só informação', async ({ page }) => {
  /*
   * `lighthouse_results.auditorias` guardava todas as auditorias de cada
   * análise desde o esquema inicial — 153 na medição real — e nenhuma linha do
   * projeto lia a coluna. Ao mesmo tempo, a lista de Otimizações mandava
   * "abrir Qualidade técnica e ver os diagnósticos": o produto apontava para
   * uma tela que não tinha o que ele mandou buscar.
   */
  // Pelo cartão do site, como o usuário chega: a massa põe a análise com
  // auditorias no alfa.teste.
  await page.goto('/sites');
  const site = await page
    .locator('.cartao-site', { hasText: 'alfa.teste' })
    .locator('a[href*="/desempenho"]')
    .first()
    .getAttribute('href');
  expect(site, 'o cartão do alfa.teste precisa existir').toBeTruthy();
  await page.goto(`/sites/${site!.split('/')[2]}/qualidade`);

  const dobra = page.locator('details', { hasText: 'Eliminar recursos' }).first();
  await dobra.click();

  // A correção quantificada mostra a estimativa do próprio Lighthouse.
  await expect(dobra).toContainText('2,5 s');
  // A reprovada SEM estimativa continua na lista, dizendo que não tem —
  // ausência de estimativa não é economia zero.
  await expect(dobra).toContainText('Definir largura e altura');
  await expect(dobra).toContainText('sem estimativa');
  // A informativa não vira pendência, mas também não some em silêncio.
  await expect(dobra).not.toContainText('Requisições de rede');
  await expect(dobra).toContainText(/1 auditoria\(s\) desta medição são informativas/i);

  // E o resumo é a maior estimativa, jamais a soma.
  const corpo = await page.locator('body').innerText();
  expect(corpo).toMatch(/As economias não se somam/i);
});

test('a evidência mostra a série, e o buraco não vira queda', async ({ page }) => {
  /*
   * `lighthouse_results` e `crux_snapshots` gravam linha nova a cada coleta de
   * propósito, com o comentário dizendo que é para poder comparar a evolução —
   * e TODA consulta do projeto lia `distinct on (…)`. O histórico era guardado
   * para uma comparação que nenhuma tela fazia.
   *
   * A massa traz cinco medições da home no celular, uma delas SEM nota. É o
   * caso que decide: com o buraco desenhado como zero, a linha desceria até a
   * base e voltaria — contando um colapso que nunca houve.
   */
  await page.goto('/sites');
  const site = await page
    .locator('.cartao-site', { hasText: 'alfa.teste' })
    .locator('a[href*="/desempenho"]')
    .first()
    .getAttribute('href');
  await page.goto(`/sites/${site!.split('/')[2]}/qualidade`);

  const painel = page.locator('section', { hasText: 'Evidências de desempenho' }).first();
  await expect(painel).toBeVisible();

  const cartao = painel.locator('[data-serie="https://alfa.teste/|mobile|nota"]');
  await expect(cartao).toContainText('5 medição(ões)');
  await expect(cartao).toContainText('1 sem valor');
  // De 22 a 34: a régua é a faixa da própria série, não 0–100.
  await expect(cartao).toContainText('22/100 – 34/100');

  // A linha está PARTIDA: dois traços, não um só atravessando o buraco.
  await expect(cartao.locator('svg path')).toHaveCount(2);

  // E a comparação é entre a primeira e a última COM valor.
  await expect(cartao).toContainText('+12 da primeira à última medição');
});

test('sem análise, a tela diz que não há — e não mostra nota zerada', async ({ page }) => {
  await page.goto('/sites');
  const href = await page.locator('.cartao-site a[href*="/desempenho"]').first().getAttribute('href');
  await page.goto(`/sites/${href!.split('/')[2]}/qualidade`);

  const texto = await page.locator('body').innerText();
  if (texto.includes('Nenhuma análise executada ainda')) {
    // O que NÃO pode aparecer é uma linha de nota com zeros.
    expect(texto).not.toMatch(/\b0\/100\b/);
  }
});

test('URL fora do domínio do site é recusada', async ({ page }) => {
  await page.goto('/sites');
  const href = await page.locator('.cartao-site a[href*="/desempenho"]').first().getAttribute('href');
  await page.goto(`/sites/${href!.split('/')[2]}/qualidade`);

  await page.getByLabel('URL para monitorar').fill('https://site-de-outra-pessoa.com/');
  await page.getByRole('button', { name: 'Monitorar URL' }).click();
  // `p[role=alert]` e não `getByRole('alert')`: o Next mantém um
  // <div role="alert"> vazio para anunciar troca de rota, e ele casaria também.
  await expect(page.locator('p[role=alert]')).toContainText('precisa ser do domínio');
});

test('endereço privado é recusado antes de qualquer chamada externa', async ({ page }) => {
  await page.goto('/sites');
  const href = await page.locator('.cartao-site a[href*="/desempenho"]').first().getAttribute('href');
  await page.goto(`/sites/${href!.split('/')[2]}/qualidade`);

  await page.getByLabel('URL para monitorar').fill('http://169.254.169.254/latest/meta-data/');
  await page.getByRole('button', { name: 'Monitorar URL' }).click();
  await expect(page.locator('p[role=alert]')).toBeVisible();
});

test('otimizações filtram por tipo, pela URL e pelo clique', async ({ page }) => {
  await page.goto('/otimizacoes');
  await expect(page.locator('h1')).toHaveText('Onde atuar primeiro');
  await expect(page.locator('nav [aria-current="page"]').first()).toContainText('Otimizações');

  await page.getByRole('link', { name: /Técnicos/ }).click();
  await page.waitForURL(/tipo=tecnico/);

  const corpo = await page.locator('body').innerText();
  // A lista se recusa a afirmar causalidade — inclusive no texto de rodapé.
  expect(corpo).toMatch(/não afirma que lentidão causou|não conclui que o rastreamento quebrou/i);
});

test('mudar a situação pelo seletor grava de verdade e sobrevive ao recarregar', async ({ page }) => {
  /*
   * O caminho que faltava. `marcarSituacao` e a fiação do formulário
   * (`onChange` → `requestSubmit` → Server Action) só eram exercitados por
   * chamadas diretas a `marcarOtimizacao` nos testes de unidade: um formulário
   * quebrado passaria no CI inteiro.
   *
   * É a regra que o próprio CLAUDE.md registra — teste que constrói o caminho
   * que o usuário não tem prova o mecanismo e esconde a tela quebrada. Aqui o
   * teste começa pelo clique.
   */
  await page.goto('/otimizacoes?tipo=tecnico');

  const seletor = page.locator('select[aria-label^="Situação de"]').first();
  await expect(seletor).toBeVisible();
  const linha = page.locator('tbody tr', { has: seletor });

  await seletor.selectOption('em_andamento');
  await expect(linha.getByRole('status')).toContainText('Situação registrada');

  // E ficou GRAVADO: recarregar a página traz a situação de volta do banco, em
  // vez de um estado que só existia na aba aberta.
  await page.reload();
  await expect(page.locator('select[aria-label^="Situação de"]').first()).toHaveValue('em_andamento');
  await expect(linha).toContainText('Em andamento');

  // Devolve ao estado inicial para não deixar rastro entre execuções.
  await page.locator('select[aria-label^="Situação de"]').first().selectOption('pendente');
  await expect(page.locator('tbody tr').first().getByRole('status')).toContainText('Situação registrada');
});

test('o que a medição fechou aparece com as duas notas, e sem afirmar causa', async ({ page }) => {
  /*
   * `resolvida_por_verificacao` era um status inalcançável: quando o sinal
   * sumia, o item só parava de aparecer e a linha ficava no banco com o último
   * status que o operador tinha posto. Fechar sem deixar registro é a mesma
   * falha de "recurso sem porta na tela" — só que do lado do dado.
   *
   * O que este teste trava é o PAR: sem as duas medições juntas a tela diria
   * "resolvido" sem mostrar de quanto para quanto, que é a única coisa que
   * torna a afirmação conferível.
   */
  await page.goto('/otimizacoes');

  const painel = page.locator('section', { hasText: 'Fechadas pela medição' }).first();
  await expect(painel).toBeVisible();

  const linha = painel.locator('table tbody tr', { hasText: '/planos' });
  await expect(linha).toContainText('34');  // a medição de quando foi marcado
  await expect(linha).toContainText('91');  // a medição que fechou
  // E o que mostrou a ausência: uma análise nova, não uma varredura que só
  // notou depois. São afirmações diferentes, e a tela não as confunde.
  await expect(linha).toContainText('nova medição');

  // O painel guarda o par e a data; a conclusão continua sendo de quem lê.
  await expect(painel).toContainText(/não afirma que a correção causou a melhora/i);
});

test('as telas novas não registram erro no console', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => m.type() === 'error' && erros.push(m.text()));

  await page.goto('/visao-geral');
  const cliente = await page.locator('table tbody tr a').first().getAttribute('href');
  for (const rota of ['/visao-geral', cliente!, '/otimizacoes']) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
  }
  expect(erros).toEqual([]);
});
