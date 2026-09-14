import 'server-only';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

/**
 * Três conexões, três papéis do Postgres, três níveis de privilégio.
 *
 * A separação não é decorativa: o endpoint público de analytics literalmente
 * não tem GRANT para ler `leads`, então um erro de código no servidor ainda
 * esbarra numa negativa do banco.
 */

declare global {
  // Em desenvolvimento o Next recarrega módulos a cada edição; sem este cache
  // cada recarga abriria um pool novo até esgotar as conexões do Postgres.
  var __painelPools: Map<string, Pool> | undefined;
}

const pools = (globalThis.__painelPools ??= new Map<string, Pool>());

function poolFor(envVar: string): Pool {
  const existing = pools.get(envVar);
  if (existing) return existing;

  const connectionString = process.env[envVar];
  if (!connectionString) {
    throw new Error(`Variável de ambiente ausente: ${envVar}. Copie .env.example para .env.local.`);
  }
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  pools.set(envVar, pool);
  return pool;
}

export type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  one<T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
};

function wrap(client: PoolClient): Queryable {
  // Uma transação usa UMA conexão, e o driver pg não aceita duas consultas
  // simultâneas no mesmo client. Em vez de confiar que ninguém vai escrever um
  // `Promise.all` aqui dentro, a fila serializa as chamadas: quem chamar em
  // paralelo espera, em vez de corromper a conexão.
  let fila: Promise<unknown> = Promise.resolve();

  const enfileirar = <T>(executar: () => Promise<T>): Promise<T> => {
    const resultado = fila.then(executar, executar);
    // A fila ignora o erro anterior para não encadear rejeições; quem chamou
    // ainda recebe a sua própria rejeição por `resultado`.
    fila = resultado.catch(() => undefined);
    return resultado;
  };

  return {
    query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
      return enfileirar(async () => (await client.query<T>(sql, params)).rows);
    },
    one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
      return enfileirar<T | null>(async () => (await client.query<T>(sql, params)).rows[0] ?? null);
    },
  };
}

async function transaction<T>(pool: Pool, accountId: string | null, fn: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (accountId !== null) {
      // SET LOCAL vale só até o fim desta transação — não vaza entre requisições
      // que compartilham a mesma conexão do pool.
      await client.query("select set_config('app.account_id', $1, true)", [accountId]);
    }
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa consultas do painel no escopo de uma conta.
 *
 * Toda leitura do produto passa por aqui. Não existe função que aceite um
 * site_id sem uma conta junto: a RLS transforma um id de outra conta em
 * "nenhuma linha", e não em vazamento.
 */
export function withAccount<T>(accountId: string, fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL'), accountId, fn);
}

/** Leituras que antecedem o login (buscar usuário por e-mail). Sem conta ainda. */
export function withoutAccount<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL'), null, fn);
}

/** Endpoint público de analytics. Sem privilégio algum sobre leads. */
export function withIngest<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL_INGEST'), null, fn);
}

/** Endpoint público de formulários. Grava submissões e leads, nada administrativo. */
export function withForms<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL_FORMS'), null, fn);
}
