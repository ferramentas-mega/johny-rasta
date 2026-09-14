import { NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * Diagnóstico da conexão com o banco, para quando a aplicação já está publicada
 * e o log da hospedagem não está à mão.
 *
 * Responde uma CAUSA, nunca os dados de conexão: não devolve host, usuário,
 * senha nem a mensagem crua do Postgres. O que sai daqui é uma categoria de
 * problema e o que fazer a respeito — informação que a própria tela de login já
 * revela ("não foi possível falar com o banco"), só que acionável.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VARIAVEIS = ['DATABASE_URL', 'DATABASE_URL_INGEST', 'DATABASE_URL_FORMS'] as const;

type Causa =
  | 'ok'
  | 'variavel_ausente'
  | 'variavel_malformada'
  | 'host_nao_resolve'
  | 'sem_resposta'
  | 'senha_incorreta'
  | 'usuario_sem_sufixo_do_projeto'
  | 'papel_expirado'
  | 'tls_recusado'
  | 'banco_inexistente'
  | 'desconhecida';

const COMO_RESOLVER: Record<Causa, string> = {
  ok: 'Conexão estabelecida.',
  variavel_ausente:
    'A variável não existe no ambiente. Defina-a nas configurações da hospedagem e publique de novo — variáveis só valem a partir do próximo build.',
  variavel_malformada:
    'O valor não é uma URL de conexão válida. O formato é postgresql://USUARIO:SENHA@HOST:PORTA/postgres',
  host_nao_resolve:
    'O endereço do banco não existe. Copie o host da própria tela de connection string do provedor.',
  sem_resposta:
    'O host não respondeu. A causa mais comum é usar a conexão direta, que em muitos provedores só atende em IPv6. Use o host do pooler (transaction mode, porta 6543).',
  senha_incorreta:
    'Usuário ou senha não conferem. Num pooler gerenciado o usuário precisa do sufixo do projeto: app_user.SEU_PROJECT_REF, e não apenas app_user.',
  usuario_sem_sufixo_do_projeto:
    'O pooler não reconheceu o usuário. Falta o sufixo do projeto no nome do papel: app_user.SEU_PROJECT_REF',
  papel_expirado:
    "O papel tem prazo de validade vencido. Rode no SQL do provedor: alter role app_user valid until 'infinity';",
  tls_recusado: 'O servidor recusou a negociação de TLS.',
  banco_inexistente: 'O banco indicado no fim da URL não existe. No Supabase o nome é postgres.',
  desconhecida: 'Causa não reconhecida. Consulte o log do servidor para a mensagem completa.',
};

function classificar(erro: unknown): Causa {
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

/** Verifica UMA conexão, sem guardar o pool: isto não é caminho de produção. */
async function verificar(envVar: string) {
  const connectionString = process.env[envVar];
  if (!connectionString) {
    return { variavel: envVar, causa: 'variavel_ausente' as Causa, conecta: false };
  }

  let host: string;
  let porta: string;
  let usuarioTemSufixo: boolean;
  try {
    const url = new URL(connectionString);
    host = url.hostname;
    porta = url.port || '5432';
    // Só o FORMATO do usuário, nunca o valor.
    usuarioTemSufixo = decodeURIComponent(url.username).includes('.');
  } catch {
    return { variavel: envVar, causa: 'variavel_malformada' as Causa, conecta: false };
  }

  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  const pool = new Pool({
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 8000,
  });

  try {
    const r = await pool.query<{ papel: string; tabelas: string }>(
      `select current_user as papel,
              (select count(*)::text from information_schema.tables
                where table_schema = 'public' and table_type = 'BASE TABLE') as tabelas`,
    );
    return {
      variavel: envVar,
      causa: 'ok' as Causa,
      conecta: true,
      papel: r.rows[0]!.papel,
      tabelasVisiveis: Number(r.rows[0]!.tabelas),
      // Pistas de forma, úteis sem revelar credencial.
      portaUsada: porta,
      pareceConexaoDireta: !usuarioTemSufixo && porta === '5432' && !local,
    };
  } catch (erro) {
    return {
      variavel: envVar,
      causa: classificar(erro),
      conecta: false,
      portaUsada: porta,
      usuarioTemSufixoDoProjeto: usuarioTemSufixo,
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

export async function GET() {
  const conexoes = [];
  for (const v of VARIAVEIS) conexoes.push(await verificar(v));

  const tudoOk = conexoes.every((c) => c.conecta);
  const problemas = conexoes
    .filter((c) => !c.conecta)
    .map((c) => ({ variavel: c.variavel, causa: c.causa, oQueFazer: COMO_RESOLVER[c.causa] }));

  return NextResponse.json(
    {
      tudoOk,
      sessaoConfigurada: !!process.env.SESSION_SECRET,
      conexoes,
      problemas,
      observacao:
        'Este diagnóstico não expõe host, usuário nem senha. Para a mensagem completa do Postgres, veja o log do servidor.',
    },
    { status: tudoOk ? 200 : 503 },
  );
}
