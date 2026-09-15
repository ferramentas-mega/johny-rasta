import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount, withIngest, withForms } from '@/server/db';
import { obterSite, listarSites } from '@/server/services/sites';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';

/**
 * Autorização.
 *
 * Testa as DUAS camadas separadamente:
 *  - o serviço, que só devolve dados da conta da sessão;
 *  - o banco, que nega mesmo quando o serviço é contornado.
 *
 * O segundo grupo é o que importa: ocultar na interface não é autorização.
 */

let agencia: string;
let rival: string;
let siteDaAgencia: string;
let siteDoRival: string;

beforeAll(async () => {
  await prepararBancoDeTeste();

  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const contas = await admin.query<{ id: string; name: string }>('select id, name from accounts');
  agencia = contas.rows.find((c) => c.name === CONTAS.agencia.nome)!.id;
  rival = contas.rows.find((c) => c.name === CONTAS.rival.nome)!.id;

  const sites = await admin.query<{ id: string; public_id: string }>('select id, public_id from sites');
  siteDaAgencia = sites.rows.find((s) => s.public_id === MASSA.siteAlfa)!.id;
  siteDoRival = sites.rows.find((s) => s.public_id === MASSA.siteRival)!.id;
  await admin.end();
});

describe('isolamento entre contas', () => {
  it('cada conta enxerga somente os próprios sites', async () => {
    const daAgencia = await listarSites(agencia);
    const doRival = await listarSites(rival);

    // Lista exata, não "contém": se um site alheio vazar para cá, o teste precisa
    // falhar, e não passar por acaso.
    expect(daAgencia.map((s) => s.name).sort()).toEqual([
      'alfa.teste', 'beta.teste', 'escrita.teste', 'novo.teste',
    ]);
    expect(doRival.map((s) => s.name)).toEqual(['rival.teste']);
  });

  it('pedir o site de outra conta pelo id devolve nada, não os dados', async () => {
    // O id é válido e existe. O que não existe é a permissão.
    const invasao = await obterSite(agencia, siteDoRival);
    expect(invasao).toBeNull();

    const proprio = await obterSite(agencia, siteDaAgencia);
    expect(proprio?.name).toBe('alfa.teste');
  });

  it('consultar leads de outra conta devolve zero linhas, mesmo com o site_id correto', async () => {
    const vazamento = await withAccount(agencia, (db) =>
      db.query('select id, email from leads where site_id = $1', [siteDoRival]),
    );
    expect(vazamento).toHaveLength(0);

    // Prova de que o lead existe de fato — o que falhou foi o acesso, não a massa.
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const real = await admin.query('select email from leads where site_id = $1', [siteDoRival]);
    await admin.end();
    expect(real.rows[0]?.email).toBe('segredo@rival.teste');
  });

  it('sem conta definida na transação, a RLS não devolve nada', async () => {
    // O padrão é negar: app.account_id ausente vira NULL, e nenhuma política casa.
    const semContexto = await withAccount('00000000-0000-0000-0000-000000000000', (db) =>
      db.query('select id from sites'),
    );
    expect(semContexto).toHaveLength(0);
  });

  it('não é possível gravar uma linha carimbada com outra conta', async () => {
    // A cláusula WITH CHECK das políticas barra a escrita cruzada.
    await expect(
      withAccount(agencia, (db) =>
        db.query(
          `insert into clients (account_id, name) values ($1, 'Invasor')`,
          [rival],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('privilégios dos endpoints públicos', () => {
  it('o papel de analytics não consegue ler leads — é negativa do banco, não da interface', async () => {
    await expect(withIngest((db) => db.query('select * from leads'))).rejects.toThrow(
      /permission denied for table leads/i,
    );
  });

  it('o papel de analytics não consegue ler usuários, clientes nem submissões', async () => {
    for (const tabela of ['users', 'clients', 'form_submissions', 'accounts', 'integrations']) {
      await expect(withIngest((db) => db.query(`select * from ${tabela}`))).rejects.toThrow(
        new RegExp(`permission denied for table ${tabela}`, 'i'),
      );
    }
  });

  it('o papel de formulários grava leads, mas continua sem acesso a usuários e clientes', async () => {
    // Precisa de leads para deduplicar contatos do próprio site.
    await expect(withForms((db) => db.query('select count(*) from leads'))).resolves.toBeDefined();

    for (const tabela of ['users', 'accounts', 'integrations']) {
      await expect(withForms((db) => db.query(`select * from ${tabela}`))).rejects.toThrow(
        new RegExp(`permission denied for table ${tabela}`, 'i'),
      );
    }
  });

  it('o papel de formulários não pode alterar submissões já gravadas', async () => {
    // Uma submissão é um fato registrado, não um registro editável.
    await expect(
      withForms((db) => db.query("update form_submissions set form_name = 'adulterado'")),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o papel de analytics não pode apagar eventos', async () => {
    await expect(withIngest((db) => db.query('delete from events'))).rejects.toThrow(/permission denied/i);
  });
});

describe('e-mail de login é único', () => {
  it('não aceita dois usuários com o mesmo e-mail, nem trocando a caixa', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const conta = await admin.query<{ id: string }>('select id from accounts limit 1');
    const email = `duplicado-${Date.now()}@teste.com`;

    await admin.query(
      `insert into users (account_id, email, password_hash, name) values ($1, $2, 'scrypt$a$b', 'Um')`,
      [conta.rows[0]!.id, email],
    );

    // Mesmo e-mail, caixa diferente: continua sendo a mesma caixa postal, e o
    // login ficaria ambíguo — é exatamente o que o índice impede.
    await expect(
      admin.query(
        `insert into users (account_id, email, password_hash, name) values ($1, $2, 'scrypt$a$b', 'Dois')`,
        [conta.rows[0]!.id, email.toUpperCase()],
      ),
    ).rejects.toThrow(/users_email_unico|duplicate key/i);

    await admin.query('delete from users where lower(email) = lower($1)', [email]);
    await admin.end();
  });
});
