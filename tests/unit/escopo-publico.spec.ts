import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { withIngest, withForms } from '@/server/db';
import { resolverSite } from '@/server/services/ingestao';
import { prepararBancoDeTeste, MASSA } from '../../scripts/test-db';

/**
 * Os papéis públicos enxergam UM site, não todos.
 *
 * Antes desta rodada, `app_ingest` e `app_forms` tinham políticas `using
 * (true)` em `pages`, `sessions`, `events`, `leads` e `form_submissions`. Não
 * havia vazamento em curso — as consultas dos dois endpoints sempre filtraram
 * por site —, mas era a única parte do sistema onde quem protegia era o código,
 * e não a política. Um `where` esquecido ali devolveria a base inteira.
 *
 * Estes testes não conferem o texto da política: eles TENTAM ler os dados de
 * outro site, com o identificador certo em mãos, pelos mesmos papéis que os
 * endpoints públicos usam.
 *
 * Nada aqui planta linha no rival — `autorizacao.spec.ts` afirma o e-mail do
 * primeiro lead dele, e uma linha a mais tornaria aquele teste dependente da
 * ordem. O alvo é o lead que a própria massa semeia.
 */

let admin: Client;
let siteA: { id: string; clientId: string };
let siteRival: { id: string; sessionId: string };
let leadDoRival: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();

  const a = await admin.query<{ id: string; client_id: string }>(
    'select id, client_id from sites where public_id = $1',
    [MASSA.siteEscrita],
  );
  siteA = { id: a.rows[0]!.id, clientId: a.rows[0]!.client_id };

  const r = await admin.query<{ id: string }>('select id from sites where public_id = $1', [
    MASSA.siteRival,
  ]);
  const sessao = await admin.query<{ id: string }>(
    'select id from sessions where site_id = $1 limit 1',
    [r.rows[0]!.id],
  );
  siteRival = { id: r.rows[0]!.id, sessionId: sessao.rows[0]!.id };

  // O lead que a massa já semeia para o rival. Ele precisa existir de verdade,
  // senão "não achei nada" não prova acesso negado — prova tabela vazia.
  const lead = await admin.query<{ id: string }>('select id from leads where site_id = $1 limit 1', [
    siteRival.id,
  ]);
  leadDoRival = lead.rows[0]!.id;
  expect(leadDoRival).toBeTruthy();
});

describe('app_forms enxerga só o site da requisição', () => {
  it('CONTROLE: com o site resolvido, o papel grava e lê o lead DAQUELE site', async () => {
    // Sem este caso, todos os testes abaixo passariam com uma política que
    // simplesmente nega tudo — inclusive ao endpoint que precisa gravar.
    const chave = `email:proprio-${randomUUID()}@teste.com`;
    const lido = await withForms(async (db) => {
      const site = await resolverSite(db, MASSA.siteEscrita);
      expect(site).toBeTruthy();
      const novo = await db.one<{ id: string }>(
        `insert into leads (account_id, site_id, client_id, name, email, dedupe_key)
         values ((select account_id from sites where id = $1), $1, $2, 'Do Proprio', $3, $4)
         returning id`,
        [siteA.id, siteA.clientId, `proprio-${randomUUID()}@teste.com`, chave],
      );
      return db.one('select id from leads where id = $1', [novo!.id]);
    });
    expect(lido).toBeTruthy();
  });

  it('com o site A resolvido, o lead do RIVAL não existe — mesmo com o id em mãos', async () => {
    const achado = await withForms(async (db) => {
      await resolverSite(db, MASSA.siteEscrita);
      return db.one('select id, email from leads where id = $1', [leadDoRival]);
    });
    expect(achado).toBeNull();
  });

  it('sem site resolvido, a tabela inteira é vazia — o padrão é negar', async () => {
    const tudo = await withForms((db) => db.query('select id from leads'));
    expect(tudo).toEqual([]);
  });

  it('não dá para GRAVAR uma submissão no site de outra conta', async () => {
    // A política tem `with check` além do `using`: sem ele, o endpoint poderia
    // escrever onde não consegue ler, que é a forma silenciosa do problema.
    await expect(
      withForms(async (db) => {
        await resolverSite(db, MASSA.siteEscrita);
        return db.query(
          `insert into form_submissions
             (account_id, site_id, form_name, payload, idempotency_key, created_at)
           values ((select account_id from sites where id = $1), $1, 'Plantado', '{}'::jsonb, $2, now())`,
          [siteRival.id, randomUUID()],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('app_ingest enxerga só o site da requisição', () => {
  it('não lê eventos de outro site', async () => {
    const doRival = await withIngest(async (db) => {
      await resolverSite(db, MASSA.siteEscrita);
      return db.query('select id from events where site_id = $1', [siteRival.id]);
    });
    expect(doRival).toEqual([]);
  });

  it('sem site resolvido, nenhum evento é visível', async () => {
    const tudo = await withIngest((db) => db.query('select id from events limit 1'));
    expect(tudo).toEqual([]);
  });

  it('não dá para plantar evento no site de outra conta', async () => {
    await expect(
      withIngest(async (db) => {
        await resolverSite(db, MASSA.siteEscrita);
        return db.query(
          `insert into events (account_id, site_id, session_id, type, occurred_at, event_uid)
           values ((select account_id from sites where id = $1), $1, $2, 'page_view', now(), $3)`,
          [siteRival.id, siteRival.sessionId, randomUUID()],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('o escopo vem do site resolvido, e acompanha a resolução', () => {
  it('resolver outro site na mesma transação move o escopo', async () => {
    // Prova que o mecanismo é o ajuste feito por `resolverSite`, e não um
    // efeito colateral da conexão: o MESMO papel, na MESMA transação, passa a
    // enxergar o rival depois de resolvê-lo.
    const [antes, depois] = await withIngest(async (db) => {
      await resolverSite(db, MASSA.siteEscrita);
      const a = await db.query('select id from events where site_id = $1 limit 1', [siteRival.id]);
      await resolverSite(db, MASSA.siteRival);
      const b = await db.query('select id from events where site_id = $1 limit 1', [siteRival.id]);
      return [a, b];
    });
    expect(antes).toEqual([]);
    expect(depois.length).toBeGreaterThan(0);
  });

  it('o identificador público continua sendo a chave — e continua público', async () => {
    // Registrado de propósito: nada aqui impede quem tem o `public_id` de
    // mandar eventos daquele site. Isso é da natureza de um coletor que roda no
    // navegador; quem limita o abuso é o rate limit, não a política. O que a
    // política reduz é o ALCANCE de um erro: no máximo um site, nunca a base.
    const site = await withIngest((db) => resolverSite(db, MASSA.siteRival));
    expect(site!.id).toBe(siteRival.id);
  });
});
