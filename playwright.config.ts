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
    // O Chromium do ambiente, em vez de baixar outro.
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
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
    command: `npx next dev --port ${PORTA}`,
    url: BASE,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: bancoDeTeste('DATABASE_URL'),
      DATABASE_URL_INGEST: bancoDeTeste('DATABASE_URL_INGEST'),
      DATABASE_URL_FORMS: bancoDeTeste('DATABASE_URL_FORMS'),
      DATABASE_URL_ADMIN: bancoDeTeste('DATABASE_URL_ADMIN'),
      SESSION_SECRET: process.env.SESSION_SECRET ?? 'segredo-de-teste',
      APP_URL: BASE,
    },
  },
});
