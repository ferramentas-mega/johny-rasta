import { defineConfig, devices } from '@playwright/test';
import { config as carregarEnv } from 'dotenv';
import { existsSync } from 'node:fs';

// O arquivo de configuração é avaliado antes de qualquer setup, então o
// ambiente precisa ser carregado aqui — não no globalSetup.
for (const arquivo of ['.env.local', '.env']) {
  if (existsSync(arquivo)) carregarEnv({ path: arquivo, override: false, quiet: true });
}

/**
 * Testes de ponta a ponta.
 *
 * Sobem o app apontando para o banco de TESTES, nunca para o de
 * desenvolvimento. O `globalSetup` recria a massa antes de cada execução, então
 * os testes partem sempre do mesmo estado.
 */

const PORTA = 3100;
const BASE = `http://localhost:${PORTA}`;

/** Onde o contêiner de desenvolvimento deixa o Chromium. Não existe no CI. */
const CHROMIUM_DO_AMBIENTE = '/opt/pw-browsers/chromium';

const bancoDeTeste = (variavel: string) => {
  const url = new URL(process.env[variavel] ?? '');
  url.pathname = `/${process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test'}`;
  return url.toString();
};

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup-global.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE,
    /**
     * O Chromium do ambiente, quando existe — e só então.
     *
     * Este caminho é o do contêiner de desenvolvimento, não uma convenção. Ele
     * estava fixo aqui, e no runner do GitHub, onde o navegador é instalado por
     * `playwright install` em `~/.cache/ms-playwright`, **as 57 provas de
     * navegador falharam em cinco commits seguidos** com "executable doesn't
     * exist" — sempre a mesma linha, nunca um defeito de produto. Pior: o passo
     * de build vinha depois e era pulado, então o CI parou de responder a
     * pergunta para a qual foi criado.
     *
     * Ausente o arquivo, `launchOptions` fica vazio e o Playwright usa o
     * navegador que ele mesmo instalou. Verificar a existência é mais barato que
     * uma variável de ambiente que alguém precisa lembrar de configurar.
     */
    launchOptions: existsSync(CHROMIUM_DO_AMBIENTE)
      ? { executablePath: CHROMIUM_DO_AMBIENTE }
      : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      // A suíte responsiva só faz sentido no projeto móvel.
      testIgnore: /responsivo\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /responsivo\.spec\.ts/ },
  ],

  webServer: {
    /**
     * Desenvolvimento por padrão; produção com `E2E_PROD=1`.
     *
     * A diferença não é cosmética para tudo que se mede no console. O modo de
     * desenvolvimento do Next compila com `eval` (é assim que o recarregamento
     * a quente funciona), então uma CSP sem `'unsafe-eval'` acusa milhares de
     * violações que **não existem** no pacote publicado. Medir a política no
     * servidor de desenvolvimento e concluir que ela precisa afrouxar seria
     * enfraquecer a produção por causa de uma ferramenta que não vai para lá.
     *
     * Exige `npm run build` antes. É o que `npm run test:e2e:prod` faz.
     */
    command:
      process.env.E2E_PROD === '1'
        ? `npx next start --port ${PORTA}`
        : `npx next dev --port ${PORTA}`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: bancoDeTeste('DATABASE_URL'),
      DATABASE_URL_INGEST: bancoDeTeste('DATABASE_URL_INGEST'),
      DATABASE_URL_FORMS: bancoDeTeste('DATABASE_URL_FORMS'),
      DATABASE_URL_ADMIN: bancoDeTeste('DATABASE_URL_ADMIN'),
      // 32 caracteres no mínimo: é o que `secret()` exige desde que um segredo
      // curto deixou de ser aceito. Um fallback abaixo disso derrubaria a suíte
      // inteira em quem não tem SESSION_SECRET no ambiente.
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'segredo-de-teste-sem-valor-fora-daqui',
      APP_URL: BASE,
    },
  },
});
