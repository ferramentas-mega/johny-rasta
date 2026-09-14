import { expect, type Page } from '@playwright/test';

export const CREDENCIAIS = {
  agencia: { email: 'dona@agencia.teste', senha: 'teste123456' },
  rival: { email: 'dona@rival.teste', senha: 'teste123456' },
};

export async function entrar(page: Page, quem: keyof typeof CREDENCIAIS = 'agencia') {
  const { email, senha } = CREDENCIAIS[quem];
  await page.goto('/entrar');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=senha]', senha);
  await page.click('button[type=submit]');
  await page.waitForURL('**/visao-geral**');
}

/** Sai da conta pelo botão real do menu, não por uma URL montada à mão. */
export async function sair(page: Page) {
  await page.goto('/visao-geral');
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL('**/entrar**');
}

/** Lê um número formatado em pt-BR (1.234 → 1234). */
export function numero(texto: string | null): number {
  if (!texto) return NaN;
  return Number(texto.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
}

/**
 * Valor de um cartão de indicador, pela chave da métrica.
 *
 * Usa o identificador que o componente emite, em vez de caçar o cartão pelo
 * texto: o rótulo é conteúdo e pode mudar sem que o indicador mude.
 */
export async function valorDoCartao(page: Page, chave: string): Promise<number> {
  const texto = await page.getByTestId(`kpi-valor-${chave}`).textContent();
  return numero(texto);
}

/** Percentual de um cartão (ex.: "37,5%" → 37.5). */
export async function percentualDoCartao(page: Page, chave: string): Promise<number> {
  const texto = (await page.getByTestId(`kpi-valor-${chave}`).textContent()) ?? '';
  return Number(texto.replace('%', '').replace('.', '').replace(',', '.'));
}

/** Falha o teste se o console do navegador registrar erro. */
export function vigiarConsole(page: Page): string[] {
  const erros: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') erros.push(m.text());
  });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  return erros;
}

export async function semErrosDeConsole(erros: string[]) {
  // Ignora ruído do próprio Next em desenvolvimento (hot reload, devtools).
  const relevantes = erros.filter((e) => !/favicon|_next\/static\/chunks\/app-pages|Download the React DevTools/i.test(e));
  expect(relevantes, `erros no console: ${relevantes.join(' | ')}`).toHaveLength(0);
}
