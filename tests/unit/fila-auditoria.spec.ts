import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';
import {
  enfileirar, reivindicarProximo, registrarSucesso, registrarFalha,
  ultimasAnalises, MAX_TENTATIVAS,
} from '@/server/qualidade/auditoria';
import type { ResultadoPageSpeed } from '@/server/qualidade/pagespeed';

/**
 * A fila, contra o banco de verdade.
 *
 * O que estes testes protegem não é o caminho feliz: é o comportamento sob
 * repetição e sob falha, que é onde fila costuma dar errado em silêncio.
 */

let contaId: string;
let siteId: string;
const URL_MONITORADA = 'https://escrita.teste/planos';

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const c = await admin.query<{ id: string }>('select id from accounts where name = $1', [CONTAS.agencia.nome]);
  const s = await admin.query<{ id: string; account_id: string }>(
    'select id, account_id from sites where public_id = $1', [MASSA.siteEscrita],
  );
  contaId = c.rows[0]!.id;
  siteId = s.rows[0]!.id;
  await admin.query(
    `insert into monitored_urls (account_id, site_id, url, prioritaria)
     values ($1, $2, $3, true) on conflict do nothing`,
    [s.rows[0]!.account_id, siteId, URL_MONITORADA],
  );
  await admin.end();
});

beforeEach(async () => {
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  await admin.query('delete from lighthouse_results where site_id = $1', [siteId]);
  await admin.query('delete from audit_jobs where site_id = $1', [siteId]);
  await admin.end();
});

const RESULTADO: ResultadoPageSpeed = {
  urlSolicitada: URL_MONITORADA,
  urlFinal: URL_MONITORADA,
  estrategia: 'mobile',
  versaoLighthouse: '13.4.1',
  notas: { performance: 0.44, acessibilidade: 1, boasPraticas: null, seo: 0.92 },
  metricas: { lcpMs: 3905, fcpMs: 3905, tbtMs: 3192, cls: 0.088, speedIndexMs: 6050, ttiMs: 20104 },
  diagnosticos: [],
  avisos: [],
};

describe('enfileiramento', () => {
  it('clique repetido NÃO duplica tarefa: devolve a mesma', async () => {
    const [a, b, c] = await withAccount(contaId, async (db) => [
      await enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }),
      await enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }),
      await enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }),
    ]);
    expect(a).toMatchObject({ ok: true, jaExistia: false });
    expect(b).toMatchObject({ ok: true, jaExistia: true });
    expect(c).toMatchObject({ ok: true, jaExistia: true });
    if (a.ok && b.ok && c.ok) {
      expect(b.jobId).toBe(a.jobId);
      expect(c.jobId).toBe(a.jobId);
    }
  });

  it('mobile e desktop são tarefas DIFERENTES, não duplicata', async () => {
    const r = await withAccount(contaId, async (db) => ({
      m: await enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }),
      d: await enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'desktop' }),
    }));
    expect(r.m).toMatchObject({ ok: true, jaExistia: false });
    expect(r.d).toMatchObject({ ok: true, jaExistia: false });
    if (r.m.ok && r.d.ok) expect(r.m.jobId).not.toBe(r.d.jobId);
  });

  it('recusa URL que não está cadastrada para monitoramento', async () => {
    const r = await withAccount(contaId, (db) =>
      enfileirar(db, { siteId, url: 'https://escrita.teste/nao-cadastrada', strategy: 'mobile' }),
    );
    expect(r).toMatchObject({ ok: false });
  });

  it('recusa endereço privado antes de qualquer consulta', async () => {
    const r = await withAccount(contaId, (db) =>
      enfileirar(db, { siteId, url: 'http://169.254.169.254/', strategy: 'mobile' }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('processamento', () => {
  it('reivindicar marca como executando e conta a tentativa', async () => {
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }));
    const job = await withAccount(contaId, (db) => reivindicarProximo(db));
    expect(job).toMatchObject({ status: 'executando', tentativas: 1 });
  });

  it('não devolve duas vezes o mesmo job pendente', async () => {
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }));
    const primeiro = await withAccount(contaId, (db) => reivindicarProximo(db));
    const segundo = await withAccount(contaId, (db) => reivindicarProximo(db));
    expect(primeiro).not.toBeNull();
    expect(segundo).toBeNull();
  });

  it('grava o resultado e conclui a tarefa', async () => {
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }));
    const job = (await withAccount(contaId, (db) => reivindicarProximo(db)))!;
    await withAccount(contaId, (db) => registrarSucesso(db, job, RESULTADO, {}));

    const analises = await withAccount(contaId, (db) => ultimasAnalises(db, siteId));
    expect(analises).toHaveLength(1);
    expect(Number(analises[0]!.performance)).toBeCloseTo(0.44, 3);
    // Categoria que veio nula continua nula no banco.
    expect(analises[0]!.boas_praticas).toBeNull();
  });
});

describe('falha externa não destrói a última análise válida', () => {
  it('a análise anterior continua legível depois de um erro', async () => {
    // Primeira execução: sucesso.
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }));
    const ok = (await withAccount(contaId, (db) => reivindicarProximo(db)))!;
    await withAccount(contaId, (db) => registrarSucesso(db, ok, RESULTADO, {}));

    // Segunda: falha até esgotar as tentativas.
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'mobile' }));
    for (let i = 0; i < MAX_TENTATIVAS; i += 1) {
      const job = await withAccount(contaId, (db) => reivindicarProximo(db));
      if (job) await withAccount(contaId, (db) => registrarFalha(db, job, 'API fora do ar'));
    }

    const analises = await withAccount(contaId, (db) => ultimasAnalises(db, siteId));
    expect(analises).toHaveLength(1);
    expect(Number(analises[0]!.performance)).toBeCloseTo(0.44, 3);
  });

  it('falha devolve o job para a fila até esgotar as tentativas', async () => {
    await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy: 'desktop' }));
    const primeira = (await withAccount(contaId, (db) => reivindicarProximo(db)))!;
    await withAccount(contaId, (db) => registrarFalha(db, primeira, 'timeout'));

    // Ainda pendente: dá para reivindicar de novo.
    const segunda = await withAccount(contaId, (db) => reivindicarProximo(db));
    expect(segunda).not.toBeNull();
    expect(segunda!.tentativas).toBe(2);
  });
});

describe('mobile e desktop não se sobrescrevem', () => {
  it('cada dispositivo guarda a própria última análise', async () => {
    for (const strategy of ['mobile', 'desktop'] as const) {
      await withAccount(contaId, (db) => enfileirar(db, { siteId, url: URL_MONITORADA, strategy }));
      const job = (await withAccount(contaId, (db) => reivindicarProximo(db)))!;
      await withAccount(contaId, (db) =>
        registrarSucesso(db, job, { ...RESULTADO, estrategia: strategy, notas: { ...RESULTADO.notas, performance: strategy === 'mobile' ? 0.44 : 0.91 } }, {}),
      );
    }
    const analises = await withAccount(contaId, (db) => ultimasAnalises(db, siteId));
    expect(analises).toHaveLength(2);
    const porDispositivo = Object.fromEntries(analises.map((a) => [a.strategy, Number(a.performance)]));
    expect(porDispositivo.mobile).toBeCloseTo(0.44, 2);
    expect(porDispositivo.desktop).toBeCloseTo(0.91, 2);
  });
});

describe('a porteira do cron enxerga o mesmo que o insert enfileiraria', () => {
  /*
   * `/api/auditorias/agendar` funciona em dois passos: pergunta a
   * `app.contas_com_auditoria_vencida` QUAIS CONTAS têm trabalho e, dentro de
   * uma transação por conta, roda o `insert` que enfileira.
   *
   * O `insert` decide por (url, ESTRATÉGIA). A função não olhava estratégia
   * nenhuma: bastava UMA análise da URL em sete dias, de qualquer dispositivo,
   * para ela dar a conta como em dia. A conta não entrava na lista, a transação
   * não abria, e a análise que faltava nunca era enfileirada.
   *
   * Medido no banco de PRODUÇÃO em 16/09/2026: uma página prioritária analisada
   * no celular no dia anterior e NUNCA no computador, com a porteira
   * respondendo zero conta vencida. É o no-op que se declara bem-sucedido, de
   * novo — e o relatório fica com metade das medições sem dizer que falta.
   */

  async function porteira(dias: number): Promise<string[]> {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<{ conta: string }>(
      'select app.contas_com_auditoria_vencida($1) as conta',
      [dias],
    );
    await admin.end();
    return rows.map((r) => r.conta);
  }

  /** O que o `insert` do endpoint enfileiraria agora, nas mesmas condições. */
  async function oInsertEnfileiraria(dias: number): Promise<string[]> {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<{ strategy: string }>(
      `select d.strategy
         from monitored_urls m
         cross join (values ('mobile'), ('desktop')) as d(strategy)
        where m.prioritaria and m.site_id = $1
          and not exists (
            select 1 from lighthouse_results r
             where r.site_id = m.site_id and r.url_solicitada = m.url
               and r.strategy = d.strategy
               and r.medido_em > now() - make_interval(days => $2::int)
          )
        order by d.strategy`,
      [siteId, dias],
    );
    await admin.end();
    return rows.map((r) => r.strategy);
  }

  async function analisar(strategy: 'mobile' | 'desktop', quandoAtras: string) {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    await admin.query(
      `insert into lighthouse_results
         (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       values ($1,$2,$3,$3,$4, 0.80, now() - $5::interval)`,
      [contaId, siteId, URL_MONITORADA, strategy, quandoAtras],
    );
    await admin.end();
  }

  it('análise de celular recente NÃO esconde a de computador que falta', async () => {
    // É o caso exato de produção, e o que a função antiga deixava passar.
    await analisar('mobile', '1 day');

    expect(await oInsertEnfileiraria(7)).toEqual(['desktop']);
    expect(
      await porteira(7),
      'há trabalho (desktop), então a conta precisa entrar na lista',
    ).toContain(contaId);
  });

  it('com os dois dispositivos em dia, a conta sai da lista', async () => {
    await analisar('mobile', '1 day');
    await analisar('desktop', '2 days');

    expect(await oInsertEnfileiraria(7)).toEqual([]);
    expect(await porteira(7)).not.toContain(contaId);
  });

  it('sem análise nenhuma, a porteira vê a conta e o insert quer os dois', async () => {
    expect(await oInsertEnfileiraria(7)).toEqual(['desktop', 'mobile']);
    expect(await porteira(7)).toContain(contaId);
  });

  it('análise velha nos dois volta a abrir a conta', async () => {
    await analisar('mobile', '30 days');
    await analisar('desktop', '30 days');

    expect(await oInsertEnfileiraria(7)).toEqual(['desktop', 'mobile']);
    expect(await porteira(7)).toContain(contaId);
  });
});
