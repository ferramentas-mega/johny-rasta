import { config } from 'dotenv';
import { existsSync } from 'node:fs';

/** Carrega o ambiente e recria o banco de testes antes da suíte. */
export default async function globalSetup() {
  for (const arquivo of ['.env.local', '.env']) {
    if (existsSync(arquivo)) config({ path: arquivo, override: false, quiet: true });
  }
  const { prepararBancoDeTeste } = await import('../../scripts/test-db');
  await prepararBancoDeTeste();
}
