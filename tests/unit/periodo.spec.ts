import { describe, it, expect, beforeAll } from 'vitest';
import { withAccount } from '@/server/db';
import { resolvePeriod, getDailySeries, getKpis } from '@/server/metrics/queries';
import { parsePeriodParams } from '@/lib/periodo';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';
import { Client } from 'pg';

/**
 * Períodos e fuso horário.
 *
 * As datas são gravadas em UTC e recortadas no fuso do site. Um site em
 * America/Sao_Paulo tem o dia começando às 03:00 UTC — e é isso que precisa
 * valer, não aritmética de 24 horas para trás.
 */

let accountId: string;
let site: { id: string; timezone: string };

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const c = await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.agencia.nome]);
  const s = await admin.query<{ id: string; timezone: string }>(
    'select id, timezone from sites where public_id = $1', [MASSA.siteAlfa],
  );
  accountId = c.rows[0]!.id;
  site = s.rows[0]!;
  await admin.end();
});

describe('leitura dos parâmetros da URL', () => {
  it('usa 7 dias como padrão quando o período é ausente ou inválido', () => {
    expect(parsePeriodParams({}).key).toBe('7d');
    expect(parsePeriodParams({ periodo: 'inventado' }).key).toBe('7d');
  });

  it('aceita os períodos conhecidos', () => {
    expect(parsePeriodParams({ periodo: 'hoje' }).key).toBe('hoje');
    expect(parsePeriodParams({ periodo: '30d' }).key).toBe('30d');
  });

  it('cai para 7 dias quando o personalizado vem sem datas válidas', () => {
    // Melhor mostrar um período válido do que uma tela vazia sem explicação.
    expect(parsePeriodParams({ periodo: 'personalizado' }).key).toBe('7d');
    expect(parsePeriodParams({ periodo: 'personalizado', de: '2026-01-10' }).key).toBe('7d');
    expect(parsePeriodParams({ periodo: 'personalizado', de: 'xx', ate: 'yy' }).key).toBe('7d');
  });

  it('recusa intervalo invertido', () => {
    expect(parsePeriodParams({ periodo: 'personalizado', de: '2026-05-10', ate: '2026-05-01' }).key).toBe('7d');
  });

  it('aceita um intervalo personalizado válido', () => {
    const p = parsePeriodParams({ periodo: 'personalizado', de: '2026-05-01', ate: '2026-05-10' });
    expect(p).toEqual({ key: 'personalizado', de: '2026-05-01', ate: '2026-05-10' });
  });
});

describe('recorte no fuso do site', () => {
  it('o início do dia local não é meia-noite UTC', async () => {
    const p = await withAccount(accountId, (db) => resolvePeriod(db, 'America/Sao_Paulo', { key: 'hoje' }));
    // São Paulo está em UTC-3: o dia local começa às 03:00 UTC.
    expect(p.from.getUTCHours()).toBe(3);
    expect(p.days).toBe(1);
  });

  it('fusos diferentes produzem janelas diferentes para o mesmo "hoje"', async () => {
    const sp = await withAccount(accountId, (db) => resolvePeriod(db, 'America/Sao_Paulo', { key: 'hoje' }));
    const manaus = await withAccount(accountId, (db) => resolvePeriod(db, 'America/Manaus', { key: 'hoje' }));
    expect(sp.from.getTime()).not.toBe(manaus.from.getTime());
  });

  it('o período anterior tem a mesma duração e termina onde o atual começa', async () => {
    const p = await withAccount(accountId, (db) => resolvePeriod(db, site.timezone, { key: '7d' }));
    expect(p.previousTo.getTime()).toBe(p.from.getTime());
    expect(p.to.getTime() - p.from.getTime()).toBe(p.previousTo.getTime() - p.previousFrom.getTime());
  });

  it('o intervalo personalizado cobre os dois extremos, inclusive', async () => {
    const p = await withAccount(accountId, (db) =>
      resolvePeriod(db, 'America/Sao_Paulo', { key: 'personalizado', de: '2026-05-01', ate: '2026-05-10' }),
    );
    expect(p.days).toBe(10);
  });
});

describe('a série diária respeita o fuso', () => {
  it('devolve um ponto por dia local, na ordem cronológica', async () => {
    const p = await withAccount(accountId, (db) => resolvePeriod(db, site.timezone, { key: '7d' }));
    const serie = await withAccount(accountId, (db) => getDailySeries(db, site, { ...p, label: '' }));

    expect(serie).toHaveLength(7);
    const datas = serie.map((d) => d.dia);
    expect([...datas].sort()).toEqual(datas);
  });

  it('30 dias devolve 30 pontos e um total maior ou igual ao de 7 dias', async () => {
    const trinta = await withAccount(accountId, async (db) => {
      const p = await resolvePeriod(db, site.timezone, { key: '30d' });
      return { serie: await getDailySeries(db, site, { ...p, label: '' }), kpis: await getKpis(db, site, { ...p, label: '' }) };
    });
    const sete = await withAccount(accountId, async (db) => {
      const p = await resolvePeriod(db, site.timezone, { key: '7d' });
      return getKpis(db, site, { ...p, label: '' });
    });

    expect(trinta.serie).toHaveLength(30);
    expect(trinta.kpis.atual.sessoes).toBeGreaterThanOrEqual(sete.atual.sessoes);
    // Visitantes únicos de 30 dias NÃO é a soma dos de 7 em 7.
    expect(trinta.kpis.atual.visitantesUnicos).toBeLessThanOrEqual(trinta.kpis.atual.sessoes);
  });
});
