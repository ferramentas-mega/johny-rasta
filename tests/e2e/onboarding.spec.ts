import { expect, test, type Page } from '@playwright/test';
import { Client } from 'pg';
import { entrar } from './apoio';

/**
 * Envelhece uma sessão de diagnóstico até depois do prazo.
 *
 * Mexe no banco em vez de esperar o relógio: trinta minutos de espera tornaria
 * a suíte inviável, e encurtar o prazo só para o teste verificaria uma
 * configuração que não é a de produção.
 *
 * Move `aberta_em` junto com `expira_em` para que a janela continue coerente —
 * a verificação recorta os eventos ENTRE as duas datas, e deixar a abertura no
 * presente criaria uma janela invertida, que passaria pelo teste por acidente.
 */
async function envelhecerDiagnostico(token: string) {
  const url = new URL(process.env.DATABASE_URL_ADMIN!);
  url.pathname = `/${process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test'}`;
  const cliente = new Client({ connectionString: url.toString() });
  await cliente.connect();
  await cliente.query(
    `update diagnostic_sessions
        set aberta_em = now() - interval '2 hours',
            expira_em = now() - interval '90 minutes'
      where token = $1`,
    [token],
  );
  await cliente.end();
}

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

test('a instrução acompanha a plataforma: Tag Manager recebe o passo do contêiner, não o do </head>', async ({ page }) => {
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'gtm');

  // Sem `?etapa=` na URL: a etapa mostrada é a primeira pendente, e num site
  // recém-cadastrado ela é a identificação. Com a etapa fixa na URL, salvar
  // não avança — a URL manda.
  await page.goto(`/sites/${siteId}/configurar`);
  await expect(page.locator('h2').first()).toHaveText('Identificar o site');
  await page.selectOption('select[name=plataforma]', 'gtm');
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();
  await expect(page.locator('h2').first()).toHaveText('Escolher o que acompanhar');

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);
  await expect(page.getByText(/HTML personalizado/).first()).toBeVisible();
  // E o aviso específico deste caminho: instalar no GTM e no tema é duas vezes.
  await expect(page.getByText(/instalar aqui E no tema é instalar duas vezes/)).toBeVisible();
});

test('WordPress oferece o plugin gerado, que só a conta dona baixa', async ({ page, request }) => {
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'wp');
  await page.goto(`/sites/${siteId}/configurar`);
  await page.selectOption('select[name=plataforma]', 'wordpress');
  await page.getByRole('button', { name: 'Salvar e continuar' }).click();
  await expect(page.locator('h2').first()).toHaveText('Escolher o que acompanhar');

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);
  const link = page.getByRole('link', { name: 'Baixar o plugin deste site (.php)' });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!;
  const publicId = href.split('/').pop()!;

  // Com a sessão: o arquivo vem com o Site ID deste site, e sem segredo.
  const ok = await page.request.get(href);
  expect(ok.status()).toBe(200);
  expect(ok.headers()['content-disposition']).toContain('attachment');
  const php = await ok.text();
  expect(php).toContain(publicId);
  expect(php).toContain('Plugin Name:');

  // Sem sessão: nada — a porta de download é do painel.
  const anonimo = await request.get(href, { failOnStatusCode: false });
  expect(anonimo.status()).toBe(401);
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
  // Localizado pelo identificador, e NÃO pelo rótulo: o rótulo muda ao clicar,
  // e um localizador por texto passaria a apontar para o botão do outro snippet.
  const copiar = page.getByTestId('botao-copiar').first();
  await copiar.click();

  /**
   * O botão tem de RESPONDER — e a resposta certa depende do navegador.
   *
   * Onde a área de transferência funciona, vira "Copiado". Onde ela rejeita
   * (contexto inseguro, permissão negada, certas versões de Chromium headless —
   * foi assim que o CI derrubou este teste), o bloco é selecionado na tela e o
   * rótulo passa a pedir Ctrl+C.
   *
   * Afirmar só "Copiado" amarraria o teste ao ambiente, não ao comportamento. O
   * que o produto promete é dar retorno e deixar o código ao alcance; qual dos
   * dois caminhos atendeu é detalhe do navegador. O que NÃO pode acontecer é o
   * botão voltar a "Copiar" em silêncio, e é isso que `not.toBe('ocioso')` nega.
   */
  await expect(copiar).not.toHaveAttribute('data-estado', 'ocioso');
  await expect(copiar).toHaveText(/Copiado|Ctrl\+C/);

  await page.reload();
  const passos = page.getByRole('navigation', { name: 'Etapas da configuração' });
  await expect(passos.getByRole('link', { name: /Instalar o rastreamento/ })).toContainText('pendente');
});

test('sem área de transferência, o snippet fica selecionado e o botão diz o que fazer', async ({ page }) => {
  /**
   * O caminho que a MINHA máquina nunca exercita.
   *
   * Aqui `navigator.clipboard.writeText` funciona, então o `catch` do
   * componente ficaria sem cobertura — e foi exatamente por ali que o CI
   * quebrou, num Chromium onde a promessa rejeita. Um teste que só roda o
   * caminho feliz deixa o caminho de falha ser descoberto por quem usa.
   *
   * Aqui a API é substituída por uma que rejeita, como o navegador faria em
   * contexto inseguro ou sem permissão.
   */
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('negado')) },
    });
  });

  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'semclip');

  // A etapa de instalação só mostra o snippet quando algum recurso de coleta foi
  // escolhido — sem isso ela se declara "não se aplica", e não há o que copiar.
  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);

  const copiar = page.getByTestId('botao-copiar').first();
  await copiar.click();

  // Não volta ao estado inicial em silêncio: isso é indistinguível de um botão
  // quebrado, e o operador cola um snippet vazio sem saber.
  await expect(copiar).toHaveAttribute('data-estado', 'selecionado');
  await expect(copiar).toContainText('Ctrl+C');

  // E a saída existe de verdade: o código está selecionado, então o atalho
  // copia. Dizer "use Ctrl+C" sem selecionar nada seria só uma frase.
  const selecionado = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  expect(selecionado).toContain('data-site=');
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
  await expect(page.getByText('Nenhum evento chegou deste site, nunca.')).toBeVisible();

  // E não termina em beco sem saída: a tela diz o que MEDIU, e dá um próximo
  // passo concreto. A versão anterior parava em "não dá para afirmar a causa
  // daqui" com a mesma lista de quatro suspeitas para qualquer situação.
  await expect(page.getByText(/Próximo passo:/)).toBeVisible();
  await expect(page.getByText(/não há um único evento para este site/i)).toBeVisible();

  // A conferência de console é oferecida, e é só leitura — ela existe porque
  // "a tag está na página?" só tem resposta no navegador de quem visita.
  await page.getByText(/Conferir pelo navegador/).click();
  await expect(page.getByTestId('conferencia-console')).toContainText(publicId);

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

test('o diagnóstico vence, e a tela para de contar eventos dele', async ({ page, context }) => {
  test.setTimeout(120_000);

  /**
   * O prazo existe porque o token viaja na URL do site do cliente, e todo
   * evento que chega com ele nasce marcado como TESTE. Um link esquecido numa
   * aba, ou colado num grupo, faria visitas REAIS sumirem dos relatórios — em
   * silêncio, até o fechamento do mês.
   *
   * Este teste não espera trinta minutos: ele envelhece a sessão pelo banco,
   * que é o mesmo estado que o relógio produziria. Esperar de verdade tornaria
   * a suíte inviável, e um `waitForTimeout` curto com prazo curto testaria uma
   * configuração que não é a de produção.
   */
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'prazo');

  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);
  const publicId = ((await page.locator('pre').first().textContent()) ?? '').match(/sit_[a-f0-9]+/)![0];

  await page.goto(`/sites/${siteId}/configurar?etapa=verificacao`);
  await page.getByRole('button', { name: 'Abrir modo de diagnóstico' }).click();

  const link = page.locator('a[href*="painel_diag="]');
  await expect(link).toBeVisible();
  const token = new URL((await link.getAttribute('href'))!).searchParams.get('painel_diag')!;

  // Enquanto vale, a tela diz por quanto tempo ainda vale.
  await expect(page.getByTestId('prazo-diagnostico')).toContainText(/VÁLIDO POR MAIS \d+ MIN/);

  // Envelhece a sessão: mesmo estado que meia hora de relógio produziria.
  await envelhecerDiagnostico(token);

  await page.goto(`/sites/${siteId}/configurar?etapa=verificacao`);
  // Vencido: o link some, e o que aparece é a oferta de abrir outro. Deixar o
  // link vencido na tela faria o operador testar com um token que não conta.
  await expect(page.getByTestId('prazo-diagnostico')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir um diagnóstico novo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conferir o que chegou' })).toHaveCount(0);

  // E o token velho não verifica mais nada: um evento que chegue com ele fica
  // fora da janela da sessão.
  const site = await context.newPage();
  await site.goto(`/teste/${publicId}?painel_diag=${token}`);
  await site.waitForTimeout(1200);
  await site.close();

  await page.goto(`/sites/${siteId}/configurar?etapa=resumo`);
  const passos = page.getByRole('navigation', { name: 'Etapas da configuração' });
  await expect(passos.getByRole('link', { name: /Verificar visitas e cliques/ })).toContainText('pendente');
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

test('o inventário nomeia o que está mal marcado, e diz o que fazer', async ({ page, context }) => {
  test.setTimeout(120_000);

  /**
   * O inventário é construído a partir do que o coletor RECEBEU, então o teste
   * precisa produzir cliques de verdade — não inserir linhas no banco. É a
   * diferença entre provar que a consulta agrupa e provar que o caminho
   * inteiro, do clique ao rótulo na tela, funciona.
   */
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'invent');

  await page.goto(`/sites/${siteId}/configurar?etapa=instalacao`);
  const publicId = ((await page.locator('pre').first().textContent()) ?? '').match(/sit_[a-f0-9]+/)![0];

  // Antes de qualquer clique: a tela não inventa botão nenhum.
  await page.goto(`/sites/${siteId}/rastreamento`);
  await expect(page.getByText('Nada clicado até agora')).toBeVisible();

  // Um clique REAL na página de teste, que percorre coletor, endpoint e banco.
  // O link de WhatsApp de lá é bem marcado (`data-track-id` e `data-track-pos`),
  // então ele é o caso de referência: o inventário tem de mostrar o nome legível
  // e a posição, não o agrupamento automático.
  const site = await context.newPage();
  await site.goto(`/teste/${publicId}`);
  const requisicao = site.waitForRequest(
    (r) => r.url().includes('/api/collect') && r.method() === 'POST',
  );
  await site.getByRole('link', { name: /WhatsApp/i }).first().click();
  await requisicao;
  await site.waitForTimeout(600);
  await site.close();

  await page.goto(`/sites/${siteId}/rastreamento`);
  const inventario = page.locator('section').filter({ hasText: 'Inventário de tags e botões' }).first();
  const tabela = inventario.locator('table');

  // O botão entra pelo identificador que o site declarou, com o texto e a
  // posição que vieram no evento.
  await expect(tabela.getByText('cta-whatsapp-hero')).toBeVisible();
  await expect(tabela.getByText('Falar no WhatsApp')).toBeVisible();
  // `exact` porque "Hero" também é sufixo do identificador `cta-whatsapp-hero`,
  // e sem isso o localizador casa com dois elementos da mesma linha.
  await expect(tabela.getByText('Hero', { exact: true })).toBeVisible();

  // Recém-aparecido é "Novo", e o inventário não cobra nada dele. Marcar um
  // botão instalado hoje como pendência seria cobrar por trabalho já feito.
  await expect(tabela.getByText('Novo')).toBeVisible();

  // O cabeçalho deixa de dizer "nada clicado" e passa a contar.
  await expect(inventario.getByText(/1 botão\(ões\) já clicado\(s\)/)).toBeVisible();

  // A ressalva de escopo fica à vista: este inventário não afirma quantos
  // botões o site tem, só o que já foi clicado.
  await expect(inventario.getByText(/nunca foi clicado não aparece aqui/)).toBeVisible();
});

test('a etapa de formulários diz o que falta e oferece como conferir', async ({ page }) => {
  test.setTimeout(120_000);
  await entrar(page);
  const { siteId } = await cadastrarSite(page, 'form');

  // Formulários é recurso do coletor: para a etapa 5 ser alcançável, algo do
  // coletor precisa já estar verificado. Seleciona visitas junto e deixa o
  // caminho normal do assistente levar até lá.
  await page.goto(`/sites/${siteId}/configurar?etapa=recursos`);
  await page.check('input[name="recurso:visitas"]');
  await page.check('input[name="recurso:formularios"]');
  await page.getByRole('button', { name: 'Salvar seleção' }).click();

  await page.goto(`/sites/${siteId}/configurar?etapa=formularios`);

  // Sem modo escolhido, a etapa não cobra envio nenhum — não há o que enviar
  // até o operador dizer como o formulário funciona.
  await expect(page.getByText('Falta o principal: receber um envio.')).toHaveCount(0);

  await page.check('input[name="modo"][value="proprio"]');
  await page.getByRole('button', { name: 'Salvar' }).click();

  // ─── o defeito que este teste fecha ────────────────────────────────────────
  //
  // Salvar o modo não conclui a etapa: ela só fecha quando o endpoint RECEBE um
  // envio. Antes, nada na tela dizia isso e o aviso de próxima ação repetia
  // "diga como o formulário deste site funciona" — o que a pessoa acabara de
  // fazer. Salvava de novo, nada mudava.
  await expect(page.getByText('Falta o principal: receber um envio.')).toBeVisible();

  // A frase de "próxima ação" também deixa de cobrar a escolha e passa a cobrar
  // o envio — mas isso depende da etapa ser a primeira pendente do site, e aqui
  // a instalação ainda está aberta. Quem trava aquela frase é
  // `tests/unit/recursos.spec.ts`, onde o cenário é montado sem depender da
  // ordem das etapas.

  // A etapa passa a oferecer o caminho de verificação, que antes só existia na
  // etapa 4 — o operador não tinha como concluir daqui.
  await page.getByRole('button', { name: 'Abrir modo de diagnóstico' }).click();
  await expect(page.locator('a[href*="painel_diag="]')).toBeVisible();

  await page.getByRole('button', { name: 'Conferir envios recebidos' }).click();
  // Nenhum envio ainda: diz isso, e diz onde costuma estar o erro. Nunca
  // confirma recebimento que não houve.
  await expect(page.getByText(/Nenhum envio gravado ainda neste diagnóstico/)).toBeVisible();
});
