/**
 * Diagnóstico do ambiente.
 *
 *   npm run doctor
 *
 * Verifica, em ordem, tudo que precisa estar de pé para a aplicação subir — e
 * diz o que fazer quando algo falha, em vez de só reportar o erro cru.
 */
import { existsSync } from 'node:fs';
import { Client } from 'pg';
import { loadEnv } from './env';

loadEnv();

type Resultado = { ok: boolean; titulo: string; detalhe: string; comoResolver?: string };

const resultados: Resultado[] = [];

function registrar(r: Resultado) {
  resultados.push(r);
  const marca = r.ok ? '  ok ' : ' ERRO';
  console.log(`${marca}  ${r.titulo}`);
  console.log(`        ${r.detalhe}`);
  if (!r.ok && r.comoResolver) console.log(`        → ${r.comoResolver}`);
  console.log();
}

async function main() {
  console.log('\nDiagnóstico do Painel de Sites\n');

  // ─── Node ───────────────────────────────────────────────────────────────
  const maior = Number(process.versions.node.split('.')[0]);
  registrar({
    ok: maior >= 20,
    titulo: 'Versão do Node',
    detalhe: `Node ${process.versions.node}`,
    comoResolver: 'O projeto precisa de Node 20 ou mais novo. Instale pelo nvm: nvm install 22',
  });

  // ─── Dependências ───────────────────────────────────────────────────────
  registrar({
    ok: existsSync('node_modules'),
    titulo: 'Dependências instaladas',
    detalhe: existsSync('node_modules') ? 'node_modules presente' : 'node_modules ausente',
    comoResolver: 'Rode: npm install',
  });

  // ─── Arquivo de ambiente ────────────────────────────────────────────────
  const temEnv = existsSync('.env.local') || existsSync('.env');
  registrar({
    ok: temEnv,
    titulo: 'Arquivo de ambiente',
    detalhe: temEnv ? 'encontrado' : 'nenhum .env.local ou .env',
    comoResolver: 'Rode: npm run setup (cria o arquivo e prepara o banco)',
  });

  const faltando = ['DATABASE_URL', 'DATABASE_URL_INGEST', 'DATABASE_URL_FORMS', 'SESSION_SECRET']
    .filter((v) => !process.env[v]);
  registrar({
    ok: faltando.length === 0,
    titulo: 'Variáveis obrigatórias',
    detalhe: faltando.length === 0 ? 'todas definidas' : `faltando: ${faltando.join(', ')}`,
    comoResolver: 'Compare seu .env.local com o .env.example',
  });

  if (!process.env.DATABASE_URL_ADMIN) {
    console.log('  Sem DATABASE_URL_ADMIN: parando aqui.\n');
    return encerrar();
  }

  // ─── Servidor de banco ──────────────────────────────────────────────────
  const adminUrl = new URL(process.env.DATABASE_URL_ADMIN);
  const manutencao = new URL(adminUrl.toString());
  manutencao.pathname = '/postgres';

  let servidorNoAr = false;
  try {
    const c = new Client({ connectionString: manutencao.toString(), connectionTimeoutMillis: 5000 });
    await c.connect();
    const v = await c.query<{ versao: string }>('select version() as versao');
    await c.end();
    servidorNoAr = true;
    registrar({
      ok: true,
      titulo: 'Servidor PostgreSQL',
      detalhe: `${adminUrl.host} — ${v.rows[0]!.versao.split(',')[0]}`,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    registrar({
      ok: false,
      titulo: 'Servidor PostgreSQL',
      detalhe: `não foi possível conectar em ${adminUrl.host} — ${mensagem}`,
      comoResolver: mensagem.includes('ECONNREFUSED')
        ? 'Nada escutando na porta. Suba o banco: docker compose up -d'
        : mensagem.includes('password') || mensagem.includes('autenti')
          ? 'Senha do papel postgres não confere com DATABASE_URL_ADMIN no .env.local'
          : 'Verifique host, porta e credenciais em DATABASE_URL_ADMIN',
    });
  }

  if (!servidorNoAr) return encerrar();

  // ─── Banco da aplicação ─────────────────────────────────────────────────
  const nomeBanco = adminUrl.pathname.replace(/^\//, '');
  try {
    const c = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
    await c.connect();
    const t = await c.query<{ total: string }>(
      `select count(*) as total from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'`,
    );
    const contas = await c.query<{ total: string }>('select count(*) as total from accounts').catch(() => null);
    await c.end();

    const tabelas = Number(t.rows[0]!.total);
    registrar({
      ok: tabelas >= 11,
      titulo: 'Migrações aplicadas',
      detalhe: `${tabelas} tabela(s) em ${nomeBanco}`,
      comoResolver: 'Rode: npm run db:setup',
    });

    registrar({
      ok: contas !== null && Number(contas.rows[0]!.total) > 0,
      titulo: 'Massa de desenvolvimento',
      detalhe: contas ? `${contas.rows[0]!.total} conta(s) cadastrada(s)` : 'tabela accounts inacessível',
      comoResolver: 'Rode: npm run db:seed',
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    registrar({
      ok: false,
      titulo: 'Banco da aplicação',
      detalhe: `${nomeBanco} — ${mensagem}`,
      comoResolver: mensagem.includes('does not exist')
        ? 'O banco ainda não existe. Rode: npm run setup'
        : 'Rode: npm run db:setup',
    });
  }

  // ─── Papéis da aplicação ────────────────────────────────────────────────
  for (const [papel, variavel] of [
    ['app_user', 'DATABASE_URL'],
    ['app_ingest', 'DATABASE_URL_INGEST'],
    ['app_forms', 'DATABASE_URL_FORMS'],
  ] as const) {
    const url = process.env[variavel];
    if (!url) continue;
    try {
      const c = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
      await c.connect();
      await c.query('select 1');
      await c.end();
      registrar({ ok: true, titulo: `Papel ${papel}`, detalhe: 'conecta e consulta' });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      registrar({
        ok: false,
        titulo: `Papel ${papel}`,
        detalhe: mensagem,
        comoResolver: 'Rode: npm run db:setup (sincroniza as senhas dos papéis com o .env.local)',
      });
    }
  }

  encerrar();
}

function encerrar() {
  const falhas = resultados.filter((r) => !r.ok);
  if (falhas.length === 0) {
    console.log('Tudo certo. Rode `npm run dev` e abra http://localhost:3000\n');
    return;
  }
  console.log(`${falhas.length} problema(s): ${falhas.map((f) => f.titulo).join(', ')}\n`);
  process.exitCode = 1;
}

main().catch((erro) => {
  console.error('\nO diagnóstico falhou:', erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
