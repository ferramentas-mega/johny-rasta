/**
 * Aponta o processo de teste para o banco ISOLADO antes de qualquer módulo da
 * aplicação ser carregado. Nenhum teste toca o banco de desenvolvimento.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';

for (const arquivo of ['.env.local', '.env']) {
  if (existsSync(arquivo)) config({ path: arquivo, override: false, quiet: true });
}

const alvo = process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test';

for (const variavel of ['DATABASE_URL', 'DATABASE_URL_INGEST', 'DATABASE_URL_FORMS', 'DATABASE_URL_ADMIN']) {
  const valor = process.env[variavel];
  if (!valor) throw new Error(`${variavel} não definida. Copie .env.example para .env.local.`);
  const url = new URL(valor);
  url.pathname = `/${alvo}`;
  process.env[variavel] = url.toString();
}

process.env.SESSION_SECRET ??= 'segredo-de-teste-nao-usar-em-producao';
