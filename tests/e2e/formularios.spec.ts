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

/**
 * Coletor automático de formulários (`f.js`).
 *
 * O modelo pronto não colava em site nenhum: exigia renomear campos, acrescentar
 * hidden, trocar o `action` e um script que procurava `#painel-form`. Adaptação
 * manual em cada site, mexendo no formulário que já funciona.
 *
 * Estes casos travam as três promessas do substituto — captura o que já existe,
 * NÃO manda o que não é contato, e não atrapalha o envio original.
 *
 * A página é sintética e servida na própria origem do painel: o `f.js` precisa
 * carregar de `/f.js`, e um `setContent` em `about:blank` não teria origem.
 */
const PAGINA_FALSA = '/pagina-de-teste-do-coletor';

async function comPagina(page: import('@playwright/test').Page, corpo: string) {
  await page.route(`**${PAGINA_FALSA}`, (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Alvo</title></head>
<body>${corpo}
<script src="/f.js" data-site="${SITE_PUBLICO}"></script>
</body></html>`,
    }),
  );
  await page.goto(PAGINA_FALSA);
  // O script é carregado sem `async` aqui, mas espera o parse terminar.
  await page.waitForFunction(() => (window as unknown as { __painelFormularios?: boolean }).__painelFormularios === true);
}

/** Envia o formulário e devolve o corpo que o coletor mandou — ou null. */
async function corpoEnviado(page: import('@playwright/test').Page, seletorBotao: string) {
  const esperado = page
    .waitForRequest((r) => r.url().includes('/api/forms/') && r.method() === 'POST', { timeout: 2500 })
    .catch(() => null);
  await page.locator(seletorBotao).click();
  const req = await esperado;
  if (!req) return null;
  try {
    return JSON.parse(req.postData() ?? '{}');
  } catch {
    return null;
  }
}

test('captura o formulário que já existe, sem campo renomeado', async ({ page }) => {
  await comPagina(
    page,
    `<form onsubmit="return false">
       <h2>Peça um orçamento</h2>
       <input name="seu-nome" placeholder="Seu nome completo">
       <input name="contato_email" type="email">
       <input name="fone" placeholder="Telefone com DDD">
       <textarea name="obs" placeholder="Conte o que precisa"></textarea>
       <button id="enviar" type="submit">Enviar</button>
     </form>`,
  );

  await page.fill('input[name=seu-nome]', 'Maria Oliveira');
  await page.fill('input[name=contato_email]', 'maria@exemplo.com.br');
  await page.fill('input[name=fone]', '(11) 98888-7777');
  await page.fill('textarea[name=obs]', 'Quero um orçamento');

  const corpo = await corpoEnviado(page, '#enviar');

  // Nenhum campo se chama `nome`, `email` ou `telefone` — e mesmo assim.
  expect(corpo).toBeTruthy();
  expect(corpo.nome).toBe('Maria Oliveira');
  expect(corpo.email).toBe('maria@exemplo.com.br');
  expect(corpo.telefone).toBe('(11) 98888-7777');
  expect(corpo.mensagem).toBe('Quero um orçamento');
  // O nome do formulário sai do título mais próximo, que é como a pessoa o chama.
  expect(corpo.formulario).toBe('Peça um orçamento');
  expect(corpo.idempotencia).toMatch(/^[0-9a-f-]{36}$/i);
});

test('formulário com senha é ignorado por inteiro — login não é contato', async ({ page }) => {
  await comPagina(
    page,
    `<form onsubmit="return false">
       <input name="nome" value="Fulano">
       <input name="email" type="email" value="fulano@exemplo.com">
       <input name="senha" type="password" value="segredo-que-nao-pode-sair">
       <button id="entrar" type="submit">Entrar</button>
     </form>`,
  );

  expect(await corpoEnviado(page, '#entrar')).toBeNull();
});

test('busca não é lead', async ({ page }) => {
  await comPagina(
    page,
    `<form role="search" onsubmit="return false">
       <input type="search" name="q" value="alguma coisa">
       <input name="nome" value="Fulano"><input type="email" name="email" value="a@b.com">
       <button id="buscar" type="submit">Buscar</button>
     </form>`,
  );

  expect(await corpoEnviado(page, '#buscar')).toBeNull();
});

test('data-painel-ignorar exclui um formulário específico', async ({ page }) => {
  await comPagina(
    page,
    `<form data-painel-ignorar onsubmit="return false">
       <input name="nome" value="Fulano"><input type="email" name="email" value="a@b.com">
       <button id="ignorado" type="submit">Enviar</button>
     </form>`,
  );

  expect(await corpoEnviado(page, '#ignorado')).toBeNull();
});

test('sem contato localizável não gasta requisição', async ({ page }) => {
  // O servidor recusaria (exige e-mail ou telefone). Desistir no navegador
  // evita encher o log de 400 com formulário de newsletter.
  await comPagina(
    page,
    `<form onsubmit="return false">
       <input name="nome" value="Só o nome">
       <button id="incompleto" type="submit">Enviar</button>
     </form>`,
  );

  expect(await corpoEnviado(page, '#incompleto')).toBeNull();
});

test('só saem os campos de contato — nada de cupom, CPF ou valor', async ({ page }) => {
  await comPagina(
    page,
    `<form onsubmit="return false">
       <input name="nome" value="Fulano">
       <input name="email" type="email" value="a@b.com">
       <input name="cupom" value="DESCONTO50">
       <input name="cpf" value="000.000.000-00">
       <input name="valor_do_pedido" value="1999">
       <button id="pedido" type="submit">Enviar</button>
     </form>`,
  );

  const corpo = await corpoEnviado(page, '#pedido');
  expect(corpo).toBeTruthy();
  const serializado = JSON.stringify(corpo);
  expect(serializado).not.toContain('DESCONTO50');
  expect(serializado).not.toContain('000.000.000-00');
  expect(serializado).not.toContain('1999');
});

test('formulário criado depois, como num popup, também é capturado', async ({ page }) => {
  // É o caso que mais quebra um `addEventListener` por formulário: o formulário
  // só existe depois de alguém clicar em "Fale conosco".
  await comPagina(page, `<button id="abrir" type="button">Fale conosco</button><div id="alvo"></div>`);

  await page.evaluate(() => {
    document.getElementById('abrir')!.addEventListener('click', () => {
      document.getElementById('alvo')!.innerHTML = `
        <form onsubmit="return false">
          <h3>Fale conosco</h3>
          <input name="nome" value="Depois do Clique">
          <input type="email" name="email" value="popup@exemplo.com">
          <button id="enviar-popup" type="submit">Enviar</button>
        </form>`;
    });
  });
  await page.click('#abrir');

  const corpo = await corpoEnviado(page, '#enviar-popup');
  expect(corpo).toBeTruthy();
  expect(corpo.nome).toBe('Depois do Clique');
  expect(corpo.formulario).toBe('Fale conosco');
});
