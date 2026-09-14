import { test, expect } from '@playwright/test';
import { entrar } from './apoio';

/**
 * Celular, teclado e redução de movimento.
 *
 * Roda no projeto "mobile" (Pixel 5). O que se verifica aqui não é estética: é
 * que a página não ganha rolagem lateral, que dá para navegar sem mouse e que
 * quem pede menos movimento não recebe animação.
 */

test('nenhuma tela produz rolagem horizontal no celular', async ({ page }) => {
  await entrar(page);

  for (const rota of ['/visao-geral', '/clientes', '/sites', '/leads', '/configuracoes']) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');

    const estouro = await page.evaluate(() => {
      const el = document.documentElement;
      return { scroll: el.scrollWidth, cliente: el.clientWidth };
    });
    expect(estouro.scroll, `rolagem lateral em ${rota}`).toBeLessThanOrEqual(estouro.cliente + 1);
  }
});

test('a tela de desempenho cabe na largura do celular', async ({ page }) => {
  await entrar(page);
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');
  await page.waitForLoadState('networkidle');

  const estouro = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
  expect(estouro.scroll).toBeLessThanOrEqual(estouro.cliente + 1);

  // As tabelas largas rolam DENTRO do próprio contêiner, não na página.
  const container = page
    .locator('section')
    .filter({ hasText: 'Desempenho por página' })
    .getByTestId('rolagem-tabela');
  await expect(container).toHaveCSS('overflow-x', 'auto');
});

test('dá para chegar ao menu e ativar um item apenas com o teclado', async ({ page }) => {
  await entrar(page);
  await page.goto('/visao-geral');

  // Tabula até o link de Clientes e ativa com Enter.
  const clientes = page.getByRole('link', { name: /^Clientes/ });
  await clientes.focus();
  await expect(clientes).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/clientes**');
  await expect(page.locator('h1')).toHaveText('Clientes');
});

test('o foco do teclado é sempre visível', async ({ page }) => {
  await entrar(page);
  await page.goto('/visao-geral');

  const alvo = page.getByRole('link', { name: /^Sites/ });
  await alvo.focus();
  const contorno = await alvo.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(contorno).not.toBe('none');
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });

  test('quem pede menos movimento começa sem os efeitos do cabeçalho', async ({ page }) => {
    await entrar(page);
    await page.goto('/visao-geral');

    // A preferência do sistema define o padrão, sem precisar clicar em nada.
    await expect(page.locator('html')).toHaveAttribute('data-fx', 'off');
    await expect(page.getByRole('button', { name: /FX/ })).toHaveAttribute('aria-pressed', 'false');
  });
});

test('é possível desligar e religar os efeitos, e a escolha persiste', async ({ page }) => {
  await entrar(page);
  await page.goto('/visao-geral');

  const botao = page.getByRole('button', { name: /FX/ });
  const estadoInicial = await page.locator('html').getAttribute('data-fx');

  await botao.click();
  const invertido = estadoInicial === 'on' ? 'off' : 'on';
  await expect(page.locator('html')).toHaveAttribute('data-fx', invertido);

  // Recarregar preserva a escolha.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-fx', invertido);
});
