/**
 * Aplica os arquivos de supabase/migrations em ordem, uma vez cada.
 * O formato (timestamp_nome.sql) é o que o Supabase CLI espera, então as mesmas
 * migrações sobem com `supabase db push` sem reescrita.
 */
import { Client } from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv } from './env';

const DIR = 'supabase/migrations';

export async function runMigrations(connectionString: string): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`
    create table if not exists schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await client.query<{ version: string }>('select version from schema_migrations')).rows.map((r) => r.version),
  );
  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = await readFile(join(DIR, file), 'utf8');
    // Cada migração roda numa transação: falhou, não deixa schema pela metade.
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (version) values ($1)', [version]);
      await client.query('commit');
      console.log(`· aplicada ${version}`);
      count += 1;
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Falha na migração ${version}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(count ? `${count} migração(ões) aplicada(s)` : 'nenhuma migração pendente');
  await client.end();
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  loadEnv();
  const url = process.env.DATABASE_URL_ADMIN;
  if (!url) throw new Error('Defina DATABASE_URL_ADMIN no .env.local.');
  runMigrations(url).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
