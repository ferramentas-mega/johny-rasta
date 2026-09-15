import { expect, test } from '@playwright/test';

/**
 * Tela de login.
 *
 * O caminho feliz já é exercido por cinco suítes (todas entram pelo `/entrar`,
 * via `apoio.ts`), então aqui ficam só as partes que ninguém mais toca: o botão
 * de revelar a senha, que é o único controle interativo novo do cartão, e a
 * mensagem de credencial errada.
 */

test('o botão de revelar alterna a senha sem perder o que foi digitado', async ({ page }) => {
  await page.goto('/entrar');

  const senha = page.locator('input[name=senha]');
  await senha.fill('teste123456');
  await expect(senha).toHaveAttribute('type', 'password');

  // O nome acessível é o que existe: o botão só tem um ícone dentro.
  const revelar = page.getByRole('button', { name: 'Mostrar senha' });
  await expect(revelar).toHaveAttribute('aria-pressed', 'false');
  await revelar.click();

  await expect(senha).toHaveAttribute('type', 'text');
  // A prova que importa: alternar não pode limpar o campo. Recriar o input em
  // vez de trocar o `type` faria exatamente isso, e o usuário redigitaria a
  // senha inteira só por ter conferido o que escreveu.
  await expect(senha).toHaveValue('teste123456');

  const ocultar = page.getByRole('button', { name: 'Ocultar senha' });
  await expect(ocultar).toHaveAttribute('aria-pressed', 'true');
  await ocultar.click();
  await expect(senha).toHaveAttribute('type', 'password');
  await expect(senha).toHaveValue('teste123456');
});

test('credencial errada mostra o erro e não entra', async ({ page }) => {
  await page.goto('/entrar');

  await page.fill('input[name=email]', 'dona@agencia.teste');
  await page.fill('input[name=senha]', 'senha-errada');
  await page.click('button[type=submit]');

  // `p[role=alert]` e não `getByRole('alert')`: o Next mantém um
  // `<div role="alert">` vazio para anunciar rotas, e o seletor casaria os dois.
  await expect(page.locator('p[role=alert]')).toContainText('E-mail ou senha incorretos');
  await expect(page).toHaveURL(/\/entrar/);
});

test('o cartão não oferece caminho que não existe', async ({ page }) => {
  await page.goto('/entrar');

  // O componente de referência trazia "esqueci minha senha", "entrar com o
  // Google" e "criar conta". Nenhum dos três existe neste produto, e um link
  // para rota inexistente é um 404 fantasiado de funcionalidade. Este teste
  // falha se algum voltar sem a implementação junto.
  await expect(page.getByRole('link')).toHaveCount(0);
  await expect(page.getByText(/esqueci|Google|criar conta/i)).toHaveCount(0);
});
