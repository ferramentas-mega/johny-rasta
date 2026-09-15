import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount, withIngest, withForms, withoutAccount } from '@/server/db';
import { obterSite, listarSites } from '@/server/services/sites';
import {
  salvarRecursos,
  salvarModoFormulario,
  abrirDiagnostico,
  SiteForaDaConta,
} from '@/server/services/onboarding';
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

describe('escrever no site de outra conta', () => {
  /**
   * O buraco que estes testes fecham, e por que a RLS sozinha não fechava.
   *
   * As Actions do assistente recebem o `siteId` por CAMPO OCULTO do formulário.
   * Server Action não é rota: o Next não confere esse valor contra o `[siteId]`
   * do caminho, e nada impede mandar o id de um site alheio.
   *
   * A política de `site_features` casa por `account_id`, e o valor gravado ali
   * vem de `app.current_account_id()` — o de quem ESCREVE. Ou seja: a política
   * aprova a linha, porque a linha é da conta certa. O que ela não olha é o
   * `site_id`, que veio do corpo da requisição.
   *
   * Como `site_features` tem `unique (site_id, feature)`, a linha intrusa
   * trancava o dono legítimo para sempre — contra um registro que a própria
   * política esconde dele.
   */
  it('salvar recursos num site alheio é recusado, não gravado em silêncio', async () => {
    await expect(salvarRecursos(rival, siteDaAgencia, ['visitas'])).rejects.toThrow(SiteForaDaConta);

    // A prova que importa não é a exceção: é que nada foi gravado. Um `catch`
    // mal colocado poderia lançar DEPOIS do insert.
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const intrusas = await admin.query(
      'select 1 from site_features where site_id = $1 and account_id = $2',
      [siteDaAgencia, rival],
    );
    await admin.end();
    expect(intrusas.rowCount).toBe(0);
  });

  it('abrir diagnóstico num site alheio é recusado', async () => {
    await expect(abrirDiagnostico(rival, siteDaAgencia)).rejects.toThrow(SiteForaDaConta);
  });

  it('trocar o modo de formulário de um site alheio é recusado', async () => {
    await expect(salvarModoFormulario(rival, siteDaAgencia, 'externo')).rejects.toThrow(
      SiteForaDaConta,
    );

    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const site = await admin.query<{ form_mode: string | null }>(
      'select form_mode from sites where id = $1',
      [siteDaAgencia],
    );
    await admin.end();
    expect(site.rows[0]!.form_mode).not.toBe('externo');
  });

  it('site inexistente e site alheio dão a MESMA resposta', async () => {
    // Distinguir "não é seu" de "não existe" confirma a existência de um
    // registro alheio para quem tem só o identificador.
    const inexistente = '00000000-0000-0000-0000-000000000000';
    const alheio = salvarRecursos(rival, siteDaAgencia, ['visitas']);
    const fantasma = salvarRecursos(rival, inexistente, ['visitas']);

    await expect(alheio).rejects.toThrow(SiteForaDaConta);
    await expect(fantasma).rejects.toThrow(SiteForaDaConta);
  });

  it('no PRÓPRIO site, a mesma chamada grava normalmente', async () => {
    // Sem este caso, a guarda poderia estar recusando tudo e os testes acima
    // passariam do mesmo jeito.
    await expect(salvarRecursos(agencia, siteDaAgencia, ['visitas'])).resolves.toBeUndefined();
  });
});

describe('o cron enxerga a fila', () => {
  /**
   * Regressão medida, não deduzida: os dois endpoints agendados rodavam com
   * `withoutAccount`, sem `app.account_id`, contra tabelas com RLS `FORCE`.
   * `app.current_account_id()` devolvia NULL, `account_id = NULL` é NULL, e
   * nenhuma linha casava. A fila era invisível e os endpoints respondiam
   * "enfileiradas: 0" e "fila vazia" todo dia, sem erro nenhum.
   */
  it('sem conta na transação, a fila continua invisível — e por isso o cron pergunta antes', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    await admin.query(
      `insert into audit_jobs (account_id, site_id, url, strategy, status)
       values ($1, $2, 'https://prova-do-cron.teste/', 'mobile', 'pendente')`,
      [agencia, siteDaAgencia],
    );

    // O caminho antigo: app_user sem conta. Continua vendo zero — a RLS não foi
    // afrouxada, e não deve ser.
    const invisivel = await withoutAccount((db) =>
      db.one<{ n: number }>(
        `select count(*)::int as n from audit_jobs where url = 'https://prova-do-cron.teste/'`,
      ),
    );
    expect(invisivel!.n).toBe(0);

    // O caminho novo: a função SECURITY DEFINER responde QUAL conta tem trabalho,
    // devolvendo só identificadores de conta — nunca a URL, nunca o site.
    const contas = await withoutAccount((db) =>
      db.query<{ conta: string }>('select app.contas_com_job_pendente($1) as conta', [10]),
    );
    expect(contas.map((c) => c.conta)).toContain(agencia);

    // E dentro da conta, a fila aparece.
    const visivel = await withAccount(agencia, (db) =>
      db.one<{ n: number }>(
        `select count(*)::int as n from audit_jobs where url = 'https://prova-do-cron.teste/'`,
      ),
    );
    expect(visivel!.n).toBe(1);

    await admin.query(`delete from audit_jobs where url = 'https://prova-do-cron.teste/'`);
    await admin.end();
  });

  it('a função do cron não devolve dado de cliente, só o identificador da conta', async () => {
    const colunas = await withoutAccount((db) =>
      db.query<Record<string, unknown>>('select app.contas_com_job_pendente($1) as conta', [10]),
    );
    // Uma função que devolvesse a linha inteira do job seria um jeito de ler
    // `audit_jobs` de todas as contas sem passar pela política.
    for (const linha of colunas) expect(Object.keys(linha)).toEqual(['conta']);
  });
});
