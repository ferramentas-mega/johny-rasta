import { test, expect } from '@playwright/test';
import { entrar, valorDoCartao, percentualDoCartao, numero } from './apoio';

/**
 * Coerência entre cartões, gráfico e tabelas — na tela renderizada.
 *
 * Os testes de unidade já provam que as consultas concordam. Aqui a pergunta é
 * outra: o que o usuário LÊ concorda? Era exatamente aí que o protótipo falhava,
 * porque o gráfico redimensionava a série antes de desenhar.
 */

test.beforeEach(async ({ page }) => {
  await entrar(page);
  await page.goto('/sites');
  await page.getByRole('link', { name: 'alfa.teste' }).click();
  await page.waitForURL('**/desempenho**');
});

/** Soma a última linha (totais) de uma tabela, por título do painel. */
async function totalDaTabela(page: import('@playwright/test').Page, tituloPainel: string, coluna: string) {
  const painel = page.locator('section').filter({ hasText: tituloPainel }).first();
  const cabecalhos = await painel.locator('thead th').allTextContents();
  const indice = cabecalhos.findIndex((c) => c.trim() === coluna);
  expect(indice, `coluna "${coluna}" em "${tituloPainel}"`).toBeGreaterThanOrEqual(0);
  const celulas = painel.locator('tfoot td');
  return numero(await celulas.nth(indice).textContent());
}

test('a tabela por página e a tabela por botão fecham no mesmo total de cliques', async ({ page }) => {
  // A discrepância 169 contra 207 da captura anterior: dois escopos, nenhum
  // declarado. Agora os dois totais estão visíveis e precisam coincidir.
  const porPagina = await totalDaTabela(page, 'Desempenho por página', 'Cliques em CTA');
  const porBotao = await totalDaTabela(page, 'Desempenho dos botões', 'Cliques');

  expect(porPagina).toBe(porBotao);
  expect(porPagina).toBe(8);
});

test('o total de formulários da tabela por página é igual ao cartão', async ({ page }) => {
  const naTabela = await totalDaTabela(page, 'Desempenho por página', 'Formulários');
  const noCartao = await valorDoCartao(page, 'formularios');
  expect(naTabela).toBe(noCartao);
});

test('a tabela de origens soma as mesmas sessões e formulários dos cartões', async ({ page }) => {
  expect(await totalDaTabela(page, 'Origem dos acessos', 'Sessões')).toBe(await valorDoCartao(page, 'sessoes'));
  expect(await totalDaTabela(page, 'Origem dos acessos', 'Formulários')).toBe(await valorDoCartao(page, 'formularios'));
});

test('o gráfico declara a soma da série e ela bate com o cartão', async ({ page }) => {
  const noCartao = await valorDoCartao(page, 'formularios');
  const painel = page.locator('section').filter({ hasText: 'Evolução do desempenho' });
  await expect(painel).toContainText(`A soma da série de formulários é ${noCartao}`);
});

test('a série de formulários tem eixo próprio, com números reais', async ({ page }) => {
  // No protótipo a linha tracejada era normalizada contra o eixo de visitas, e
  // o desenho sugeria centenas onde o cartão dizia dezenas.
  const painel = page.locator('section').filter({ hasText: 'Evolução do desempenho' });
  await expect(painel).toContainText('eixo da esquerda');
  await expect(painel).toContainText('Formulários recebidos — eixo da direita');

  const topo = async (lado: 'esquerda' | 'direita') => {
    const rotulos = await painel.locator(`svg text[data-eixo="${lado}"]`).allTextContents();
    expect(rotulos.length, `o eixo da ${lado} precisa ter marcas`).toBeGreaterThan(0);
    return Math.max(...rotulos.map(numero));
  };

  await page.getByRole('button', { name: '30 dias' }).click();
  await page.waitForURL(/periodo=30d/);

  /** A curva tracejada, exatamente como o SVG a descreve. */
  const tracejada = () =>
    painel.locator('svg path[stroke-dasharray]').first().getAttribute('d');

  const direitaComVisitas = await topo('direita');
  const tracejadaComVisitas = await tracejada();

  await painel.getByRole('button', { name: 'Cliques em CTA' }).click();
  const direitaComCliques = await topo('direita');
  const tracejadaComCliques = await tracejada();

  // Trocar a métrica principal não pode mexer na série de formulários: nem no
  // topo do eixo dela, nem no traçado.
  expect(direitaComCliques).toBe(direitaComVisitas);
  expect(tracejadaComCliques).toBe(tracejadaComVisitas);
  expect(tracejadaComVisitas).toBeTruthy();

  // ─── O QUE ESTA PROVA NÃO DECIDE, e por quê ────────────────────────────────
  //
  // Ela não distingue "escala própria" de "normalizada contra o eixo da
  // esquerda" com a massa de hoje, e é melhor dizer isso aqui do que deixar
  // alguém confiar demais nela. Na janela de 30 dias o maior dia de cliques é 5
  // e o de formulários é 2; com rótulos inteiros e um número fixo de linhas, as
  // duas séries caem no MESMO topo. Quando os topos coincidem, as duas
  // implementações desenham exatamente a mesma curva — não há diferença para
  // observar, em teste nenhum.
  //
  // Medido: reintroduzi a normalização do protótipo no componente e este
  // arquivo continuou passando. As asserções acima valem (elas quebram assim
  // que os topos divergirem), mas quem depender só delas vai superestimar a
  // cobertura.
  //
  // Fechar de verdade pede massa com ordens de grandeza separadas — centenas de
  // visitas contra um punhado de formulários, que é o caso para o qual o
  // segundo eixo existe. Enquanto isso não houver, quem garante a régua é
  // `tests/unit/eixo.spec.ts`, que prova que todo rótulo é inteiro, igualmente
  // espaçado, e que cada eixo depende só da própria série.
  expect(await topo('esquerda')).toBeGreaterThan(0);
});

test('sessões convertidas e envios por sessão mostram valores diferentes', async ({ page }) => {
  // 3 sessões converteram, mas houve 4 envios: as duas contas divergem.
  const convertidas = await percentualDoCartao(page, 'sessoesConvertidas');
  const envios = await percentualDoCartao(page, 'enviosPorSessao');

  expect(convertidas).toBeCloseTo(37.5, 1);
  expect(envios).toBeCloseTo(50, 1);
  expect(convertidas).not.toBe(envios);
});

test('os cartões declaram o escopo de cada indicador', async ({ page }) => {
  const ajuda = page.getByTestId('kpi-cliquesContato').getByLabel(/Definição/);
  await expect(ajuda).toHaveAttribute('aria-label', /Exclui WhatsApp e exclui abertura de formulário/);

  const cta = page.locator('th', { hasText: 'Cliques em CTA' }).first();
  await expect(cta).toHaveAttribute('title', /incluindo abertura de formulário/);
});

test('um site sem coleta mostra estado explícito, não zeros', async ({ page }) => {
  await page.locator('select[aria-label="Site em contexto"]').selectOption({ label: 'novo.teste' });
  await page.waitForLoadState('networkidle');

  await expect(page.getByText('Este site ainda não recebeu eventos')).toBeVisible();
  // Nenhum cartão de indicador: zero afirmaria que medimos e não houve.
  await expect(page.getByTestId('kpi-sessoes')).toHaveCount(0);
});
