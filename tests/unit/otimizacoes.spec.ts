import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { listarOtimizacoes } from '@/server/qualidade/otimizacoes';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';

/**
 * A lista de prioridades. O que estes testes protegem é o que a lista NÃO pode
 * concluir sozinha — porque alarme falso treina o usuário a ignorar a tela.
 */

let contaId: string;
let siteEscrita: string;
let siteSemColeta: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  contaId = (await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.agencia.nome])).rows[0]!.id;
  siteEscrita = (await admin.query<{ id: string }>('select id from sites where public_id = $1', [MASSA.siteEscrita])).rows[0]!.id;
  siteSemColeta = (await admin.query<{ id: string }>('select id from sites where public_id = $1', [MASSA.siteSemColeta])).rows[0]!.id;
  await admin.end();
});

beforeEach(async () => {
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  for (const t of ['lighthouse_results', 'audit_jobs', 'monitored_urls', 'optimizations']) {
    await admin.query(`delete from ${t} where site_id = any($1::uuid[])`, [[siteEscrita, siteSemColeta]]);
  }
  await admin.end();
});

async function inserir(sql: string, params: unknown[]) {
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  await admin.query(sql, params);
  await admin.end();
}

describe('desempenho ruim entra na lista', () => {
  it('nota baixa numa página monitorada aparece como item técnico', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', 0.31 from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const tecnico = itens.find((o) => o.tipo === 'tecnico');
    expect(tecnico).toBeDefined();
    expect(tecnico!.evidencia).toContain('31');
  });

  it('nota boa NÃO entra', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', 0.95 from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.tipo === 'tecnico' && o.siteId === siteEscrita)).toHaveLength(0);
  });

  it('nota AUSENTE não entra — ausência não é nota ruim', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', null from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.tipo === 'tecnico' && o.siteId === siteEscrita)).toHaveLength(0);
  });

  it('só a análise MAIS RECENTE conta: uma nota velha e ruim não alerta para sempre', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', 0.20, now() - interval '5 days' from sites where id = $1`,
      [siteEscrita],
    );
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', 0.97, now() from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.tipo === 'tecnico' && o.siteId === siteEscrita)).toHaveLength(0);
  });
});

describe('URL prioritária sem análise', () => {
  it('entra como pendência de atualização', async () => {
    await inserir(
      `insert into monitored_urls (account_id, site_id, url, prioritaria)
       select account_id, id, 'https://escrita.teste/planos', true from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const item = itens.find((o) => o.tipo === 'atualizacao' && o.url?.includes('/planos'));
    expect(item).toBeDefined();
    expect(item!.titulo).toContain('nunca analisada');
  });

  it('URL NÃO prioritária não vira pendência', async () => {
    await inserir(
      `insert into monitored_urls (account_id, site_id, url, prioritaria)
       select account_id, id, 'https://escrita.teste/blog', false from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.url?.includes('/blog'))).toHaveLength(0);
  });
});

describe('o que a lista se recusa a concluir', () => {
  it('site de pouco tráfego sem eventos NÃO vira "rastreamento quebrado"', async () => {
    // O site sem coleta da massa tem zero eventos. Se a regra fosse só "sem
    // evento recente", ele viraria alarme — e alarme falso treina o usuário a
    // ignorar a tela inteira.
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.tipo === 'coleta' && o.siteId === siteSemColeta)).toHaveLength(0);
  });

  it('não afirma relação entre problema técnico e queda de conversão', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance)
       select account_id, id, 'https://escrita.teste/', 'https://escrita.teste/', 'mobile', 0.20 from sites where id = $1`,
      [siteEscrita],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    for (const o of itens) {
      expect(o.titulo.toLowerCase()).not.toMatch(/causou|por causa|resultou em/);
      expect(o.evidencia.toLowerCase()).not.toMatch(/causou|por causa|resultou em/);
    }
  });
});

describe('isolamento entre contas', () => {
  it('a lista de uma conta não mostra pendência de outra', async () => {
    await inserir(
      `insert into lighthouse_results (account_id, site_id, url_solicitada, url_final, strategy, performance)
       select account_id, id, 'https://rival.teste/', 'https://rival.teste/', 'mobile', 0.10 from sites where public_id = $1`,
      [MASSA.siteRival],
    );
    const itens = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(itens.filter((o) => o.url?.includes('rival.teste'))).toHaveLength(0);
  });
});
