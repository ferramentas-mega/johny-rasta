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

const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

/**
 * Configuração de TLS.
 *
 * O `pg` não usa TLS por padrão. Contra um Postgres na própria máquina isso é
 * irrelevante; contra um banco gerenciado, a conexão é recusada — e o erro que
 * chega ao navegador é só um digest, sem pista do motivo.
 *
 * Fora de hosts locais, portanto, TLS é obrigatório.
 *
 * Sobre a verificação do certificado: com `DATABASE_SSL_CA` definida (o
 * certificado raiz que o provedor fornece), a cadeia é verificada de verdade.
 * Sem ela, a conexão continua cifrada mas não autenticada — protege contra
 * escuta passiva, não contra um intermediário ativo. É o arranjo que a maioria
 * das hospedagens gerenciadas acaba usando; se o seu provedor publica o
 * certificado raiz, vale defini-lo.
 */
export function tlsPara(connectionString: string): false | { rejectUnauthorized: boolean; ca?: string } {
  const ca = process.env.DATABASE_SSL_CA;
  const remoto = ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: false };

  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // String em formato que não é URL (o `pg` também aceita "host=... user=...").
    // Não dá para saber se o destino é local, e desligar o TLS por não saber
    // seria falhar ABERTO: a conexão sairia em texto claro sem ninguém notar.
    // Na dúvida, exige TLS.
    return remoto;
  }

  return HOSTS_LOCAIS.has(host) ? false : remoto;
}

function poolFor(envVar: string): Pool {
  const existing = pools.get(envVar);
  if (existing) return existing;

  const connectionString = process.env[envVar];
  if (!connectionString) {
    throw new Error(
      `Variável de ambiente ausente: ${envVar}. ` +
        'Em desenvolvimento, copie .env.example para .env.local. ' +
        'Em produção, defina-a no painel da hospedagem.',
    );
  }

  // Em serverless cada instância abre o próprio pool, e há muitas instâncias —
  // então o pool precisa ser pequeno. Mas não pode ser 1: uma única renderização
  // dispara mais de um `withAccount`, e com uma conexão só os demais ficam na
  // fila disputando o mesmo `connectionTimeoutMillis`, que o pg arma também para
  // quem está esperando. Sob concorrência modesta isso vira erro 500.
  //
  // Três cobre a concorrência real de um render, e continua modesto o bastante
  // para não esgotar o limite de clientes do pooler.
  const serverless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  const pool = new Pool({
    connectionString,
    ssl: tlsPara(connectionString),
    max: serverless ? 3 : 10,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    // Um pooler gerenciado encerra conexões ociosas; falhar rápido é melhor do
    // que pendurar a requisição esperando uma conexão morta.
    connectionTimeoutMillis: 10_000,
  });

  // Sem este ouvinte, um erro numa conexão ociosa derruba o processo inteiro.
  pool.on('error', (erro) => {
    console.error(`[db] erro em conexão ociosa (${envVar}):`, erro.message);
  });

  pools.set(envVar, pool);
  return pool;
}

/**
 * Traduz falhas de conexão para algo acionável.
 *
 * O texto vai para o log do servidor, onde alguém vai procurar quando a tela
 * mostrar "erro inesperado". Um `ECONNREFUSED` cru não diz o que fazer.
 */
function explicar(erro: unknown, envVar: string): Error {
  const bruto = erro instanceof Error ? erro : new Error(String(erro));
  const msg = bruto.message;

  const dica =
    msg.includes('no pg_hba.conf entry') && msg.includes('SSL off')
      ? 'O servidor exige TLS. Confirme que o host não é local — fora de localhost o TLS é ligado automaticamente.'
      : msg.includes('password authentication failed') || msg.includes('SASL')
        ? `Usuário ou senha incorretos em ${envVar}. Num pooler gerenciado o usuário costuma exigir sufixo do projeto, como "app_user.abcdefgh".`
        : msg.includes('Tenant or user not found')
          ? `O pooler não reconheceu o usuário de ${envVar}. Falta o sufixo do projeto no nome do papel.`
          : msg.includes('ENOTFOUND') || msg.includes('EAI_AGAIN')
            ? `Host de ${envVar} não resolve. Confira o endereço.`
            : msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED')
              ? `Sem resposta do banco em ${envVar}. Se o host só tem endereço IPv6, use o pooler, que atende em IPv4.`
              : msg.includes('does not support SSL')
                ? 'O servidor não aceita TLS. Use um host local ou desative o TLS nesta conexão.'
                : null;

  if (!dica) return bruto;

  const explicado = new Error(`${msg} — ${dica}`);
  explicado.cause = bruto;
  return explicado;
}

/** Categorias que o diagnóstico sabe explicar. */
export type CausaDeFalha =
  | 'ok'
  | 'variavel_ausente'
  | 'host_nao_resolve'
  | 'sem_resposta'
  | 'senha_incorreta'
  | 'usuario_sem_sufixo_do_projeto'
  | 'papel_expirado'
  | 'tls_recusado'
  | 'banco_inexistente'
  | 'desconhecida';

export function classificarFalha(erro: unknown): CausaDeFalha {
  const msg = erro instanceof Error ? erro.message : String(erro);

  if (/Tenant or user not found/i.test(msg)) return 'usuario_sem_sufixo_do_projeto';
  if (/EAUTHQUERY|invalid secret format/i.test(msg)) return 'papel_expirado';
  if (/password authentication failed|SASL|SCRAM/i.test(msg)) return 'senha_incorreta';
  if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) return 'host_nao_resolve';
  if (/ETIMEDOUT|ECONNREFUSED|timeout expired|Connection terminated/i.test(msg)) return 'sem_resposta';
  if (/SSL|pg_hba/i.test(msg)) return 'tls_recusado';
  if (/database .* does not exist/i.test(msg)) return 'banco_inexistente';
  return 'desconhecida';
}

export type ResultadoDaVerificacao = {
  variavel: string;
  causa: CausaDeFalha;
  conecta: boolean;
  /** Papel do Postgres e tabelas visíveis. Só quando explicitamente pedido. */
  detalhe?: { papel: string; tabelasVisiveis: number };
};

/**
 * Testa UMA conexão, pelo MESMO pool e MESMA configuração de TLS que a
 * aplicação usa de verdade.
 *
 * Reaproveitar o pool é o ponto. Uma verificação que abrisse conexões próprias
 * poderia reportar sucesso com uma configuração que a aplicação não usa — e um
 * diagnóstico que mente é pior do que não existir. Também evita que chamadas
 * repetidas ao endpoint de diagnóstico abram conexões sem limite.
 */
export async function verificarConexao(
  envVar: string,
  comDetalhe = false,
): Promise<ResultadoDaVerificacao> {
  if (!process.env[envVar]) {
    return { variavel: envVar, causa: 'variavel_ausente', conecta: false };
  }

  try {
    const pool = poolFor(envVar);
    const r = await pool.query<{ papel: string; tabelas: string }>(
      `select current_user as papel,
              (select count(*)::text from information_schema.tables
                where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas`,
    );
    return {
      variavel: envVar,
      causa: 'ok',
      conecta: true,
      detalhe: comDetalhe
        ? { papel: r.rows[0]!.papel, tabelasVisiveis: Number(r.rows[0]!.tabelas) }
        : undefined,
    };
  } catch (erro) {
    console.error(`[db] verificação de ${envVar} falhou:`, explicar(erro, envVar).message);
    return { variavel: envVar, causa: classificarFalha(erro), conecta: false };
  }
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

async function transaction<T>(
  pool: Pool,
  accountId: string | null,
  fn: (db: Queryable) => Promise<T>,
  envVar: string,
): Promise<T> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (erro) {
    const explicado = explicar(erro, envVar);
    console.error('[db] falha ao obter conexão:', explicado.message);
    throw explicado;
  }

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
  return transaction(poolFor('DATABASE_URL'), accountId, fn, 'DATABASE_URL');
}

/** Leituras que antecedem o login (buscar usuário por e-mail). Sem conta ainda. */
export function withoutAccount<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL'), null, fn, 'DATABASE_URL');
}

/** Endpoint público de analytics. Sem privilégio algum sobre leads. */
export function withIngest<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL_INGEST'), null, fn, 'DATABASE_URL_INGEST');
}

/** Endpoint público de formulários. Grava submissões e leads, nada administrativo. */
export function withForms<T>(fn: (db: Queryable) => Promise<T>): Promise<T> {
  return transaction(poolFor('DATABASE_URL_FORMS'), null, fn, 'DATABASE_URL_FORMS');
}
