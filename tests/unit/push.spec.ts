import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { salvarInscricao, listarDispositivos, removerInscricao, notificarAvisosCriticos } from '@/server/services/push';
import { novosParaEnviar, mensagensParaPush } from '@/lib/push';
import type { Aviso } from '@/lib/avisos';
import { prepararBancoDeTeste, CONTAS } from '../../scripts/test-db';

/**
 * Push: inscrição por usuário e dispositivo, isolamento, deduplicação por
 * mudança de estado. O ENVIO de verdade não roda aqui (não há chave VAPID no
 * teste): o que se prova é que sem chave o serviço é um no-op que devolve
 * zero, nunca um erro escondido nem um "enviado" falso.
 */
let agencia: string;
let rival: string;
let usuarioA: string;
let usuarioB: string;
let usuarioRival: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const contas = await admin.query<{ id: string; name: string }>('select id, name from accounts');
  agencia = contas.rows.find((c) => c.name === CONTAS.agencia.nome)!.id;
  rival = contas.rows.find((c) => c.name === CONTAS.rival.nome)!.id;
  const usuarios = await admin.query<{ id: string; account_id: string }>('select id, account_id from users order by created_at');
  usuarioA = usuarios.rows.find((u) => u.account_id === agencia)!.id;
  // Um segundo usuário na mesma conta, para provar que dispositivos não se misturam.
  const b = await admin.query<{ id: string }>(
    `insert into users (account_id, email, password_hash, name) values ($1, 'segundo-push@agencia.teste', 'x', 'Segundo') returning id`,
    [agencia],
  );
  usuarioB = b.rows[0]!.id;
  usuarioRival = usuarios.rows.find((u) => u.account_id === rival)!.id;
  await admin.end();
});

const inscricao = (n: string) => ({ endpoint: `https://push.teste/${n}`, keys: { p256dh: 'p256dh-chave-publica-' + n, auth: 'auth-chave-' + n } });

describe('inscrições', () => {
  it('um usuário tem vários dispositivos; outro usuário da MESMA conta não os vê', async () => {
    await withAccount(agencia, async (db) => {
      await salvarInscricao(db, usuarioA, inscricao('pc'), 'Chrome PC');
      await salvarInscricao(db, usuarioA, inscricao('celular'), 'Chrome Android');
      await salvarInscricao(db, usuarioB, inscricao('b1'), 'Edge');
    });
    const deA = await withAccount(agencia, (db) => listarDispositivos(db, usuarioA));
    const deB = await withAccount(agencia, (db) => listarDispositivos(db, usuarioB));
    expect(deA.map((d) => d.userAgent).sort()).toEqual(['Chrome Android', 'Chrome PC']);
    expect(deB.map((d) => d.userAgent)).toEqual(['Edge']);
  });

  it('o mesmo endpoint inscrito de novo é renovado, não duplicado', async () => {
    await withAccount(agencia, (db) => salvarInscricao(db, usuarioA, { ...inscricao('pc'), keys: { p256dh: 'p256dh-nova-chave-pc', auth: 'auth-nova-pc' } }, 'Chrome PC v2'));
    const deA = await withAccount(agencia, (db) => listarDispositivos(db, usuarioA));
    expect(deA.filter((d) => d.endpoint.endsWith('/pc'))).toHaveLength(1);
    expect(deA.find((d) => d.endpoint.endsWith('/pc'))!.userAgent).toBe('Chrome PC v2');
  });

  it('remover só remove o próprio: outro usuário não consegue tirar o dispositivo alheio', async () => {
    expect(await withAccount(agencia, (db) => removerInscricao(db, usuarioB, inscricao('pc').endpoint))).toBe(false);
    expect(await withAccount(agencia, (db) => removerInscricao(db, usuarioA, inscricao('celular').endpoint))).toBe(true);
  });

  it('a conta rival não enxerga inscrição nenhuma da agência', async () => {
    const doRival = await withAccount(rival, (db) => listarDispositivos(db, usuarioA));
    expect(doRival).toEqual([]);
    const total = await withAccount(rival, (db) => db.one<{ n: number }>('select count(*)::int as n from push_subscriptions'));
    expect(total!.n).toBe(0);
    await withAccount(rival, (db) => salvarInscricao(db, usuarioRival, inscricao('rival'), 'x'));
    expect((await withAccount(agencia, (db) => db.one<{ n: number }>('select count(*)::int as n from push_subscriptions')))!.n).toBe(2);
  });

  it('sem chave VAPID, notificar é um no-op que devolve zero — não erro, não "enviado"', async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    expect(await withAccount(agencia, (db) => notificarAvisosCriticos(db, agencia))).toBe(0);
    const enviados = await withAccount(agencia, (db) => db.query('select 1 from push_enviados'));
    expect(enviados).toEqual([]);
  });
});

describe('deduplicação e agrupamento', () => {
  it('só o que é novo dispara, e o que sumiu sai do registro (volta a avisar se voltar)', () => {
    expect(novosParaEnviar(['a', 'b', 'c'], ['b', 'x'])).toEqual({ enviar: ['a', 'c'], limpar: ['x'] });
    expect(novosParaEnviar([], ['b'])).toEqual({ enviar: [], limpar: ['b'] });
    expect(novosParaEnviar(['a'], ['a'])).toEqual({ enviar: [], limpar: [] });
  });

  it('vários avisos do mesmo cliente viram UMA mensagem com deep link para o cliente', () => {
    const aviso = (p: Partial<Aviso>): Aviso => ({
      chave: 'k', gravidade: 'alta', origem: 'sinal', titulo: 'Desempenho baixo', detalhe: 'nota 30',
      cliente: 'Cliente A', site: 's1', siteId: 'site1', href: '/sites/site1/qualidade', desde: null, ...p,
    });
    const m = mensagensParaPush(
      [aviso({ chave: '1' }), aviso({ chave: '2', siteId: 'site2', site: 's2' }), aviso({ chave: '3', cliente: 'Cliente B', siteId: 'site3', href: '/sites/site3/qualidade' })],
      (a) => (a.cliente === 'Cliente A' ? 'cliA' : 'cliB'),
    );
    expect(m).toHaveLength(2);
    const a = m.find((x) => x.titulo === 'Cliente A')!;
    expect(a.corpo).toBe('2 avisos de gravidade alta em 2 site(s).');
    expect(a.url).toBe('/clientes/cliA');
    const b = m.find((x) => x.titulo.startsWith('Cliente B'))!;
    expect(b.url).toBe('/sites/site3/qualidade');
    expect(b.corpo).toContain('Desempenho baixo');
  });
});
