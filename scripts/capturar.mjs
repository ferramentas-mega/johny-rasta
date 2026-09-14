/**
 * Captura telas do painel para evidência.
 *
 *   node scripts/capturar.mjs /visao-geral visao-geral 1440
 *
 * Usa o Chromium pré-instalado do ambiente. Falha a captura se o console do
 * navegador registrar erro — uma tela bonita com erro no console não é prova
 * de que funciona.
 */
import { chromium } from '@playwright/test';

const alvo = process.argv[2] ?? '/visao-geral';
const nome = process.argv[3] ?? 'tela';
const largura = Number(process.argv[4] ?? 1440);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: largura, height: 1000 }, deviceScaleFactor: 2 });
const erros = [];
page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));

await page.goto('http://localhost:3000/entrar', { waitUntil: 'networkidle' });
if (page.url().includes('/entrar')) {
  await page.fill('input[name=email]', 'ferramentas@megaads.com.br');
  await page.fill('input[name=senha]', 'painel123');
  await Promise.all([page.waitForURL('**/visao-geral**', { timeout: 20000 }), page.click('button[type=submit]')]);
}
await page.goto(`http://localhost:3000${alvo}`, { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
await page.waitForTimeout(1200);
const dir = '/tmp/claude-0/-home-user-johny-rasta/94511fb4-5f31-5a99-9203-2f6f8fdd0cbb/scratchpad/shots';
await page.screenshot({ path: `${dir}/${nome}.png`, fullPage: true });
console.log('URL final:', page.url());
console.log(erros.length ? `ERROS DE CONSOLE:\n${erros.join('\n')}` : 'console limpo');
await browser.close();
