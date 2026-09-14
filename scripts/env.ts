import { config } from 'dotenv';
import { existsSync } from 'node:fs';

/** Carrega .env.local (preferido) ou .env, sem sobrescrever o ambiente real. */
export function loadEnv(): void {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) config({ path: file, override: false, quiet: true });
  }
}

export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}. Veja .env.example.`);
  return value;
}
