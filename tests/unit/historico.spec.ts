import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { listarHistorico } from '@/server/services/historico';
import { direcao, tendencia, type EventoDeHistorico } from '@/lib/historico';
import { prepararBancoDeTeste, CONTAS } from '../../scripts/test-db';

let agencia: string;
let rival: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const contas = await admin.query<{ id: string; name: string }>('select id, name from accounts');
  agencia = contas.rows.find((c) => c.name === CONTAS.agencia.nome)!.id;
  rival = contas.rows.find((c) => c.name === CONTAS.rival.nome)!.id;
  await admin.end();
});

const evento = (p: Partial<EventoDeHistorico>): EventoDeHistorico => ({
  quando: new Date(), tipo: 'analise', siteId: 'a', site: 'a', cliente: 'c', url: 'https://a/', dispositivo: 'mobile',
  titulo: 'x', detalhe: null, nota: null, notaAnterior: null, ...p,
});

describe('histórico derivado', () => {
  it('é derivado das tabelas existentes: todo site cadastrado aparece, do mais recente ao mais antigo', async () => {
    const eventos = await withAccount(agencia, (db) => listarHistorico(db));
    const cadastros = eventos.filter((e) => e.tipo === 'site_cadastrado');
    expect(cadastros.map((e) => e.titulo).sort()).toEqual(['alfa.teste', 'beta.teste', 'escrita.teste', 'novo.teste']);
    for (let i = 1; i < eventos.length; i += 1) {
      expect(eventos[i - 1]!.quando.getTime()).toBeGreaterThanOrEqual(eventos[i]!.quando.getTime());
    }
  });

  it('a nota anterior é a do MESMO par (URL, dispositivo); a primeira medição de um par não tem anterior', async () => {
    const eventos = await withAccount(agencia, (db) => listarHistorico(db, { limite: 500 }));
    const medicoes = eventos.filter((e) => e.tipo === 'analise');
    expect(medicoes.length).toBeGreaterThan(0);
    // Agrupa por par e confere: a mais antiga de cada par não tem anterior;
    // as demais têm anterior igual à nota da medição imediatamente anterior.
    const pares = new Map<string, EventoDeHistorico[]>();
    for (const m of medicoes) {
      const k = `${m.siteId}|${m.url}|${m.dispositivo}`;
      pares.set(k, [...(pares.get(k) ?? []), m]);
    }
    for (const lista of pares.values()) {
      const cronologica = [...lista].sort((a, b) => a.quando.getTime() - b.quando.getTime());
      expect(cronologica[0]!.notaAnterior).toBeNull();
      for (let i = 1; i < cronologica.length; i += 1) {
        expect(cronologica[i]!.notaAnterior).toBe(cronologica[i - 1]!.nota);
      }
    }
  });

  it('o recorte por site é respeitado, e a conta rival não vê nada da agência', async () => {
    const todos = await withAccount(agencia, (db) => listarHistorico(db, { limite: 500 }));
    const umSite = todos[0]!.siteId;
    const recortado = await withAccount(agencia, (db) => listarHistorico(db, { siteIds: [umSite], limite: 500 }));
    expect(recortado.length).toBeGreaterThan(0);
    expect(recortado.every((e) => e.siteId === umSite)).toBe(true);

    const doRival = await withAccount(rival, (db) => listarHistorico(db, { siteIds: [umSite] }));
    expect(doRival).toEqual([]);
  });
});

describe('direção e tendência', () => {
  it('um ponto não tem direção; com anterior, compara', () => {
    expect(direcao(evento({ nota: 80 }))).toBeNull();
    expect(direcao(evento({ nota: 80, notaAnterior: 70 }))).toBe('melhora');
    expect(direcao(evento({ nota: 60, notaAnterior: 70 }))).toBe('piora');
    expect(direcao(evento({ nota: 70, notaAnterior: 70 }))).toBe('igual');
  });
  it('a tendência conta direções, só de medições', () => {
    const t = tendencia([
      evento({ nota: 80, notaAnterior: 70 }),
      evento({ nota: 50, notaAnterior: 70 }),
      evento({ nota: 90 }),
      evento({ tipo: 'tarefa_criada' }),
    ]);
    expect(t).toEqual({ melhoras: 1, pioras: 1, medicoes: 3 });
  });
});
