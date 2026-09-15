import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { getCarteira, totalizarCarteira, variacao, getKpis, resolvePeriod } from '@/server/metrics/queries';
import { prepararBancoDeTeste, CONTAS } from '../../scripts/test-db';

/**
 * A carteira precisa ser exatamente a soma dos painéis individuais.
 *
 * Se divergir, o usuário vê um número na Visão geral e outro ao abrir o
 * cliente — e não tem como saber qual acreditar. É o defeito que a disciplina
 * de fonte única existe para impedir, e este arquivo é quem prova.
 */

let contaId: string;
let sites: { id: string; timezone: string; client_id: string }[];

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const c = await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.agencia.nome]);
  contaId = c.rows[0]!.id;
  const s = await admin.query<{ id: string; timezone: string; client_id: string }>(
    'select id, timezone, client_id from sites where account_id = $1 and archived_at is null', [contaId],
  );
  sites = s.rows;
  await admin.end();
});

describe('a carteira é a soma dos painéis individuais', () => {
  it('sessões, WhatsApp e leads batem site a site', async () => {
    const linhas = await withAccount(contaId, (db) => getCarteira(db, 7));
    const totais = totalizarCarteira(linhas);

    // Soma os indicadores individuais, um site por vez, com a MESMA função que
    // a tela do site usa.
    let sessoes = 0;
    let whatsapp = 0;
    let leads = 0;
    for (const site of sites) {
      const kpis = await withAccount(contaId, async (db) => {
        const p = await resolvePeriod(db, site.timezone, { key: '7d' });
        return getKpis(db, { id: site.id, timezone: site.timezone }, p);
      });
      sessoes += kpis.atual.sessoes;
      whatsapp += kpis.atual.cliquesWhatsapp;
      leads += kpis.atual.leads;
    }

    expect(totais.sessoes).toBe(sessoes);
    expect(totais.cliquesWhatsapp).toBe(whatsapp);
    expect(totais.leads).toBe(leads);
  });

  it('conta todos os sites da conta, inclusive os sem coleta', async () => {
    const linhas = await withAccount(contaId, (db) => getCarteira(db, 7));
    const totais = totalizarCarteira(linhas);
    expect(totais.sites).toBe(sites.length);
  });

  it('distingue site cadastrado de site que realmente coleta', async () => {
    const linhas = await withAccount(contaId, (db) => getCarteira(db, 7));
    const totais = totalizarCarteira(linhas);
    // A massa tem um site sem nenhum evento, de propósito.
    expect(totais.sitesComColeta).toBeLessThan(totais.sites);
    expect(totais.sitesComColeta).toBeGreaterThan(0);
  });
});

describe('a taxa geral NÃO é a média das taxas', () => {
  it('usa soma dos numeradores sobre soma dos denominadores', async () => {
    const linhas = await withAccount(contaId, (db) => getCarteira(db, 7));
    const totais = totalizarCarteira(linhas);

    const convertidas = linhas.reduce((t, l) => t + l.sessoesConvertidasAbs, 0);
    const sessoes = linhas.reduce((t, l) => t + l.sessoes, 0);
    expect(totais.taxaConversao).toBeCloseTo(convertidas / sessoes, 10);

    // A média simples das taxas por cliente dá outro número quando os clientes
    // têm volumes diferentes. Este teste existe para travar a fórmula certa.
    const comSessoes = linhas.filter((l) => l.sessoes > 0);
    const media = comSessoes.reduce((t, l) => t + l.sessoesConvertidasAbs / l.sessoes, 0) / comSessoes.length;
    if (Math.abs(media - convertidas / sessoes) > 1e-9) {
      expect(totais.taxaConversao).not.toBeCloseTo(media, 9);
    }
  });

  it('sem sessões, a taxa é indisponível e não zero', () => {
    const vazio = totalizarCarteira([]);
    expect(vazio.taxaConversao).toBeNull();
    expect(vazio.taxaConversao).not.toBe(0);
  });
});

describe('variação sobre base zero', () => {
  it('não devolve crescimento infinito', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(0, 0)).toBeNull();
  });

  it('calcula normalmente quando há base', () => {
    expect(variacao(150, 100)).toBeCloseTo(0.5, 10);
    expect(variacao(50, 100)).toBeCloseTo(-0.5, 10);
  });
});

describe('isolamento entre contas', () => {
  it('a carteira de uma conta não enxerga clientes da outra', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const rival = await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.rival.nome]);
    await admin.end();

    const daAgencia = await withAccount(contaId, (db) => getCarteira(db, 7));
    const doRival = await withAccount(rival.rows[0]!.id, (db) => getCarteira(db, 7));

    const nomesAgencia = daAgencia.map((l) => l.cliente);
    for (const linha of doRival) expect(nomesAgencia).not.toContain(linha.cliente);
    expect(doRival.length).toBeGreaterThan(0);
  });
});
