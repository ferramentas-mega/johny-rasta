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

describe('a âncora da massa cai dentro da janela, a qualquer hora do dia', () => {
  /**
   * Guarda contra uma falha que já aconteceu e some sozinha.
   *
   * A massa ancorava o "dia 0" em 12:00 UTC de hoje, enquanto as consultas
   * recortam a janela no fuso do site. Entre 00:00 e 03:00 UTC, São Paulo ainda
   * está no dia anterior: o dia 0 caía num dia futuro, saía da janela de 7 dias,
   * e quatro testes numéricos quebravam — nas outras 21 horas, passavam.
   *
   * Comparar contagem não serviria de guarda: fora daquelas 3 horas, o teste
   * passaria mesmo com o defeito de volta. Então a asserção é sobre a borda em
   * si, e vale a qualquer hora.
   */
  it('o evento mais recente da massa é anterior ao fim da janela, e não posterior', async () => {
    const p = await withAccount(accountId, (db) => resolvePeriod(db, site.timezone, { key: '7d' }));

    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<{ ultimo: Date }>(
      'select max(occurred_at) as ultimo from events where site_id = $1',
      [site.id],
    );
    await admin.end();

    const ultimo = rows[0]!.ultimo;
    expect(ultimo).not.toBeNull();
    expect(ultimo.getTime()).toBeLessThan(new Date(p.to).getTime());
    expect(ultimo.getTime()).toBeGreaterThanOrEqual(new Date(p.from).getTime());
  });

  it('o dia 0 da massa é o mesmo "hoje" que a consulta enxerga', async () => {
    const hoje = await withAccount(accountId, (db) => resolvePeriod(db, site.timezone, { key: 'hoje' }));
    const serie = await withAccount(accountId, async (db) => {
      const p = await resolvePeriod(db, site.timezone, { key: '7d' });
      return getDailySeries(db, site, { ...p, label: '' });
    });

    // O último dia da série de 7 dias tem que ser o mesmo dia que "hoje" recorta.
    const ultimoDia = serie[serie.length - 1]!.dia;
    const inicioDeHoje = new Date(hoje.from).toISOString().slice(0, 10);
    const diaDeHoje = new Date(new Date(hoje.from).getTime() + 12 * 3_600_000).toISOString().slice(0, 10);
    expect([inicioDeHoje, diaDeHoje]).toContain(ultimoDia);
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
