import { test, expect } from '@playwright/test';
import { entrar } from './apoio';

/**
 * Site dedicado às suítes que gravam.
 *
 * Enviar um formulário pela página de teste também abre uma sessão, então usar
 * um site que outros testes medem tornaria os resultados dependentes da ordem
 * de execução.
 */
const SITE_PUBLICO = 'sit_teste_forms1';

/**
 * Recebimento de formulários: caminho feliz, inválido e falha de servidor.
 *
 * O ponto central é que "sucesso" só aparece quando houve gravação.
 */

test('formulário válido grava e confirma', async ({ page }) => {
  const email = `valido.${Date.now()}@teste.com`;
  await page.goto(`/teste/${SITE_PUBLICO}`);

  await page.fill('input[name=nome]', 'Pessoa Válida');
  await page.fill('input[name=email]', email);
  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(page.getByTestId('retorno-formulario')).toContainText('Envio registrado');

  // E o lead aparece de fato no painel — a confirmação não é decorativa.
  await entrar(page);
  await page.goto('/leads');
  await page.locator('select[aria-label="Site em contexto"]').selectOption({ label: 'escrita.teste' });
  await expect(page.getByRole('cell', { name: 'Pessoa Válida' })).toBeVisible();
});

test('formulário sem contato é recusado pelo servidor, com erro no campo', async ({ page }) => {
  await page.goto(`/teste/${SITE_PUBLICO}`);

  await page.fill('input[name=nome]', 'Sem Contato');
  await page.getByRole('button', { name: 'Enviar' }).click();

  const retorno = page.getByTestId('retorno-formulario');
  await expect(retorno).toContainText('Dados inválidos');
  await expect(retorno).not.toContainText('registrado');
});

test('falha do servidor mostra erro, e não uma confirmação falsa', async ({ page }) => {
  await page.goto(`/teste/${SITE_PUBLICO}`);

  // Força o endpoint a falhar, como aconteceria numa indisponibilidade do banco.
  await page.route('**/api/forms/**', (rota) =>
    rota.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"erro":"Falha simulada"}' }),
  );

  await page.fill('input[name=nome]', 'Pessoa Azarada');
  await page.fill('input[name=email]', `azar.${Date.now()}@teste.com`);
  await page.getByRole('button', { name: 'Enviar' }).click();

  const retorno = page.getByTestId('retorno-formulario');
  await expect(retorno).toContainText('Falha simulada');
  await expect(retorno).not.toContainText('registrado');
});

test('o endpoint público de coleta rejeita site inexistente', async ({ request }) => {
  const resposta = await request.post('/api/collect', {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({
      site: 'sit_nao_existe',
      tipo: 'page_view',
      uid: crypto.randomUUID(),
      visitante: crypto.randomUUID(),
      caminho: '/',
    }),
  });
  expect(resposta.status()).toBe(404);
});

test('o endpoint de coleta recusa evento malformado', async ({ request }) => {
  const resposta = await request.post('/api/collect', {
    headers: { 'Content-Type': 'text/plain' },
    data: JSON.stringify({ site: SITE_PUBLICO, tipo: 'cta_click', uid: crypto.randomUUID(), visitante: crypto.randomUUID(), caminho: '/' }),
  });
  expect(resposta.status()).toBe(400);
  expect(await resposta.text()).toContain('subtipo');
});

test('o mesmo evento reenviado é reconhecido como duplicado', async ({ request }) => {
  const corpo = JSON.stringify({
    site: SITE_PUBLICO,
    tipo: 'page_view',
    uid: crypto.randomUUID(),
    visitante: crypto.randomUUID(),
    caminho: '/idempotencia',
  });
  const opcoes = { headers: { 'Content-Type': 'text/plain' }, data: corpo };

  const primeiro = await request.post('/api/collect', opcoes);
  const segundo = await request.post('/api/collect', opcoes);

  expect(primeiro.status()).toBe(204);
  expect(segundo.status()).toBe(204);
  expect(primeiro.headers()['x-painel-evento']).toBe('registrado');
  expect(segundo.headers()['x-painel-evento']).toBe('duplicado');
});
