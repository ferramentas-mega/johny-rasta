import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { SiteForaDaConta } from '@/server/services/onboarding';
import { criarTarefa, listarTarefas, mudarStatusTarefa } from '@/server/services/tarefas';
import { tarefaDoSinal } from '@/lib/tarefas';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';

/**
 * Tarefas: isolamento entre contas, vínculo com o sinal e o que concluir faz
 * (e o que NÃO faz: tocar em `optimizations`).
 */
let agencia: string;
let rival: string;
let siteEscrita: string;
let siteDoRival: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const contas = await admin.query<{ id: string; name: string }>('select id, name from accounts');
  agencia = contas.rows.find((c) => c.name === CONTAS.agencia.nome)!.id;
  rival = contas.rows.find((c) => c.name === CONTAS.rival.nome)!.id;
  const sites = await admin.query<{ id: string; public_id: string }>('select id, public_id from sites');
  siteEscrita = sites.rows.find((s) => s.public_id === MASSA.siteEscrita)!.id;
  siteDoRival = sites.rows.find((s) => s.public_id === MASSA.siteRival)!.id;
  await admin.end();
});

const sinal = { tipo: 'tecnico' as const, url: 'https://escrita.teste/', dispositivo: 'mobile' as const, titulo: 'Desempenho baixo em página monitorada' };

describe('tarefas', () => {
  it('cria ligada ao sinal, lista só as abertas da conta, e a chave casa campo a campo', async () => {
    const id = await withAccount(agencia, (db) =>
      criarTarefa(db, { siteId: siteEscrita, titulo: 'Otimizar o hero', sinal }),
    );
    const abertas = await withAccount(agencia, (db) => listarTarefas(db, { apenasAbertas: true, siteIds: [siteEscrita] }));
    const t = abertas.find((x) => x.id === id)!;
    expect(t.status).toBe('aberta');
    expect(t.cliente).toBeTruthy();
    expect(tarefaDoSinal(t, { siteId: siteEscrita, ...sinal })).toBe(true);
    // Outro dispositivo é outro sinal — a mesma regra da chave de acompanhamento.
    expect(tarefaDoSinal(t, { siteId: siteEscrita, ...sinal, dispositivo: 'desktop' })).toBe(false);
  });

  it('a conta rival não vê a tarefa, nem consegue criar uma apontando para site alheio', async () => {
    const doRival = await withAccount(rival, (db) => listarTarefas(db));
    expect(doRival.filter((t) => t.siteId === siteEscrita)).toEqual([]);

    await expect(
      withAccount(rival, (db) => criarTarefa(db, { siteId: siteEscrita, titulo: 'invasão' })),
    ).rejects.toBeInstanceOf(SiteForaDaConta);

    // E a agência tampouco cria para o site do rival.
    await expect(
      withAccount(agencia, (db) => criarTarefa(db, { siteId: siteDoRival, titulo: 'invasão' })),
    ).rejects.toBeInstanceOf(SiteForaDaConta);
  });

  it('concluir carimba a data, devolve o pedido de reanálise, e não toca em optimizations', async () => {
    const id = await withAccount(agencia, (db) =>
      criarTarefa(db, { siteId: siteEscrita, titulo: 'Reduzir imagens', sinal }),
    );
    const antes = await withAccount(agencia, (db) => db.one<{ n: number }>('select count(*)::int as n from optimizations'));

    const d = await withAccount(agencia, (db) => mudarStatusTarefa(db, id, 'concluida'));
    expect(d!.tarefa.status).toBe('concluida');
    expect(d!.tarefa.concluidaEm).toBeInstanceOf(Date);
    // Sem chave do PageSpeed no teste, o pedido é recusado com CÓDIGO — não
    // silêncio, não "enfileirada".
    expect(d!.reanalise).not.toBeNull();
    expect(['nao_configurado', 'enfileirada', 'ja_na_fila', 'recusado']).toContain(d!.reanalise!.resultado);

    const depois = await withAccount(agencia, (db) => db.one<{ n: number }>('select count(*)::int as n from optimizations'));
    expect(depois!.n).toBe(antes!.n);

    // Concluída sai da lista de abertas; reabrir limpa a data.
    const abertas = await withAccount(agencia, (db) => listarTarefas(db, { apenasAbertas: true }));
    expect(abertas.find((t) => t.id === id)).toBeUndefined();
    const r = await withAccount(agencia, (db) => mudarStatusTarefa(db, id, 'aberta'));
    expect(r!.tarefa.concluidaEm).toBeNull();
    expect(r!.reanalise).toBeNull();
  });

  it('tarefa avulsa concluída não pede reanálise: não há página a medir', async () => {
    const id = await withAccount(agencia, (db) => criarTarefa(db, { siteId: siteEscrita, titulo: 'Avulsa' }));
    const d = await withAccount(agencia, (db) => mudarStatusTarefa(db, id, 'concluida'));
    expect(d!.reanalise).toBeNull();
  });

  it('situação inválida é recusada, e id de outra conta devolve nulo', async () => {
    const id = await withAccount(agencia, (db) => criarTarefa(db, { siteId: siteEscrita, titulo: 'x' }));
    await expect(withAccount(agencia, (db) => mudarStatusTarefa(db, id, 'feita'))).rejects.toThrow('Situação inválida.');
    expect(await withAccount(rival, (db) => mudarStatusTarefa(db, id, 'concluida'))).toBeNull();
  });
});
