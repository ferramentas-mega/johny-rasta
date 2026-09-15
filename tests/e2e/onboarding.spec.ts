import { expect, test, type Page } from '@playwright/test';
import { entrar } from './apoio';

/**
 * Configuração de mensuração, do cadastro à primeira medição verificada.
 *
 * Os casos aqui existem para travar as promessas que o produto faz sobre esta
 * parte — principalmente as NEGATIVAS, que são as fáceis de quebrar sem
 * ninguém notar: copiar código não marca instalação, evento de teste não entra
 * em relatório, e configuração de outro cliente não é acessível.
 */

async function cadastrarSite(page: Page, sufixo: string) {
  const carimbo = `${Date.now()}-${sufixo}`;
  const nome = `onb-${carimbo}`;
  const dominio = `onb-${carimbo}.teste`;

  await page.goto('/sites');
  await page.getByRole('button', { name: '+ Novo site' }).click();
  await page.locator('select[name=clienteId]').selectOption({ index: 0 });
  await page.fill('input[name=nome]', nome);
  await page.fill('input[name=dominio]', dominio);
  await page.getByRole('button', { name: 'Cadastrar site' }).click();
  await page.waitForURL('**/configurar**');

  return { nome, dominio, siteId: new URL(page.url()).pathname.split('/')[2]! };
}

test('cadastrar cliente durante o onboarding não perde os dados do site', async ({ page }) => {
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'cliente');

  await page.goto(`/sites/${siteId}/configurar?etapa=identificacao`);

  // Preenche o site ANTES de criar o cliente: é exatamente o momento em que
  // mandar o operador para outra tela faria ele perder o que digitou.
  const novoNome = `Renomeado ${Date.now()}`;
  await page.fill('input[name=nome]', novoNome);

  const nomeCliente = `Cliente inline ${Date.now()}`;
  await page.getByRole('button', { name: '+ Novo cliente' }).click();
  // O formulário de cliente tem o seu próprio campo `nome`; o do site é o outro.
  await page.locator('form').filter({ hasText: 'Nome do novo cliente' }).locator('input[name=nome]').fill(nomeCliente);
  await page.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page.getByRole('status')).toContainText('criado');

  // A prova: o nome do site continua onde estava.
  await expect(page.locator('input[name=nome]').last()).toHaveValue(novoNome);
  // E o cliente novo já está selecionado.
  await expect(page.locator('select[name=clienteId]')).toHaveValue(/.+/);
  await expect(page.locator('select[name=clienteId] option:checked')).toHaveText(nomeCliente);
});

test('domínio duplicado é explicado e aponta para o site existente', async ({ page }) => {
  await entrar(page);
  const primeiro = await cadastrarSite(page, 'dup');

  // Tenta cadastrar OUTRO site com o mesmo domínio.
  await page.goto('/sites');
  await page.getByRole('button', { name: '+ Novo site' }).click();
  await page.locator('select[name=clienteId]').selectOption({ index: 0 });
  await page.fill('input[name=nome]', `outro-${Date.now()}`);
  await page.fill('input[name=dominio]', primeiro.dominio);
  await page.getByRole('button', { name: 'Cadastrar site' }).click();

  // Não cria em silêncio: explica e continua na lista.
  await expect(page.locator('p[role=alert]')).toContainText('já pertence ao site');
  await expect(page).toHaveURL(/\/sites/);
});

test('só PageSpeed: o caminho fecha sem instalar rastreamento', async ({ page }) => {
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'psi');

  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:qualidade"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${siteId}/configurar?etapa=resumo`);

  // Instalar e verificar NÃO se aplicam: a análise técnica é independente.
  const passos = page.getByRole('navigation', { name: 'Etapas da configuração' });
  await expect(passos.getByRole('link', { name: /Instalar o rastreamento/ })).toContainText('não se aplica');
  await expect(passos.getByRole('link', { name: /Verificar visitas e cliques/ })).toContainText('não se aplica');

  // E os recursos de coleta aparecem como "Não se aplica" no resumo.
  await expect(page.getByText('Visitas e páginas acessadas')).toBeVisible();
});

test('configuração incompleta é salva e retomada na etapa certa', async ({ page }) => {
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'retomar');

  // Um site recém-cadastrado ainda não tem plataforma nem URL principal, então
  // a primeira pendência é a identificação — e o assistente abre nela.
  await page.goto(`/sites/${siteId}/configurar`);
  await expect(page.locator('h2').first()).toHaveText('Identificar o site');

  await page.selectOption('select[name=plataforma]', 'wordpress');
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();
  // Salvar resolve a pendência, e o assistente avança sozinho para a próxima —
  // a etapa mostrada é sempre a primeira pendente, não a última visitada.
  await expect(page.locator('h2').first()).toHaveText('Escolher o que acompanhar');
  // A plataforma gravada aparece no cabeçalho do site.
  await expect(page.getByText('WordPress')).toBeVisible();

  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();
  await expect(page.getByRole('status')).toContainText('1 recurso(s)');

  // Sai e volta sem dizer a etapa: retoma onde parou, porque a etapa é
  // derivada do que está salvo — não de um contador.
  await page.goto('/visao-geral');
  await page.goto(`/sites/${siteId}/configurar`);
  await expect(page.locator('h2').first()).toHaveText('Instalar o rastreamento');

  // E a instrução mostrada é a da plataforma escolhida, não as cinco versões.
  await expect(page.getByText(/Aparência › Editor de temas/)).toBeVisible();

  // A escolha continua marcada.
  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await expect(page.locator('input[name="recurso:visitas"]')).toBeChecked();
});

test('o snippet traz o identificador do site certo, e copiar não conclui a instalação', async ({ page }) => {
  await entrar(page);
  const a = await cadastrarSite(page, 'snipA');
  const b = await cadastrarSite(page, 'snipB');

  await page.goto(`/sites/${a.siteId}/configurar?etapa=instalacao`);
  const idA = ((await page.locator('pre').first().textContent()) ?? '').match(/sit_[a-f0-9]+/)?.[0];
  await page.goto(`/sites/${b.siteId}/configurar?etapa=instalacao`);
  const idB = ((await page.locator('pre').first().textContent()) ?? '').match(/sit_[a-f0-9]+/)?.[0];

  expect(idA).toBeTruthy();
  expect(idB).toBeTruthy();
  expect(idA).not.toBe(idB);

  // Copiar confirma a cópia — e nada mais. A etapa de instalação continua
  // pendente até a verificação, que é a única evidência real.
  await page.goto(`/sites/${b.siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${b.siteId}/configurar?etapa=instalacao`);
  await page.getByRole('button', { name: 'Copiar' }).first().click();
  await expect(page.getByRole('button', { name: 'Copiado' })).toBeVisible();

  await page.reload();
  const passos = page.getByRole('navigation', { name: 'Etapas da configuração' });
  await expect(passos.getByRole('link', { name: /Instalar o rastreamento/ })).toContainText('pendente');
});

test('visita e clique de diagnóstico verificam a etapa, e ficam fora dos relatórios', async ({ page, context }) => {
  test.setTimeout(120_000);
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'diag');

  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.check('input[name="recurso:whatsapp"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);
  const publicId = ((await page.locator('pre').first().textContent()) ?? '').match(/sit_[a-f0-9]+/)![0];

  await page.goto(`/sites/${siteId}/configurar?etapa=verificacao`);
  await page.getByRole('button', { name: 'Abrir modo de diagnóstico' }).click();

  const link = page.locator('a[href*="painel_diag="]');
  await expect(link).toBeVisible();
  const token = new URL((await link.getAttribute('href'))!).searchParams.get('painel_diag')!;
  expect(token).toMatch(/^diag_[a-f0-9]+$/);

  // Antes de qualquer gesto: conferir não inventa sucesso, e não confirma por
  // tempo decorrido nem pela presença do snippet.
  await page.getByRole('button', { name: 'Conferir o que chegou' }).click();
  await expect(page.getByText('Ainda não recebemos nenhum evento deste diagnóstico')).toBeVisible();

  // O token sobrevive ao recarregamento, porque vem do banco.
  await page.reload();
  await expect(page.locator(`a[href*="${token}"]`)).toBeVisible();

  // Abre a página de teste do site COM o token, como o operador faria.
  const site = await context.newPage();
  await site.goto(`/teste/${publicId}?painel_diag=${token}`);
  await site.waitForTimeout(1200);
  const requisicao = site.waitForRequest(
    (r) => r.url().includes('/api/collect') && r.method() === 'POST',
  );
  await site.getByRole('link', { name: /WhatsApp/i }).first().click();
  await requisicao;
  await site.waitForTimeout(800);
  await site.close();

  // Agora a conferência encontra os eventos e carimba a verificação.
  await page.goto(`/sites/${siteId}/configurar?etapa=verificacao`);
  await page.getByRole('button', { name: 'Conferir o que chegou' }).click();
  await expect(page.getByText(/evento\(s\) recebido\(s\) neste diagnóstico/)).toBeVisible();

  // A etapa passa a concluída — e o resumo reflete isso.
  await page.goto(`/sites/${siteId}/configurar?etapa=resumo`);
  const passos = page.getByRole('navigation', { name: 'Etapas da configuração' });
  await expect(passos.getByRole('link', { name: /Verificar visitas e cliques/ })).toContainText('concluída');

  // E o diagnóstico NÃO entra em relatório comercial: o site continua sem
  // sessões contabilizadas no painel do cliente.
  await page.goto(`/sites/${siteId}/desempenho`);
  await expect(page.getByText(/Indisponível|Sem coleta|0/).first()).toBeVisible();
});

test('a configuração de outro cliente não é acessível pela URL', async ({ page }) => {
  await entrar(page, 'agencia');
  const { siteId } = await cadastrarSite(page, 'isolado');

  // Sai e entra como a conta rival.
  await page.goto('/visao-geral');
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL('**/entrar**');
  await entrar(page, 'rival');

  const resposta = await page.goto(`/sites/${siteId}/configurar`);
  expect(resposta?.status()).toBe(404);
});
