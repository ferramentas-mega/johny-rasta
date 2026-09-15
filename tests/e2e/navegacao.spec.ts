import { test, expect } from '@playwright/test';
import { entrar, valorDoCartao, vigiarConsole, semErrosDeConsole } from './apoio';
import { ESPERADO_FUNIL_BETA_7D } from '../../scripts/test-db';

/**
 * Navegação, filtros e estado na URL.
 *
 * O protótipo mostrava "Leads" aceso no menu enquanto a tela exibia Desempenho,
 * porque o destaque vinha de um estado próprio. Aqui o item ativo é derivado do
 * pathname, e os testes cobrem justamente isso.
 */

test.beforeEach(async ({ page }) => {
  await entrar(page);
});

test('o item ativo do menu corresponde sempre à tela mostrada', async ({ page }) => {
  const casos = [
    { rota: '/visao-geral', item: 'Visão geral', titulo: /Agência Teste/ },
    { rota: '/clientes', item: 'Clientes', titulo: /Clientes/ },
    { rota: '/sites', item: 'Sites', titulo: /Sites e landing pages/ },
    { rota: '/leads', item: 'Leads', titulo: /Leads recebidos/ },
    { rota: '/configuracoes', item: 'Configurações', titulo: /Configurações/ },
  ];

  for (const caso of casos) {
    await page.goto(caso.rota);
    await expect(page.locator('h1')).toHaveText(caso.titulo);

    // `getByRole` e não um seletor CSS: existem DOIS menus no DOM — a barra
    // lateral e a faixa de rodapé do celular —, e só um deles está visível por
    // vez. O seletor CSS contaria os dois; a consulta por papel respeita a
    // árvore de acessibilidade, que é justamente o que "um item ativo" quer
    // dizer.
    const ativos = page
      .getByRole('navigation', { name: 'Seções do painel' })
      .getByRole('link')
      .and(page.locator('[aria-current="page"]'));
    await expect(ativos).toHaveCount(1);
    await expect(ativos).toContainText(caso.item);
  }
});

test('dentro de um site, o menu aponta Sites e a aba correta fica ativa', async ({ page }) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');

  const ativoMenu = page
    .getByRole('navigation', { name: 'Seções do painel' })
    .getByRole('link')
    .and(page.locator('[aria-current="page"]'));
  await expect(ativoMenu).toHaveCount(1);
  await expect(ativoMenu).toContainText('Sites');

  for (const aba of ['Comportamento', 'Rastreamento', 'Desempenho']) {
    await page.getByRole('navigation', { name: 'Seções do site' }).getByRole('link', { name: aba }).click();
    await page.waitForLoadState('networkidle');
    const ativa = page.locator('nav[aria-label="Seções do site"] a[aria-current="page"]');
    await expect(ativa).toHaveCount(1);
    await expect(ativa).toHaveText(aba);
    // O menu lateral continua em Sites: a aba não é uma seção do menu.
    await expect(ativoMenu).toContainText('Sites');
  }
});

test('trocar o período muda os números, não apenas o botão', async ({ page }) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');

  const sessoes = () => valorDoCartao(page, 'sessoes');

  await page.getByRole('button', { name: '7 dias' }).click();
  await page.waitForURL(/periodo=7d/);
  const seteDias = await sessoes();

  await page.getByRole('button', { name: 'Hoje' }).click();
  await page.waitForURL(/periodo=hoje/);
  const hoje = await sessoes();

  expect(seteDias).toBe(8);
  expect(hoje).toBe(1);
  expect(hoje).toBeLessThan(seteDias);
  await expect(page.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true');
});

test('trocar de site atualiza todos os módulos da tela', async ({ page }) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');
  await expect(page.locator('h1')).toHaveText('alfa.teste');

  await page.locator('select[aria-label="Site em contexto"]').selectOption({ label: 'beta.teste' });
  await page.waitForURL(/beta|sites\//);
  await expect(page.locator('h1')).toHaveText('beta.teste');

  // Lido da massa, e não escrito à mão aqui: o número mudou quando a sessão b3
  // (que envia sem clicar) entrou em Beta, e o teste quebrou por ter duas fontes
  // de verdade para o mesmo fato. Uma delas agora é a única.
  expect(await valorDoCartao(page, 'sessoes')).toBe(ESPERADO_FUNIL_BETA_7D.sessoes);
});

test('recarregar e abrir a rota diretamente preservam o mesmo estado', async ({ page }) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.getByRole('button', { name: '30 dias' }).click();
  await page.waitForURL(/periodo=30d/);

  const url = page.url();
  const antes = await page.locator('h1').textContent();

  await page.reload();
  expect(page.url()).toBe(url);
  expect(await page.locator('h1').textContent()).toBe(antes);
  await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');

  // Abrir a mesma URL numa navegação limpa dá o mesmo resultado.
  await page.goto('about:blank');
  await page.goto(url);
  expect(await page.locator('h1').textContent()).toBe(antes);
  await expect(page.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');
});

test('voltar e avançar no navegador funcionam', async ({ page }) => {
  await page.goto('/visao-geral');
  await page.getByRole('link', { name: /^Clientes/ }).click();
  await page.waitForURL('**/clientes**');
  await page.getByRole('link', { name: /^Leads/ }).click();
  await page.waitForURL('**/leads**');

  await page.goBack();
  await page.waitForURL('**/clientes**');
  await expect(page.locator('h1')).toHaveText('Clientes');

  await page.goBack();
  await page.waitForURL('**/visao-geral**');

  await page.goForward();
  await page.waitForURL('**/clientes**');
  await expect(page.locator('h1')).toHaveText('Clientes');
});

test('clicar no cartão de formulários abre os leads daquele site e período', async ({ page }) => {
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');

  await page.getByTestId('kpi-formularios').click();
  await page.waitForURL('**/leads**');

  await expect(page.locator('h1')).toHaveText('Leads recebidos');
  // O contexto de site acompanhou a navegação.
  await expect(page.locator('body')).toContainText('alfa.teste');
});

test('editar o nome de um site atualiza sua identificação nas outras telas', async ({ page }) => {
  const novoNome = `beta-renomeado-${Date.now()}`;

  await page.goto('/sites');
  const cartao = page.locator('.cartao-site').filter({ hasText: 'beta.teste' });
  const href = await cartao.getByRole('link', { name: 'beta.teste' }).getAttribute('href');
  const siteId = href!.split('/')[2];

  // Pela INTERFACE, e não por uma URL montada à mão.
  //
  // Esta prova montava `/sites?editar=<id>` sozinha, e por isso passava
  // enquanto a edição estava inalcançável: a Action existia, a URL respondia, o
  // formulário funcionava — e nenhum lugar da tela levava até lá. Um teste que
  // constrói o caminho que o usuário não tem prova o mecanismo e esconde o
  // produto quebrado.
  await cartao.getByRole('link', { name: 'Editar' }).click();
  await page.waitForURL(`**/sites?editar=${siteId}`);

  const campoNome = page.locator('input[name=nome]');
  await expect(campoNome).toHaveValue('beta.teste');
  await campoNome.fill(novoNome);
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('status')).toContainText('todas as telas');

  // E há saída. Antes, salvar deixava o formulário aberto no mesmo site, sem
  // nada para clicar — a edição tinha funcionado e a tela não dizia isso.
  await page.getByRole('link', { name: 'Voltar para a lista' }).click();
  await page.waitForURL((u) => !u.search.includes('editar'));

  // Existe UM registro do site, então o nome novo vale em toda parte.
  await page.goto('/sites');
  await expect(page.locator('.cartao-site').filter({ hasText: novoNome })).toBeVisible();

  // A Visão geral passou a listar CLIENTES, um por linha, somando os sites de
  // cada um — então o nome do site não aparece mais lá, e não deve mesmo. Quem
  // mostra sites por nome agora é o painel do cliente, e é lá que o rename
  // precisa ter chegado. O cliente é derivado da própria tela de Sites, para o
  // teste não depender de um nome fixo da massa.
  await page.goto('/sites');
  // O cliente é identificado pelo link que leva a `?cliente=<id>` — posição de
  // coluna mudaria com o layout, o destino do link não.
  const clienteDoSite = (await page
    .locator('.cartao-site').filter({ hasText: novoNome })
    .locator('a[href^="/sites?cliente="]')
    .innerText()).trim();

  await page.goto('/visao-geral');
  await expect(page.getByRole('cell', { name: novoNome })).toHaveCount(0);
  await page.getByRole('link', { name: clienteDoSite.trim(), exact: true }).click();
  await page.waitForURL(/\/clientes\//);
  await expect(page.getByRole('cell', { name: new RegExp(novoNome) })).toBeVisible();

  await page.goto(`/sites/${siteId}/desempenho`);
  await expect(page.locator('h1')).toHaveText(novoNome);

  await page.goto(`/sites/${siteId}/rastreamento`);
  await expect(page.locator('h1')).toHaveText(novoNome);

  // E o seletor de site, que é outro lugar onde o nome aparece.
  await expect(page.locator('select[aria-label="Site em contexto"]')).toContainText(novoNome);
});

test('as telas não registram erro no console do navegador', async ({ page }) => {
  const erros = vigiarConsole(page);

  for (const rota of ['/visao-geral', '/clientes', '/sites', '/leads', '/configuracoes']) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle');
  }

  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  for (const aba of ['Comportamento', 'Rastreamento']) {
    await page.getByRole('navigation', { name: 'Seções do site' }).getByRole('link', { name: aba }).click();
    await page.waitForLoadState('networkidle');
  }

  await semErrosDeConsole(erros);
});
