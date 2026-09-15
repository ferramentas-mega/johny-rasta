import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import {
  getKpis,
  getDailySeries,
  getByPage,
  getByButton,
  getBySource,
  resolvePeriod,
} from '@/server/metrics/queries';
import { prepararBancoDeTeste, MASSA, ESPERADO_ALFA_7D, CONTAS } from '../../scripts/test-db';

/**
 * Agregações contra o banco de testes.
 *
 * Os valores esperados estão escritos à mão em scripts/test-db.ts, derivados da
 * massa. Se uma consulta mudar de comportamento, o teste falha em vez de
 * acompanhar a mudança — que é o ponto de ter valores fixos.
 */

let accountId: string;
let site: { id: string; timezone: string };

async function contexto() {
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const conta = await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.agencia.nome]);
  const s = await admin.query<{ id: string; timezone: string }>(
    'select id, timezone from sites where public_id = $1',
    [MASSA.siteAlfa],
  );
  await admin.end();
  return { accountId: conta.rows[0]!.id, site: s.rows[0]! };
}

beforeAll(async () => {
  await prepararBancoDeTeste();
  const ctx = await contexto();
  accountId = ctx.accountId;
  site = ctx.site;
});

const periodo7d = () =>
  withAccount(accountId, (db) => resolvePeriod(db, site.timezone, { key: '7d' }));

describe('indicadores do site Alfa em 7 dias', () => {
  it('produz exatamente os totais especificados pela massa', async () => {
    const p = await periodo7d();
    const kpis = await withAccount(accountId, (db) => getKpis(db, site, { ...p, label: '' }));

    expect(kpis.atual.sessoes).toBe(ESPERADO_ALFA_7D.sessoes);
    expect(kpis.atual.visitantesUnicos).toBe(ESPERADO_ALFA_7D.visitantesUnicos);
    expect(kpis.atual.visualizacoes).toBe(ESPERADO_ALFA_7D.visualizacoes);
    expect(kpis.atual.cliquesCta).toBe(ESPERADO_ALFA_7D.cliquesCta);
    expect(kpis.atual.cliquesWhatsapp).toBe(ESPERADO_ALFA_7D.cliquesWhatsapp);
    expect(kpis.atual.cliquesContato).toBe(ESPERADO_ALFA_7D.cliquesContato);
    expect(kpis.atual.aberturasFormulario).toBe(ESPERADO_ALFA_7D.aberturasFormulario);
    expect(kpis.atual.formularios).toBe(ESPERADO_ALFA_7D.formularios);
    expect(kpis.atual.leads).toBe(ESPERADO_ALFA_7D.leads);
  });

  it('conta visitantes únicos sobre o período inteiro, não somando os diários', async () => {
    // v1 e v2 aparecem em dois dias cada. Somar únicos por dia daria 8;
    // o correto é 6. Foi exatamente esse erro que o briefing pediu para evitar.
    const p = await periodo7d();
    const kpis = await withAccount(accountId, (db) => getKpis(db, site, { ...p, label: '' }));

    expect(kpis.atual.visitantesUnicos).toBe(6);
    expect(kpis.atual.visitantesUnicos).toBeLessThan(kpis.atual.sessoes);
  });

  it('separa cliques em CTA (com abertura de formulário) de cliques em contato', async () => {
    const p = await periodo7d();
    const kpis = await withAccount(accountId, (db) => getKpis(db, site, { ...p, label: '' }));

    // cliquesCta inclui form_open; cliquesContato e cliquesWhatsapp, não.
    expect(kpis.atual.cliquesCta).toBe(
      kpis.atual.cliquesWhatsapp + kpis.atual.cliquesContato + kpis.atual.aberturasFormulario,
    );
    expect(kpis.atual.cliquesContato).toBe(4); // 2 telefone + 2 e-mail
  });
});

describe('as duas taxas do §9 são contas diferentes', () => {
  it('sessões convertidas e envios por sessão divergem quando uma sessão envia duas vezes', async () => {
    const p = await periodo7d();
    const kpis = await withAccount(accountId, (db) => getKpis(db, site, { ...p, label: '' }));

    // 3 sessões converteram, mas foram 4 envios: uma sessão enviou duas vezes.
    expect(kpis.atual.sessoesConvertidasAbs).toBe(ESPERADO_ALFA_7D.sessoesConvertidasAbs);
    expect(kpis.atual.formularios).toBe(ESPERADO_ALFA_7D.formularios);
    expect(kpis.atual.formularios).toBeGreaterThan(kpis.atual.sessoesConvertidasAbs);

    expect(kpis.taxaSessoesConvertidas).toBeCloseTo(3 / 8, 6);
    expect(kpis.taxaEnviosPorSessao).toBeCloseTo(4 / 8, 6);
    // No protótipo as duas eram sempre iguais, porque o modelo não admitia
    // mais de uma submissão por sessão.
    expect(kpis.taxaSessoesConvertidas).not.toBeCloseTo(kpis.taxaEnviosPorSessao!, 6);
  });

  it('a taxa de sessões convertidas nunca passa de 100%', async () => {
    const p = await periodo7d();
    const kpis = await withAccount(accountId, (db) => getKpis(db, site, { ...p, label: '' }));
    expect(kpis.taxaSessoesConvertidas!).toBeLessThanOrEqual(1);
  });

  it('devolve null em vez de zero quando não há sessões para dividir', async () => {
    const vazio = await withAccount(accountId, async (db) => {
      const s = await db.one<{ id: string; timezone: string }>(
        'select id, timezone from sites where public_id = $1',
        [MASSA.siteSemColeta],
      );
      const p = await resolvePeriod(db, s!.timezone, { key: '7d' });
      return getKpis(db, s!, { ...p, label: '' });
    });

    expect(vazio.atual.sessoes).toBe(0);
    // Zero por cento afirmaria "medimos e ninguém converteu". Não medimos nada.
    expect(vazio.taxaSessoesConvertidas).toBeNull();
    expect(vazio.taxaEnviosPorSessao).toBeNull();
  });
});

describe('coerência entre cartão, gráfico e tabelas', () => {
  it('a soma da série diária de formulários é igual ao cartão de formulários', async () => {
    // Este é o defeito nº 1 do diagnóstico: no protótipo a curva era
    // normalizada contra o eixo de visitas e não tinha relação com o cartão.
    const p = await periodo7d();
    const { kpis, serie } = await withAccount(accountId, async (db) => ({
      kpis: await getKpis(db, site, { ...p, label: '' }),
      serie: await getDailySeries(db, site, { ...p, label: '' }),
    }));

    const somaSerie = serie.reduce((t, d) => t + d.formularios, 0);
    expect(somaSerie).toBe(kpis.atual.formularios);
  });

  it('a soma da série diária de sessões é igual ao cartão de sessões', async () => {
    const p = await periodo7d();
    const { kpis, serie } = await withAccount(accountId, async (db) => ({
      kpis: await getKpis(db, site, { ...p, label: '' }),
      serie: await getDailySeries(db, site, { ...p, label: '' }),
    }));

    expect(serie.reduce((t, d) => t + d.sessoes, 0)).toBe(kpis.atual.sessoes);
  });

  it('a tabela por página e a tabela por botão somam o mesmo total de cliques', async () => {
    // Era a discrepância 169 contra 207 da captura: escopos diferentes sem que
    // a tela dissesse. Agora as duas contam o mesmo conjunto de eventos.
    const p = await periodo7d();
    const { paginas, botoes, kpis } = await withAccount(accountId, async (db) => ({
      paginas: await getByPage(db, site, { ...p, label: '' }),
      botoes: await getByButton(db, site, { ...p, label: '' }),
      kpis: await getKpis(db, site, { ...p, label: '' }),
    }));

    const porPagina = paginas.reduce((t, l) => t + l.cliquesCta, 0);
    const porBotao = botoes.reduce((t, l) => t + l.cliques, 0);

    expect(porPagina).toBe(porBotao);
    expect(porPagina).toBe(kpis.atual.cliquesCta);
  });

  it('a tabela por origem soma o mesmo total de sessões e formulários dos cartões', async () => {
    const p = await periodo7d();
    const { origens, kpis } = await withAccount(accountId, async (db) => ({
      origens: await getBySource(db, site, { ...p, label: '' }),
      kpis: await getKpis(db, site, { ...p, label: '' }),
    }));

    expect(origens.reduce((t, l) => t + l.sessoes, 0)).toBe(kpis.atual.sessoes);
    expect(origens.reduce((t, l) => t + l.formularios, 0)).toBe(kpis.atual.formularios);
  });

  it('a tabela por página soma MAIS sessões que o total, porque uma sessão aparece em várias linhas', async () => {
    // Não é defeito: é a consequência documentada de contar sessões por página.
    const p = await periodo7d();
    const { paginas, kpis } = await withAccount(accountId, async (db) => ({
      paginas: await getByPage(db, site, { ...p, label: '' }),
      kpis: await getKpis(db, site, { ...p, label: '' }),
    }));

    expect(paginas.reduce((t, l) => t + l.sessoes, 0)).toBeGreaterThan(kpis.atual.sessoes);
  });

  it('a série diária cobre todos os dias do período, inclusive os sem movimento', async () => {
    const p = await periodo7d();
    const serie = await withAccount(accountId, (db) => getDailySeries(db, site, { ...p, label: '' }));
    expect(serie).toHaveLength(7);
    expect(serie.some((d) => d.sessoes === 0)).toBe(true);
  });
});

describe('filtros de período e de site', () => {
  it('trocar o período muda os resultados, e não apenas o rótulo', async () => {
    const hoje = await withAccount(accountId, async (db) => {
      const p = await resolvePeriod(db, site.timezone, { key: 'hoje' });
      return getKpis(db, site, { ...p, label: '' });
    });
    const semana = await withAccount(accountId, async (db) => {
      const p = await resolvePeriod(db, site.timezone, { key: '7d' });
      return getKpis(db, site, { ...p, label: '' });
    });

    expect(hoje.atual.sessoes).toBe(1);
    expect(semana.atual.sessoes).toBe(8);
    expect(hoje.atual.sessoes).toBeLessThan(semana.atual.sessoes);
  });

  it('cada site devolve os próprios números', async () => {
    const beta = await withAccount(accountId, async (db) => {
      const s = await db.one<{ id: string; timezone: string }>(
        'select id, timezone from sites where public_id = $1',
        [MASSA.siteBeta],
      );
      const p = await resolvePeriod(db, s!.timezone, { key: '7d' });
      return getKpis(db, s!, { ...p, label: '' });
    });

    // Três sessões desde que b3 entrou na massa — ela envia sem clicar, e é o
    // caso que sustenta a etapa "interagiram" do funil (tests/unit/funil.spec.ts).
    expect(beta.atual.sessoes).toBe(3);
    expect(beta.atual.formularios).toBe(2);
    expect(beta.atual.sessoes).not.toBe(ESPERADO_ALFA_7D.sessoes);
  });
});
