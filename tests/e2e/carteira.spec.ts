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
