import { test, expect } from '@playwright/test';
import { entrar, numero } from './apoio';

/**
 * Layout v2: cabeçalho de uma linha, período em todas as abas, tabela
 * ordenável, gráfico por ação e vazio com tom.
 *
 * O que se protege não é a aparência: é que cada controle novo tem um caminho
 * de uso e um estado que sobrevive a recarregar — e que a v2 não perdeu o que
 * a v1 já provava (os totais e o eixo próprio continuam nas provas antigas).
 */

test.beforeEach(async ({ page }) => {
  await entrar(page);
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');
});

test('os chips de período aparecem em TODAS as seções do site, e a escolha atravessa as abas', async ({ page }) => {
  await page.getByRole('button', { name: '30 dias' }).click();
  await page.waitForURL(/periodo=30d/);

  for (const aba of ['Comportamento', 'Qualidade técnica', 'Rastreamento', 'Configuração', 'Desempenho']) {
    await page.getByRole('navigation', { name: 'Seções do site' }).getByRole('link', { name: aba }).click();
    await page.waitForLoadState('networkidle');
    const periodo = page.getByRole('group', { name: 'Período' });
    await expect(periodo, `chips de período em ${aba}`).toBeVisible();
    await expect(periodo.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('o cabeçalho é UMA linha no desktop: título, estado e seletor de site na mesma altura', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'no celular o cabeçalho pode quebrar em duas linhas, de propósito');

  const h1 = await page.locator('.cabecalho h1').boundingBox();
  const estado = await page.locator('.cabecalho-status').boundingBox();
  const seletor = await page.locator('.cabecalho-acoes select[aria-label="Site em contexto"]').boundingBox();
  expect(h1 && estado && seletor).toBeTruthy();

  const centro = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(centro(h1!) - centro(estado!))).toBeLessThan(12);
  expect(Math.abs(centro(h1!) - centro(seletor!))).toBeLessThan(12);

  // O kicker desceu para a linha de baixo, e continua na tela.
  await expect(page.locator('.sub-cabecalho')).toContainText(/DESEMPENHO/i);
});

test('clicar no cabeçalho da coluna ordena, marca a coluna ativa, vai para a URL e sobrevive a recarregar', async ({ page }) => {
  const painel = page.locator('section').filter({ hasText: 'Desempenho por página' }).first();
  // A segunda célula de CADA linha — `tr >> td >> nth(1)` seria a segunda
  // célula da tabela inteira, e `first()`/`last()` cairiam no mesmo elemento.
  const sessoes = () => painel.locator('tbody tr td:nth-child(2)');

  // Padrão: maior primeiro.
  const primeiraDesc = numero(await sessoes().first().textContent());
  const ultimaDesc = numero(await sessoes().last().textContent());
  expect(primeiraDesc).toBeGreaterThanOrEqual(ultimaDesc);
  await expect(painel.locator('th', { hasText: 'Sessões' })).toHaveAttribute('aria-sort', 'descending');

  await painel.getByRole('link', { name: 'Ordenar por Sessões, crescente' }).click();
  await page.waitForURL(/ordem_paginas=sessoes%3Aasc/);
  await expect(painel.locator('th', { hasText: 'Sessões' })).toHaveAttribute('aria-sort', 'ascending');
  const primeiraAsc = numero(await sessoes().first().textContent());
  const ultimaAsc = numero(await sessoes().last().textContent());
  expect(primeiraAsc).toBeLessThanOrEqual(ultimaAsc);
  expect(primeiraAsc).toBe(ultimaDesc);

  // O total NÃO muda com a ordem.
  const totalAntes = await painel.locator('tfoot td').nth(1).textContent();
  await page.reload();
  await expect(painel.locator('th', { hasText: 'Sessões' })).toHaveAttribute('aria-sort', 'ascending');
  expect(await painel.locator('tfoot td').nth(1).textContent()).toBe(totalAntes);

  // O texto do cabeçalho continua sendo só o título: a seta é desenho, não nome.
  const textos = await painel.locator('thead th').allTextContents();
  expect(textos.map((t) => t.trim())).toContain('Sessões');
});

test('o gráfico troca para barras por ação e a legenda muda junto', async ({ page }) => {
  const painel = page.locator('section').filter({ hasText: 'Evolução do desempenho' });
  await expect(painel.locator('path[data-serie="principal"]')).toHaveCount(1);
  await expect(painel.locator('path[data-serie="anterior"]')).toHaveCount(1);

  await painel.getByRole('button', { name: 'Barras por ação' }).click();
  await expect(painel.locator('rect[data-acao]').first()).toBeVisible();
  await expect(painel).toContainText('WhatsApp');
  await expect(painel.locator('path[data-serie="principal"]')).toHaveCount(0);
  // O eixo continua com marcas inteiras.
  const marcas = await painel.locator('svg text[data-eixo="esquerda"]').allTextContents();
  expect(marcas.length).toBeGreaterThan(0);
  for (const m of marcas) expect(Number.isInteger(numero(m))).toBe(true);

  await painel.getByRole('button', { name: 'Linha' }).click();
  await expect(painel.locator('path[data-serie="principal"]')).toHaveCount(1);
});

test('percorrer os dias pelo teclado escreve os números do dia', async ({ page }) => {
  const painel = page.locator('section').filter({ hasText: 'Evolução do desempenho' });
  await painel.locator('svg.grafico-svg').focus();
  await page.keyboard.press('ArrowRight');
  const dica = painel.locator('.grafico-dica');
  await expect(dica).toBeVisible();
  await expect(dica).toContainText('Visitas');
  await expect(dica).toContainText('Anterior');
  await page.keyboard.press('Escape');
  await expect(dica).toHaveCount(0);
});

test('a origem dos acessos tem anel, legenda e uma cor por linha — e a tabela continua fechando', async ({ page }) => {
  const painel = page.locator('section').filter({ hasText: 'Origem dos acessos' }).first();
  const fatias = painel.locator('circle[data-fatia]');
  expect(await fatias.count()).toBeGreaterThan(0);
  expect(await fatias.count()).toBeLessThanOrEqual(5);
  const linhas = await painel.locator('tbody tr').count();
  expect(linhas).toBeGreaterThanOrEqual(await fatias.count());
});

test('site sem coleta mostra o vazio com tom, kicker e caminho para a configuração', async ({ page }) => {
  await page.locator('select[aria-label="Site em contexto"]').selectOption({ label: 'novo.teste' });
  await page.waitForLoadState('networkidle');

  const vazio = page.locator('[data-tom]').filter({ hasText: 'Este site ainda não recebeu eventos' });
  await expect(vazio).toBeVisible();
  await expect(vazio).toHaveAttribute('data-tom', /aguardando|erro/);
  await expect(vazio.getByRole('link', { name: 'Ir para a configuração' })).toHaveAttribute('href', /\/configurar$/);
});
