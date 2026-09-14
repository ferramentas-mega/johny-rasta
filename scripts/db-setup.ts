/**
 * Cria banco e papéis, depois aplica as migrações.
 *
 *   npm run db:setup            cria o que faltar (idempotente)
 *   npm run db:setup -- --drop  recria do zero (apaga o banco de desenvolvimento)
 *
 * Os papéis são objetos do cluster, não do banco, por isso nascem aqui e não
 * numa migração. Num projeto Supabase, criam-se uma vez com o mesmo SQL.
 */
import { Client } from 'pg';
import { loadEnv } from './env';
import { runMigrations } from './migrate';

loadEnv();

const ADMIN_URL = process.env.DATABASE_URL_ADMIN ?? 'postgres://postgres@localhost:5432/postgres';
const ROLES = ['app_user', 'app_ingest', 'app_forms'] as const;

function dbNameFrom(url: string): string {
  return new URL(url).pathname.replace(/^\//, '') || 'postgres';
}

/** Senha do papel, lida da própria connection string do .env. */
function passwordFor(role: string): string {
  const key = { app_user: 'DATABASE_URL', app_ingest: 'DATABASE_URL_INGEST', app_forms: 'DATABASE_URL_FORMS' }[role]!;
  const url = process.env[key];
  if (!url) throw new Error(`Defina ${key} no .env.local antes de rodar db:setup.`);
  const password = decodeURIComponent(new URL(url).password);
  if (!password) throw new Error(`${key} precisa conter a senha do papel ${role}.`);
  return password;
}

async function main() {
  const drop = process.argv.includes('--drop');
  const targetDb = dbNameFrom(ADMIN_URL);

  // Conecta no banco de manutenção para criar/derrubar o banco alvo.
  const maintenanceUrl = new URL(ADMIN_URL);
  maintenanceUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: maintenanceUrl.toString() });
  await admin.connect();

  if (drop) {
    await admin.query(`drop database if exists "${targetDb}" with (force)`);
    console.log(`· banco ${targetDb} removido`);
  }

  const exists = await admin.query('select 1 from pg_database where datname = $1', [targetDb]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${targetDb}"`);
    console.log(`· banco ${targetDb} criado`);
  } else {
    console.log(`· banco ${targetDb} já existe`);
  }

  for (const role of ROLES) {
    const password = passwordFor(role);
    const found = await admin.query('select 1 from pg_roles where rolname = $1', [role]);
    if (found.rowCount === 0) {
      await admin.query(`create role "${role}" login password $1`.replace('$1', `'${password.replace(/'/g, "''")}'`));
      console.log(`· papel ${role} criado`);
    } else {
      await admin.query(`alter role "${role}" login password '${password.replace(/'/g, "''")}'`);
      console.log(`· papel ${role} já existe (senha sincronizada com o .env)`);
    }
  }
  await admin.end();

  await runMigrations(ADMIN_URL);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
