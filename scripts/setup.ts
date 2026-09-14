/**
 * Preparação completa para desenvolvimento, em um comando.
 *
 * Cria o .env.local se não existir (com um SESSION_SECRET novo), cria o banco e
 * os papéis, aplica as migrações e semeia a massa. Idempotente: rodar de novo
 * não estraga nada, exceto o seed, que sempre recria a massa.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ENV = '.env.local';

const MODELO = (segredo: string) => `# Gerado por 'npm run setup'. Ajuste à vontade.
DATABASE_URL=postgres://app_user:painel_dev_user@localhost:5432/painel_matrix
DATABASE_URL_INGEST=postgres://app_ingest:painel_dev_ingest@localhost:5432/painel_matrix
DATABASE_URL_FORMS=postgres://app_forms:painel_dev_forms@localhost:5432/painel_matrix
DATABASE_URL_ADMIN=postgres://postgres:painel_dev_admin@localhost:5432/painel_matrix
SESSION_SECRET=${segredo}
APP_URL=http://localhost:3000
TEST_DATABASE_NAME=painel_matrix_test
`;

function rodar(argumentos: string[]) {
  execFileSync('npx', argumentos, { stdio: 'inherit' });
}

if (existsSync(ENV)) {
  console.log(`· ${ENV} já existe, mantido como está`);
} else {
  writeFileSync(ENV, MODELO(randomBytes(32).toString('base64url')));
  console.log(`· ${ENV} criado, com um SESSION_SECRET novo`);
}

rodar(['tsx', 'scripts/db-setup.ts']);
rodar(['tsx', 'scripts/seed.ts']);

console.log('\nPronto. Rode `npm run dev` e abra http://localhost:3000');
