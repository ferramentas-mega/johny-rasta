import { expect, test } from '@playwright/test';
import { entrar } from './apoio';

/**
 * Cabeçalhos de segurança, medidos no navegador.
 *
 * O que estes testes provam que uma leitura do `middleware.ts` não prova: que os
 * cabeçalhos **chegam** na resposta, e que a Content Security Policy não recusa
 * nada do que o painel precisa para funcionar.
 *
 * A segunda parte só tem sentido contra o pacote publicado. O `next dev` compila
 * com `eval`, então uma política sem `'unsafe-eval'` acusa milhares de violações
 * que não existem em produção — medido, 4.536 contra nenhuma. Por isso a própria
 * política só existe quando `NODE_ENV=production`, e o caso que a percorre se
 * declara pulado fora dali em vez de passar sem ter medido coisa alguma.
 *
 * `npm run test:e2e:prod` (e o CI) rodam contra `next start`, que é onde isto
 * vale.
 */

const CONTRA_PRODUCAO = process.env.E2E_PROD === '1';

/** Telas do painel que não dependem de um site existir. */
const ROTAS_FIXAS = ['/visao-geral', '/clientes', '/sites', '/leads', '/otimizacoes', '/configuracoes'];

/** Abas de um site. Cada uma monta componentes diferentes. */
const ABAS_DO_SITE = ['desempenho', 'comportamento', 'qualidade', 'rastreamento', 'configurar'];

test('a resposta traz os cabeçalhos que não dependem de política', async ({ page }) => {
  const resposta = await page.goto('/entrar');
  const cabecalhos = resposta!.headers();

  // Clickjacking: o painel não se embute em iframe nenhum, nem no próprio.
  expect(cabecalhos['x-frame-options']).toBe('DENY');
  // Um arquivo servido como texto não vira script por adivinhação de tipo.
  expect(cabecalhos['x-content-type-options']).toBe('nosniff');
  // O endereço de uma tela (com ids de cliente e site) não vaza no `Referer`.
  expect(cabecalhos['referrer-policy']).toBe('strict-origin-when-cross-origin');
  // Câmera, microfone e localização ficam fechados para qualquer script.
  expect(cabecalhos['permissions-policy']).toContain('camera=()');
});

test('push: a API exige sessão, o opt-in aparece com contexto e não pede permissão ao carregar', async ({ page, request }) => {
  // Sem sessão: nada, em nenhum método.
  expect((await request.get('/api/push', { failOnStatusCode: false })).status()).toBe(401);
  expect((await request.post('/api/push', { data: { endpoint: 'https://x/y', keys: { p256dh: 'aaaaaaaaaaaa', auth: 'bbbbbbbbbbbb' } }, failOnStatusCode: false })).status()).toBe(401);

  // Vigia: pedir permissão no carregamento é o que este teste proíbe.
  await page.addInitScript(() => {
    (window as unknown as { __pediu: number }).__pediu = 0;
    if ('Notification' in window) {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = (async (...args: unknown[]) => {
        (window as unknown as { __pediu: number }).__pediu += 1;
        return original(...(args as []));
      }) as typeof Notification.requestPermission;
    }
  });
  await entrar(page);
  await page.goto('/configuracoes');
  const bloco = page.getByTestId('ativar-notificacoes');
  await expect(bloco).toContainText('mesmo com o painel fechado');
  // Ou o botão de ativar (servidor configurado) ou a explicação honesta de que
  // não está — nunca um botão que promete sem ter chave.
  await expect(bloco.getByRole('button', { name: 'Ativar notificações' }).or(bloco.getByRole('status'))).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pediu: number }).__pediu)).toBe(0);

  // Com sessão, a API responde e nunca entrega chave privada.
  const r = await page.request.get('/api/push');
  expect(r.status()).toBe(200);
  const corpo = await r.json();
  expect(JSON.stringify(corpo)).not.toMatch(/private|privada/i);
  expect(Array.isArray(corpo.dispositivos)).toBe(true);

  // O service worker é servido e é de repasse puro: nada de cache nem fetch.
  const sw = await page.request.get('/sw.js');
  expect(sw.status()).toBe(200);
  const texto = await sw.text();
  expect(texto).toContain("addEventListener('push'");
  expect(texto).not.toMatch(/caches\.|addEventListener\('fetch'/);
});

test('o endpoint de coleta não recebe política de página', async ({ request }) => {
  // `/api/*` é consumido por máquina. Uma CSP ali não protege ninguém e ainda
  // apareceria como configuração a manter.
  const resposta = await request.fetch('/api/diagnostico', { failOnStatusCode: false });
  expect(resposta.headers()['content-security-policy']).toBeUndefined();
  // Os cabeçalhos que valem para tudo continuam valendo.
  expect(resposta.headers()['x-content-type-options']).toBe('nosniff');
});

test('a política bloqueia, e nenhuma tela do painel é recusada por ela', async ({ page }) => {
  test.skip(
    !CONTRA_PRODUCAO,
    'A CSP só existe no pacote publicado. Rode `npm run test:e2e:prod`.',
  );
  test.setTimeout(180_000);

  const recusas: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    // "Refused to …" é a frase com que o navegador anuncia um bloqueio de CSP.
    if (/Content Security Policy|Refused to/i.test(t)) recusas.push(t);
  });

  const resposta = await page.goto('/entrar');
  const cabecalhos = resposta!.headers();
  // Bloqueio, não relatório. `Report-Only` não impede nada, e afirmá-la como
  // proteção seria descrever uma defesa que não existe.
  expect(cabecalhos['content-security-policy']).toBeTruthy();
  expect(cabecalhos['content-security-policy-report-only']).toBeUndefined();
  expect(cabecalhos['content-security-policy']).toContain(`'strict-dynamic'`);
  expect(cabecalhos['strict-transport-security']).toContain('max-age=63072000');

  await entrar(page);
  for (const rota of ROTAS_FIXAS) {
    await page.goto(rota);
    // Espera o React hidratar: um script recusado só reclama quando executa.
    await page.waitForLoadState('networkidle');
  }

  await page.goto('/sites');
  const href = await page
    .locator('.cartao-site a[href*="/desempenho"]')
    .first()
    .getAttribute('href');
  const siteId = href!.split('/')[2];

  for (const aba of ABAS_DO_SITE) {
    await page.goto(`/sites/${siteId}/${aba}`);
    await page.waitForLoadState('networkidle');
  }

  expect(recusas, `a CSP recusou: ${recusas.slice(0, 5).join(' | ')}`).toEqual([]);
});
