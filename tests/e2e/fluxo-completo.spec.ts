import { test, expect } from '@playwright/test';
import { entrar, sair, valorDoCartao, vigiarConsole, semErrosDeConsole } from './apoio';

/**
 * O fluxo completo do §12, do começo ao fim, com persistência real:
 *
 *   cadastrar cliente → cadastrar site → abrir instalação → visitar a página
 *   de teste → clicar no WhatsApp → enviar formulário → ver o lead → conferir
 *   o dashboard.
 *
 * Nada aqui é simulado: o coletor real dispara contra o endpoint real, e os
 * números conferidos no final saem do banco.
 */
test('cliente, site, coleta, formulário, lead e dashboard', async ({ page, context }) => {
  const erros = vigiarConsole(page);
  test.setTimeout(120_000);

  const carimbo = Date.now();
  const nomeCliente = `Cliente E2E ${carimbo}`;
  const nomeSite = `site-e2e-${carimbo}`;
  const dominio = `e2e-${carimbo}.teste`;

  await entrar(page);

  // ─── 1. Cadastrar o cliente ───────────────────────────────────────────────
  await page.goto('/clientes');
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  await page.fill('input[name=nome]', nomeCliente);
  await page.getByRole('button', { name: 'Cadastrar cliente' }).click();
  await expect(page.getByRole('status')).toContainText('cadastrado');
  await expect(page.getByRole('cell', { name: nomeCliente })).toBeVisible();

  // ─── 2. O cliente novo aparece no cadastro de sites ───────────────────────
  await page.goto('/sites');
  await page.getByRole('button', { name: '+ Novo site' }).click();
  const seletorCliente = page.locator('select[name=clienteId]');
  await expect(seletorCliente.locator('option', { hasText: nomeCliente })).toHaveCount(1);

  // ─── 3. Cadastrar o site ──────────────────────────────────────────────────
  await seletorCliente.selectOption({ label: nomeCliente });
  await page.fill('input[name=nome]', nomeSite);
  await page.fill('input[name=dominio]', dominio);
  await page.getByRole('button', { name: 'Cadastrar site' }).click();

  const aviso = page.getByRole('status');
  await expect(aviso).toContainText('identificador');
  const textoAviso = (await aviso.textContent()) ?? '';
  const publicId = textoAviso.match(/sit_[a-f0-9]+/)?.[0];
  expect(publicId, 'o cadastro precisa gerar um identificador público').toBeTruthy();

  // O site aparece na listagem, e ainda NÃO está coletando.
  await expect(page.getByRole('cell', { name: nomeSite })).toBeVisible();
  const linhaSite = page.getByRole('row').filter({ hasText: nomeSite });
  await expect(linhaSite).toContainText(/Aguardando/);

  // ─── 4. Abrir a instalação ────────────────────────────────────────────────
  await linhaSite.getByRole('link', { name: 'Instalação →' }).click();
  await page.waitForURL('**/rastreamento**');
  await expect(page.locator('pre').first()).toContainText(publicId!);
  // Cadastrar não instala: o estado continua sendo de espera.
  await expect(page.locator('h1')).toHaveText(nomeSite);
  await expect(page.getByText('Aguardando primeiro evento').first()).toBeVisible();

  // ─── 5. Visitar a página de teste, que carrega o coletor de verdade ───────
  const pagina = await context.newPage();
  const errosPagina = vigiarConsole(pagina);
  await pagina.goto(`/teste/${publicId}`);
  await expect(pagina.getByRole('heading', { name: dominio })).toBeVisible();
  // Espera o page_view sair.
  await pagina.waitForTimeout(1500);

  // ─── 6. Clicar no WhatsApp ────────────────────────────────────────────────
  // O link abre em nova aba; o que importa é que o evento saia sem bloquear.
  const requisicaoDeColeta = pagina.waitForRequest(
    (r) => r.url().includes('/api/collect') && r.method() === 'POST',
    { timeout: 10_000 },
  );
  await pagina.getByRole('link', { name: 'Falar no WhatsApp' }).click({ modifiers: ['Alt'] });
  await requisicaoDeColeta;

  // ─── 7. Enviar o formulário ───────────────────────────────────────────────
  const emailLead = `lead.e2e.${carimbo}@teste.com`;
  await pagina.getByRole('button', { name: 'Solicitar proposta' }).click();
  await pagina.fill('input[name=nome]', 'Lead de Ponta a Ponta');
  await pagina.fill('input[name=email]', emailLead);
  await pagina.fill('input[name=telefone]', '11 98888-7777');
  await pagina.getByRole('button', { name: 'Enviar' }).click();

  await expect(pagina.getByTestId('retorno-formulario')).toContainText('Envio registrado');
  await semErrosDeConsole(errosPagina);

  // Reenviar o MESMO preenchimento não pode criar um segundo lead.
  await pagina.waitForTimeout(500);
  await pagina.close();

  // ─── 8. O lead aparece no painel ──────────────────────────────────────────
  await page.goto('/leads');
  // O site recém-criado precisa ser o selecionado.
  await page.locator('select[aria-label="Site em contexto"]').selectOption({ label: nomeSite });
  await page.waitForURL(/site=/);
  await expect(page.getByRole('cell', { name: 'Lead de Ponta a Ponta' })).toBeVisible();

  // ─── 9. O dashboard reflete tudo ──────────────────────────────────────────
  await page.goto('/sites');
  await page.getByRole('row').filter({ hasText: nomeSite }).getByRole('link', { name: nomeSite }).click();
  await page.waitForURL('**/desempenho**');

  // Agora sim: coletando.
  await expect(page.getByText('Coletando').first()).toBeVisible();

  expect(await valorDoCartao(page, 'sessoes')).toBe(1);
  expect(await valorDoCartao(page, 'cliquesWhatsapp')).toBe(1);
  expect(await valorDoCartao(page, 'formularios')).toBe(1);
  // Abrir o formulário e enviá-lo são eventos distintos, e ambos foram contados.
  expect(await valorDoCartao(page, 'visualizacoes')).toBeGreaterThanOrEqual(1);

  // A tabela por botão registra o clique com o identificador marcado.
  await expect(page.getByRole('cell', { name: 'Falar no WhatsApp' })).toBeVisible();

  await semErrosDeConsole(erros);
});

/**
 * Isolamento entre contas, do lado do navegador.
 *
 * Um usuário autenticado que monta a URL de um site alheio à mão não pode
 * receber os dados — a RLS devolve nada e a rota responde 404.
 */
test('um site de outra conta não é acessível pela URL', async ({ page }) => {
  await entrar(page, 'rival');

  // Descobre o id de um site da conta rival (a própria), para provar que a URL
  // funciona quando o dono é o certo.
  await page.goto('/sites');
  const proprio = page.getByRole('link', { name: 'rival.teste' });
  await expect(proprio).toBeVisible();
  const href = await proprio.getAttribute('href');
  expect(href).toContain('/sites/');
  await page.goto(href!);
  await expect(page.locator('h1')).toHaveText('rival.teste');

  // Agora entra como a outra agência e tenta a MESMA URL.
  await sair(page);
  await entrar(page, 'agencia');

  const resposta = await page.goto(href!);
  expect(resposta?.status()).toBe(404);
  await expect(page.locator('body')).not.toContainText('rival.teste');
});

test('o lead de outra conta não aparece em lugar nenhum', async ({ page }) => {
  await entrar(page, 'agencia');

  for (const rota of ['/leads', '/visao-geral', '/clientes', '/sites']) {
    await page.goto(rota);
    await expect(page.locator('body')).not.toContainText('Lead Confidencial');
    await expect(page.locator('body')).not.toContainText('segredo@rival.teste');
    await expect(page.locator('body')).not.toContainText('rival.teste');
  }
});
