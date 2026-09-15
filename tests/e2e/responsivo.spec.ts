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

test.describe('movimento reduzido na tela de login', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a chuva de fundo existe, mas não anima para quem pede menos movimento', async ({ page }) => {
    await page.goto('/entrar');

    // O canvas é renderizado sempre; quem decide se ele desenha é o `data-fx`,
    // e o script do layout raiz o define a partir da preferência do sistema.
    await expect(page.getByTestId('fx-canvas-tela')).toBeAttached();
    await expect(page.locator('html')).toHaveAttribute('data-fx', 'off');
  });
});

test('a chuva de fundo não intercepta o login', async ({ page }) => {
  await page.goto('/entrar');

  const canvas = page.getByTestId('fx-canvas-tela');
  await expect(canvas).toBeAttached();
  // Decorativa: fora da árvore de acessibilidade e transparente ao ponteiro.
  await expect(canvas).toHaveAttribute('aria-hidden', 'true');
  expect(await canvas.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

  // A prova que importa: dá para logar com ela na tela. Um canvas em tela cheia
  // por cima do formulário seria um jeito silencioso de tornar o login
  // inutilizável, e nenhum teste de estilo pegaria isso.
  await page.fill('input[name=email]', 'dona@agencia.teste');
  await page.fill('input[name=senha]', 'teste123456');
  await page.click('button[type=submit]');
  await page.waitForURL('**/visao-geral**');
});

test('o painel se declara instalável, com os ícones que o Chrome exige', async ({ page }) => {
  // O manifesto é servido de verdade, e não só declarado: um caminho errado
  // aqui some sem erro — o navegador simplesmente não oferece a instalação.
  const resposta = await page.goto('/manifest.webmanifest');
  expect(resposta?.status()).toBe(200);

  const manifesto = JSON.parse((await resposta!.text()) ?? '{}');
  expect(manifesto.name).toBeTruthy();
  expect(manifesto.short_name).toBeTruthy();
  expect(manifesto.display).toBe('standalone');
  // Começa na visão geral, não na raiz: a raiz só redireciona, e um salto a
  // cada abertura é um salto por dia de uso.
  expect(manifesto.start_url).toBe('/visao-geral');

  const tamanhos = manifesto.icons.map((i: { sizes: string }) => i.sizes);
  expect(tamanhos).toContain('192x192');
  expect(tamanhos).toContain('512x512');
  // O Android recorta o ícone; sem uma versão `maskable` o recorte come o
  // desenho.
  expect(manifesto.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  // Os arquivos existem mesmo.
  for (const icone of manifesto.icons) {
    const r = await page.request.get(icone.src);
    expect(r.status(), `${icone.src} precisa existir`).toBe(200);
    expect(r.headers()['content-type']).toContain('image/png');
  }

  // A página aponta para o manifesto: sem este link, nada acima é procurado.
  await page.goto('/entrar');
  await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', /manifest/);
});

test('no celular a navegação fica no rodapé, ao alcance do polegar', async ({ page }) => {
  await entrar(page);

  // Era um `aside` de largura mínima 240px que quebrava para uma linha própria
  // e ocupava a tela inteira: no celular era preciso rolar o menu completo
  // antes de chegar a qualquer número. Hoje a barra lateral não existe aqui.
  await expect(page.locator('.lateral')).toBeHidden();

  const rodape = page.locator('.menu-inferior');
  await expect(rodape).toBeVisible();
  expect(await rodape.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');

  const altura = await rodape.evaluate((el) => el.getBoundingClientRect().height);
  const tela = page.viewportSize()!.height;
  expect(altura, 'a barra não pode comer mais de 12% da altura do celular').toBeLessThan(tela * 0.12);
  // E precisa ser grande o bastante para o dedo: um alvo menor que 44px é mira.
  expect(altura, 'e precisa dar um alvo de toque confortável').toBeGreaterThanOrEqual(56);

  // Os seis destinos continuam alcançáveis, e nenhum rótulo é cortado.
  const itens = rodape.getByRole('link');
  await expect(itens).toHaveCount(6);

  const medidas = await rodape.evaluate((barra) => ({
    // A barra NÃO pode rolar na horizontal: arrastá-la parecia a página
    // inteira deslizando, que é o gesto errado no lugar errado.
    rola: barra.scrollWidth > barra.clientWidth + 1,
    // E nenhum rótulo pode estar cortado: "Configuraçõ…" não é um rótulo.
    cortados: [...barra.querySelectorAll('.item-inferior-rotulo')]
      .filter((t) => t.scrollWidth > t.clientWidth + 1)
      .map((t) => t.textContent),
  }));
  expect(medidas.rola, 'a barra de rodapé não pode rolar na horizontal').toBe(false);
  expect(medidas.cortados, 'nenhum rótulo pode ficar cortado').toEqual([]);

  // O conteúdo não termina debaixo da barra fixa.
  const respiro = await page
    .locator('.conteudo-painel')
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  expect(respiro).toBeGreaterThanOrEqual(altura);
});

test('o facho acompanha o item ativo, e o ativo vem da rota', async ({ page }) => {
  await entrar(page);

  const centro = async (sel: string) => {
    const c = await page.locator(sel).boundingBox();
    return c!.x + c!.width / 2;
  };

  /**
   * Tolerância de 2px, e não igualdade exata.
   *
   * A posição do facho é calculada com `offsetLeft`/`offsetWidth`, que são
   * INTEIROS, enquanto a medição do teste usa `getBoundingClientRect`, que é
   * fracionária. Com seis itens dividindo 390px, cada um mede 65,33px — e a
   * diferença de arredondamento é subpixel, não desalinhamento.
   */
  const desalinho = async () =>
    Math.abs((await centro('.facho')) - (await centro('.item-inferior[aria-current="page"]')));

  /**
   * `expect.poll` e não um `waitForTimeout`: o facho desliza numa transição de
   * 340ms, e medir logo após a navegação pega ele no meio do caminho. Esperar
   * um tempo fixo tornaria o teste dependente da máquina; esperar a condição
   * falha só se ele nunca chegar.
   */
  const alinha = async (porque: string) =>
    expect.poll(desalinho, { message: porque, timeout: 3000 }).toBeLessThanOrEqual(2);

  // O destaque é derivado do `pathname`, não de um estado próprio do
  // componente — foi um estado paralelo que, no protótipo, deixava "Leads"
  // aceso sobre a tela de Desempenho.
  await expect(page.locator('.item-inferior[aria-current="page"]')).toHaveAttribute('href', /^\/visao-geral/);
  await alinha('o facho precisa nascer sobre o item ativo');

  // Alvo pelo destino, não pelo texto: a barra de rodapé usa rótulo curto
  // ("Geral", "Ajustes"), e casar por texto amarraria o teste à escolha de
  // palavra em vez do comportamento.
  await page.locator('.item-inferior[href^="/leads"]').click();
  await page.waitForURL('**/leads**');
  await expect(page.locator('.item-inferior[aria-current="page"]')).toHaveAttribute('href', /^\/leads/);
  await alinha('e acompanhar a navegação');
});

test('no celular, sair da conta continua possível — pelas Configurações', async ({ page }) => {
  await entrar(page);
  await page.locator('.item-inferior[href^="/configuracoes"]').click();
  await page.waitForURL('**/configuracoes**');

  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.waitForURL('**/entrar**');
  await expect(page.locator('input[name=email]')).toBeVisible();
});
