import { describe, it, expect, afterAll, beforeAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import {
  fecharPorVerificacao,
  listarOtimizacoes,
  marcarOtimizacao,
  resolvidasPorVerificacao,
} from '@/server/qualidade/otimizacoes';
import { enfileirarReanalise } from '@/server/qualidade/auditoria';
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


/** Uma nota baixa numa URL monitorada: o sinal técnico mais simples. */
async function comSinalTecnico(strategy: 'mobile' | 'desktop' = 'mobile') {
  await inserir(
    `insert into monitored_urls (account_id, site_id, url, prioritaria)
     values ($1,$2,'https://escrita.teste/lenta', false)
     on conflict (site_id, url) do nothing`,
    [contaId, siteEscrita],
  );
  await inserir(
    `insert into lighthouse_results
       (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
     values ($1,$2,'https://escrita.teste/lenta','https://escrita.teste/lenta',$3, 0.30, now())`,
    [contaId, siteEscrita, strategy],
  );
  const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
  const item = lista.find(
    (o) => o.siteId === siteEscrita && o.tipo === 'tecnico' && o.dispositivo === strategy,
  );
  expect(item, 'o sinal técnico precisa aparecer').toBeTruthy();
  return item!;
}

describe('acompanhamento: a marcação acrescenta situação, e não esconde o sinal', () => {
  /*
   * `optimizations` existia inteira — status, check de cinco valores,
   * proxima_acao — e **nada no projeto escrevia nela**. A coluna "Situação"
   * mostrava "Pendente" para sempre, e os outros quatro status eram
   * inalcançáveis. Estes testes travam o comportamento que faltava, e sobretudo
   * o limite dele.
   */

  it('sem marcação, a situação é pendente', async () => {
    expect((await comSinalTecnico()).status).toBe('pendente');
  });

  it('marcar muda a situação do item, sem duplicá-lo', async () => {
    const item = await comSinalTecnico();
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        { siteId: item.siteId, tipo: item.tipo, url: item.url, dispositivo: item.dispositivo, titulo: item.titulo },
        'em_andamento',
        item.proximaAcao,
        item.evidencia,
      ),
    );

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const iguais = lista.filter((o) => o.siteId === siteEscrita && o.tipo === 'tecnico');
    // O ponto: `left join`, e não `union`. Com union o item apareceria duas
    // vezes assim que alguém marcasse — uma pela tabela, outra pelo sinal.
    expect(iguais).toHaveLength(1);
    expect(iguais[0]!.status).toBe('em_andamento');
  });

  it('marcar DUAS vezes não cria duas linhas', async () => {
    const item = await comSinalTecnico();
    const chave = { siteId: item.siteId, tipo: item.tipo, url: item.url, dispositivo: item.dispositivo, titulo: item.titulo };
    await withAccount(contaId, (db) => marcarOtimizacao(db, chave, 'em_andamento', '', 'Nota 30/100 no celular'));
    await withAccount(contaId, (db) => marcarOtimizacao(db, chave, 'aguardando_nova_analise', '', 'Nota 30/100 no celular'));

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    expect(lista.filter((o) => o.siteId === siteEscrita && o.tipo === 'tecnico')).toHaveLength(1);
    expect(lista.find((o) => o.siteId === siteEscrita)!.status).toBe('aguardando_nova_analise');
  });

  it('marcar RESOLVIDA não tira o item da lista enquanto o sinal existir', async () => {
    // É a promessa central. Sumir por decreto seria o mesmo `configurado: true`
    // que o projeto recusa: estado é derivado, não declarado. A nota continua
    // 0,30 — o problema continua, e a tela continua dizendo isso.
    const item = await comSinalTecnico();
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        { siteId: item.siteId, tipo: item.tipo, url: item.url, dispositivo: item.dispositivo, titulo: item.titulo },
        'resolvida_manual',
        '',
        'Nota 30/100 no celular',
      ),
    );

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const ainda = lista.find((o) => o.siteId === siteEscrita && o.tipo === 'tecnico');
    expect(ainda, 'o sinal continua de pé, então o item continua na lista').toBeTruthy();
    expect(ainda!.status).toBe('resolvida_manual');
  });

  it('quando o sinal some, o item sai — mesmo com a marcação guardada', async () => {
    const item = await comSinalTecnico();
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        { siteId: item.siteId, tipo: item.tipo, url: item.url, dispositivo: item.dispositivo, titulo: item.titulo },
        'em_andamento',
        '',
        'Nota 30/100 no celular',
      ),
    );

    // A próxima medição passa: o sinal deixa de ser detectado.
    await inserir(
      `insert into lighthouse_results
         (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       values ($1,$2,'https://escrita.teste/lenta','https://escrita.teste/lenta','mobile', 0.95, now() + interval '1 minute')`,
      [contaId, siteEscrita],
    );

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    // A linha de acompanhamento continua no banco, mas não cria item: a lista
    // mostra SINAIS. A ausência é a prova de que acabou.
    expect(lista.find((o) => o.siteId === siteEscrita && o.tipo === 'tecnico')).toBeUndefined();
  });

  it('não marca sinal de site de outra conta', async () => {
    // A RLS não barra isto sozinha: o `account_id` gravado é o de quem escreve,
    // então a política aprova a linha. Com o índice único por sinal, passar
    // trancaria o dono legítimo contra um registro que ele nem enxerga.
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const rival = (
      await admin.query<{ id: string }>('select id from sites where public_id = $1', [MASSA.siteRival])
    ).rows[0]!.id;
    await admin.end();

    await expect(
      withAccount(contaId, (db) =>
        marcarOtimizacao(
          db,
          { siteId: rival, tipo: 'tecnico', url: null, dispositivo: null, titulo: 'Invasão' },
          'em_andamento',
          '',
          '',
        ),
      ),
    ).rejects.toThrow(/não encontrado/i);
  });
});

describe('fechamento por verificação: quem conclui é a medição', () => {
  /*
   * `resolvida_por_verificacao` era um status que ninguém alcançava: quando o
   * sinal sumia, a linha de acompanhamento só parava de aparecer, e ficava no
   * banco para sempre com o último status que o operador tinha posto. Não
   * sobrava registro de QUE a medição resolveu, nem QUANDO, nem PARTINDO DE
   * QUANTO.
   *
   * O que estes testes travam é o limite disso: fechar é consequência de uma
   * medição nova, nunca de uma declaração — a mesma regra da verificação de
   * instalação.
   */

  type Acompanhamento = {
    status: string;
    evidencia: { texto?: string; notaDepois?: number | null; resolvidoEm?: string; resolvidoPor?: string };
  };

  async function lerAcompanhamento(siteId: string, tipo = 'tecnico'): Promise<Acompanhamento[]> {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<Acompanhamento>(
      'select status, evidencia from optimizations where site_id = $1 and tipo = $2',
      [siteId, tipo],
    );
    await admin.end();
    return rows;
  }

  /** A próxima análise passa: a mesma URL, medida depois, com nota boa. */
  async function medicaoBoa() {
    await inserir(
      `insert into lighthouse_results
         (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       values ($1,$2,'https://escrita.teste/lenta','https://escrita.teste/lenta','mobile', 0.95, now() + interval '1 minute')`,
      [contaId, siteEscrita],
    );
  }

  async function marcado(status: Parameters<typeof marcarOtimizacao>[2] = 'em_andamento') {
    const item = await comSinalTecnico();
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        { siteId: item.siteId, tipo: item.tipo, url: item.url, dispositivo: item.dispositivo, titulo: item.titulo },
        status,
        item.proximaAcao,
        item.evidencia,
      ),
    );
    return item;
  }

  it('o sinal some e o acompanhamento guarda as DUAS medições', async () => {
    const item = await marcado();
    expect(item.evidencia).toContain('30');

    await medicaoBoa();
    const fechadas = await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita));
    expect(fechadas).toBe(1);

    const [linha] = await lerAcompanhamento(siteEscrita);
    expect(linha!.status).toBe('resolvida_por_verificacao');
    // O "antes" é o texto guardado na marcação — depois não dá para lê-lo, porque
    // o que causou o sinal já não existe.
    expect(linha!.evidencia.texto).toContain('30');
    // O "depois" é a medição que fechou.
    expect(linha!.evidencia.notaDepois).toBe(95);
    expect(linha!.evidencia.resolvidoEm).toBeTruthy();
  });

  it('enquanto o sinal existir, NADA fecha — nem marcado como resolvido', async () => {
    // O ponto central: a marcação do operador não conclui nada. A nota continua
    // 0,30, o problema continua, e o acompanhamento continua aberto.
    await marcado('resolvida_manual');

    const fechadas = await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita));
    expect(fechadas).toBe(0);

    const [linha] = await lerAcompanhamento(siteEscrita);
    expect(linha!.status).toBe('resolvida_manual');
    expect(linha!.evidencia.resolvidoEm).toBeUndefined();
  });

  it('fechar duas vezes fecha uma vez: a segunda passagem não acha o que fechar', async () => {
    // `registrarSucesso` chama isto a cada análise gravada. Sem a guarda de
    // status, toda análise seguinte reescreveria `resolvidoEm` — e a data de
    // quando o problema acabou viraria a data da última medição qualquer.
    await marcado();
    await medicaoBoa();

    expect(await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita))).toBe(1);
    const [primeira] = await lerAcompanhamento(siteEscrita);

    expect(await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita))).toBe(0);
    const [segunda] = await lerAcompanhamento(siteEscrita);

    expect(segunda!.evidencia.resolvidoEm).toBe(primeira!.evidencia.resolvidoEm);
  });

  it('fecha só o site medido: a análise de um site não conclui nada sobre outro', async () => {
    await marcado();
    await medicaoBoa();

    // A medição foi do site de escrita; o fechamento roda no escopo do site que
    // ACABOU de ser medido. Varrer a conta inteira faria uma análise de um site
    // encerrar acompanhamento de outro, sem medição nenhuma por trás.
    expect(await withAccount(contaId, (db) => fecharPorVerificacao(db, siteSemColeta))).toBe(0);

    const [linha] = await lerAcompanhamento(siteEscrita);
    expect(linha!.status).toBe('em_andamento');
  });

  it('sinal sem URL fecha com nota "depois" nula — ausência de número não é zero', async () => {
    // O sinal de coleta vale para o site inteiro e não tem URL, então não há
    // nota a registrar. Nulo é a resposta honesta; zero afirmaria uma medição
    // que não houve.
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        {
          siteId: siteEscrita,
          tipo: 'coleta',
          url: null,
          dispositivo: null,
          titulo: 'Sem eventos recentes num site que coletava',
        },
        'em_andamento',
        'Conferir se o script continua instalado',
        'Último evento em 01/01/2026 · 400 eventos no histórico',
      ),
    );

    expect(await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita))).toBe(1);

    const [linha] = await lerAcompanhamento(siteEscrita, 'coleta');
    expect(linha!.status).toBe('resolvida_por_verificacao');
    expect(linha!.evidencia.notaDepois).toBeNull();
    expect(linha!.evidencia.texto).toContain('400 eventos');
  });

  it('o que a medição fechou fica legível na tela, com o par de números', async () => {
    await marcado();
    await medicaoBoa();
    await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita));

    const resolvidas = await withAccount(contaId, (db) => resolvidasPorVerificacao(db, 30));
    const nossa = resolvidas.find((r) => r.url?.includes('/lenta'));
    expect(nossa, 'a resolução precisa aparecer na listagem').toBeTruthy();
    expect(nossa!.antes).toContain('30');
    expect(nossa!.notaDepois).toBe(95);
  });

  it('a listagem de resolvidas não atravessa contas', async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const rival = (
      await admin.query<{ id: string }>('select id from sites where public_id = $1', [MASSA.siteRival])
    ).rows[0]!.id;
    await admin.query(
      `insert into optimizations (account_id, site_id, url, tipo, titulo, prioridade, status, proxima_acao, evidencia)
       select account_id, id, 'https://rival.teste/x', 'tecnico', 'Segredo alheio', 1,
              'resolvida_por_verificacao', '',
              jsonb_build_object('texto','Nota 10/100', 'resolvidoEm', to_jsonb(now()), 'notaDepois', 99)
         from sites where id = $1`,
      [rival],
    );
    await admin.end();

    const resolvidas = await withAccount(contaId, (db) => resolvidasPorVerificacao(db, 30));
    expect(resolvidas.filter((r) => r.titulo === 'Segredo alheio')).toHaveLength(0);

    const limpeza = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await limpeza.connect();
    await limpeza.query('delete from optimizations where site_id = $1', [rival]);
    await limpeza.end();
  });
});

describe('o sinal técnico pertence a uma URL E a um dispositivo', () => {
  /*
   * A chave do acompanhamento era (site, tipo, url, título), e o título do sinal
   * técnico é o MESMO nos dois dispositivos. Então celular e computador da mesma
   * página — duas linhas na lista, como deve ser — casavam com uma linha só de
   * acompanhamento. Marcar um mudava o outro, e o fechamento podia creditar a um
   * a melhora medida no outro.
   *
   * O CLAUDE.md já dizia a regra: "Nota técnica pertence a uma URL e a um
   * dispositivo." Ela valia na tela de qualidade e não valia nesta chave.
   */

  async function lerStatus(dispositivo: string) {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<{ status: string; evidencia: { notaDepois?: number | null } }>(
      'select status, evidencia from optimizations where site_id = $1 and dispositivo = $2',
      [siteEscrita, dispositivo],
    );
    await admin.end();
    return rows[0] ?? null;
  }

  it('a mesma página lenta nos dois dispositivos são DOIS itens', async () => {
    await comSinalTecnico('mobile');
    await comSinalTecnico('desktop');

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const tecnicos = lista.filter((o) => o.siteId === siteEscrita && o.tipo === 'tecnico');
    expect(tecnicos).toHaveLength(2);
    expect(tecnicos.map((o) => o.dispositivo).sort()).toEqual(['desktop', 'mobile']);
  });

  it('marcar o item do celular não mexe no do computador', async () => {
    const celular = await comSinalTecnico('mobile');
    await comSinalTecnico('desktop');

    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        {
          siteId: celular.siteId,
          tipo: celular.tipo,
          url: celular.url,
          dispositivo: celular.dispositivo,
          titulo: celular.titulo,
        },
        'em_andamento',
        '',
        celular.evidencia,
      ),
    );

    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const porDispositivo = Object.fromEntries(
      lista
        .filter((o) => o.siteId === siteEscrita && o.tipo === 'tecnico')
        .map((o) => [o.dispositivo, o.status]),
    );
    expect(porDispositivo.mobile).toBe('em_andamento');
    // Sem dispositivo na chave, este seria 'em_andamento' também — e ninguém
    // teria pedido isso.
    expect(porDispositivo.desktop).toBe('pendente');
  });

  it('o fechamento grava a nota do dispositivo certo, não a última qualquer', async () => {
    const celular = await comSinalTecnico('mobile');
    await withAccount(contaId, (db) =>
      marcarOtimizacao(
        db,
        {
          siteId: celular.siteId,
          tipo: celular.tipo,
          url: celular.url,
          dispositivo: celular.dispositivo,
          titulo: celular.titulo,
        },
        'em_andamento',
        '',
        celular.evidencia,
      ),
    );

    // O celular melhora...
    await inserir(
      `insert into lighthouse_results
         (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       values ($1,$2,'https://escrita.teste/lenta','https://escrita.teste/lenta','mobile', 0.95, now() + interval '1 minute')`,
      [contaId, siteEscrita],
    );
    // ...e DEPOIS dele mede-se o computador, que continua ruim. Sem o filtro de
    // dispositivo, esta é a medição mais recente da URL e viraria o "depois" do
    // item do celular: 33 em vez de 95.
    await inserir(
      `insert into lighthouse_results
         (account_id, site_id, url_solicitada, url_final, strategy, performance, medido_em)
       values ($1,$2,'https://escrita.teste/lenta','https://escrita.teste/lenta','desktop', 0.33, now() + interval '2 minutes')`,
      [contaId, siteEscrita],
    );

    expect(await withAccount(contaId, (db) => fecharPorVerificacao(db, siteEscrita))).toBe(1);

    const linha = await lerStatus('mobile');
    expect(linha!.status).toBe('resolvida_por_verificacao');
    expect(linha!.evidencia.notaDepois).toBe(95);
  });
});

describe('"aguardando nova análise" enfileira mesmo', () => {
  /*
   * Era o único status que afirmava um ACONTECIMENTO FUTURO sem nada por trás.
   * O agendador diário só olha URL prioritária: uma página comum não era
   * reanalisada por ninguém, e o item ficava esperando para sempre um evento
   * que nunca vinha.
   */

  const CHAVE_FALSA = process.env.PAGESPEED_API_KEY;
  beforeEach(() => {
    process.env.PAGESPEED_API_KEY = 'chave-de-teste';
  });
  afterAll(() => {
    if (CHAVE_FALSA === undefined) delete process.env.PAGESPEED_API_KEY;
    else process.env.PAGESPEED_API_KEY = CHAVE_FALSA;
  });

  async function fila() {
    const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
    await admin.connect();
    const { rows } = await admin.query<{ url: string; strategy: string; status: string }>(
      'select url, strategy, status from audit_jobs where site_id = $1 order by strategy',
      [siteEscrita],
    );
    await admin.end();
    return rows;
  }

  function chave(item: Awaited<ReturnType<typeof comSinalTecnico>>) {
    return {
      siteId: item.siteId,
      tipo: item.tipo,
      url: item.url,
      dispositivo: item.dispositivo,
      titulo: item.titulo,
    };
  }

  it('o sinal do celular enfileira UMA análise, e só a do celular', async () => {
    const item = await comSinalTecnico('mobile');

    const pedido = await withAccount(contaId, (db) => enfileirarReanalise(db, chave(item)));
    expect(pedido.resultado).toBe('enfileirada');

    const jobs = await fila();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.strategy).toBe('mobile');
    expect(jobs[0]!.url).toBe('https://escrita.teste/lenta');
  });

  it('pedir duas vezes não vira duas tarefas, e a resposta diz isso', async () => {
    const item = await comSinalTecnico('mobile');

    await withAccount(contaId, (db) => enfileirarReanalise(db, chave(item)));
    const segundo = await withAccount(contaId, (db) => enfileirarReanalise(db, chave(item)));

    expect(segundo.resultado).toBe('ja_na_fila');
    expect(await fila()).toHaveLength(1);
  });

  it('sinal sem dispositivo pede os dois — é a ausência de análise que o define', async () => {
    await inserir(
      `insert into monitored_urls (account_id, site_id, url, prioritaria)
       values ($1,$2,'https://escrita.teste/planos', true)`,
      [contaId, siteEscrita],
    );
    const lista = await withAccount(contaId, (db) => listarOtimizacoes(db));
    const item = lista.find((o) => o.tipo === 'atualizacao' && o.url?.includes('/planos'));
    expect(item!.dispositivo).toBeNull();

    const pedido = await withAccount(contaId, (db) =>
      enfileirarReanalise(db, {
        siteId: item!.siteId, tipo: item!.tipo, url: item!.url,
        dispositivo: item!.dispositivo, titulo: item!.titulo,
      }),
    );
    expect(pedido.resultado).toBe('enfileirada');
    expect((await fila()).map((j) => j.strategy)).toEqual(['desktop', 'mobile']);
  });

  it('sinal sem página NÃO enfileira nada — e diz o motivo', async () => {
    // Enfileirar aqui gastaria a vaga diária do plano com uma medição que não
    // responde à pergunta, e devolveria uma confirmação falsa.
    const pedido = await withAccount(contaId, (db) =>
      enfileirarReanalise(db, {
        siteId: siteEscrita, tipo: 'coleta', url: null, dispositivo: null,
        titulo: 'Sem eventos recentes num site que coletava',
      }),
    );
    expect(pedido.resultado).toBe('sem_pagina');
    expect(await fila()).toHaveLength(0);
  });

  it('URL que saiu do monitoramento é recusada, com o motivo — não silenciosamente', async () => {
    const item = await comSinalTecnico('mobile');
    await inserir('delete from monitored_urls where site_id = $1', [siteEscrita]);

    const pedido = await withAccount(contaId, (db) => enfileirarReanalise(db, chave(item)));
    expect(pedido.resultado).toBe('recusado');
    expect(pedido.resultado === 'recusado' && pedido.motivo).toMatch(/não está cadastrada/i);
    expect(await fila()).toHaveLength(0);
  });

  it('sem integração configurada, avisa em vez de enfileirar tarefa que ninguém processa', async () => {
    const item = await comSinalTecnico('mobile');
    delete process.env.PAGESPEED_API_KEY;

    const pedido = await withAccount(contaId, (db) => enfileirarReanalise(db, chave(item)));
    expect(pedido.resultado).toBe('nao_configurado');
    expect(await fila()).toHaveLength(0);
  });
});
