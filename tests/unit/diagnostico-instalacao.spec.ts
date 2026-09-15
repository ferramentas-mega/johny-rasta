import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { abrirDiagnostico, verificarDiagnostico } from '@/server/services/onboarding';
import { prepararBancoDeTeste, CONTAS } from '../../scripts/test-db';

/**
 * O diagnóstico da espera, contra o banco.
 *
 * A derivação pura já é testada em `instalacao.spec.ts`. O que só o banco
 * responde é a CLASSIFICAÇÃO: separar o que veio das páginas do próprio painel
 * do que veio do site do cliente. Errar essa conta faz o painel dizer "seu site
 * nunca falou com o servidor" para um site que coleta há meses — ou o
 * contrário, que é pior, porque manda parar de procurar.
 *
 * Site próprio, criado e destruído aqui: este arquivo escreve eventos, e a massa
 * compartilhada é medida por testes numéricos.
 */

let admin: Client;
let accountId: string;
let siteId: string;
let pageDoPainel: string;
let pageDoSite: string;
let sessionId: string;

const PUBLIC_ID = 'sit_teste_instal';

async function evento(opcoes: { pageId: string; token?: string; quando?: Date }) {
  await admin.query(
    `insert into events (account_id, site_id, session_id, page_id, type, occurred_at, event_uid, diagnostic_token, is_test)
     values ($1,$2,$3,$4,'page_view',$5,$6,$7,$8)`,
    [
      accountId, siteId, sessionId, opcoes.pageId,
      opcoes.quando ?? new Date(), randomUUID(), opcoes.token ?? null, !!opcoes.token,
    ],
  );
}

beforeAll(async () => {
  await prepararBancoDeTeste();
  admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();

  const conta = await admin.query<{ id: string }>('select id from accounts where name = $1', [
    CONTAS.agencia.nome,
  ]);
  accountId = conta.rows[0]!.id;

  const cliente = await admin.query<{ id: string }>(
    'select id from clients where account_id = $1 limit 1',
    [accountId],
  );

  const site = await admin.query<{ id: string }>(
    `insert into sites (account_id, client_id, name, domain, public_id, timezone)
     values ($1,$2,'instalacao.teste','instalacao.teste',$3,'America/Sao_Paulo') returning id`,
    [accountId, cliente.rows[0]!.id, PUBLIC_ID],
  );
  siteId = site.rows[0]!.id;

  const criarPagina = async (caminho: string) => {
    const r = await admin.query<{ id: string }>(
      'insert into pages (account_id, site_id, path) values ($1,$2,$3) returning id',
      [accountId, siteId, caminho],
    );
    return r.rows[0]!.id;
  };
  // Exatamente os dois caminhos que o próprio painel gera.
  pageDoPainel = await criarPagina('/verificacao-de-instalacao');
  pageDoSite = await criarPagina('/contato');

  const sessao = await admin.query<{ id: string }>(
    `insert into sessions (account_id, site_id, visitor_id, source, medium, device, started_at, last_seen_at)
     values ($1,$2,'v-inst','direto','none','desktop', now() - interval '1 hour', now()) returning id`,
    [accountId, siteId],
  );
  sessionId = sessao.rows[0]!.id;
});

afterAll(async () => {
  await admin.query('delete from sites where public_id = $1', [PUBLIC_ID]);
  await admin.end();
});

beforeEach(async () => {
  await admin.query('delete from events where site_id = $1', [siteId]);
  await admin.query('delete from site_features where site_id = $1', [siteId]);
  await admin.query('delete from diagnostic_sessions where site_id = $1', [siteId]);
});

const conferir = async () => {
  const sessao = await abrirDiagnostico(accountId, siteId);
  return (await verificarDiagnostico(accountId, siteId, sessao.token)).diagnostico;
};

describe('classificação entre página do painel e página do cliente', () => {
  it('site sem nada: nunca coletou', async () => {
    expect((await conferir()).sinal).toBe('nunca_coletou');
  });

  it('só a página de teste do painel não conta como site instalado', async () => {
    // O botão "Enviar evento de teste" prova que o servidor recebe. Tratar isso
    // como instalação faria o painel garantir uma coleta que não existe.
    await evento({ pageId: pageDoPainel });
    expect((await conferir()).sinal).toBe('so_do_painel');
  });

  it('uma página real do cliente muda o diagnóstico', async () => {
    // Evento antigo, fora de qualquer janela de diagnóstico.
    await evento({ pageId: pageDoSite, quando: new Date(Date.now() - 30 * 86_400_000) });
    expect((await conferir()).sinal).toBe('ja_coletou_antes');
  });

  it('evento do site DURANTE a janela, sem token: o problema é o link', async () => {
    const sessao = await abrirDiagnostico(accountId, siteId);
    await evento({ pageId: pageDoSite });

    const d = (await verificarDiagnostico(accountId, siteId, sessao.token)).diagnostico;
    expect(d.sinal).toBe('sem_token');
  });

  it('evento com o token verifica, e o diagnóstico diz que está de pé', async () => {
    const sessao = await abrirDiagnostico(accountId, siteId);
    await evento({ pageId: pageDoSite, token: sessao.token });

    const r = await verificarDiagnostico(accountId, siteId, sessao.token);
    expect(r.diagnostico.sinal).toBe('recebido');
    // E a verificação de verdade continua acontecendo: o diagnóstico explica a
    // espera, não substitui o carimbo.
    expect(r.verificados).toContain('visitas');
  });

  it('evento do painel com token ainda verifica — a separação é só do diagnóstico', async () => {
    // Registrado porque o comportamento surpreende: a contagem que separa
    // painel de site alimenta o DIAGNÓSTICO, e não muda quem carimba recurso.
    // Um evento com token vindo da página de teste do painel continua
    // verificando "visitas".
    //
    // Se isso está certo é outra discussão, e ela é de produto: dá para
    // argumentar que confirmar "seu site coleta" com um evento gerado numa
    // página NOSSA é confirmar coisa nenhuma. Não mexi nisso aqui porque
    // mudaria o que conta como verificação — decisão maior que o beco sem
    // saída que esta rodada veio fechar, e há prova de navegador apoiada nesse
    // caminho.
    const sessao = await abrirDiagnostico(accountId, siteId);
    await evento({ pageId: pageDoPainel, token: sessao.token });

    const r = await verificarDiagnostico(accountId, siteId, sessao.token);
    expect(r.diagnostico.sinal).toBe('recebido');
    const marcadas = await admin.query(
      'select feature from site_features where site_id = $1 and verificado_em is not null',
      [siteId],
    );
    // Chegou com token, então verifica — o que o teste fixa é que a contagem de
    // "eventos do site" não passou a incluir a página do painel.
    expect(marcadas.rowCount).toBeGreaterThan(0);
  });

  it('a conferência de console só é oferecida quando ajuda', async () => {
    await evento({ pageId: pageDoPainel });
    expect((await conferir()).ofereceConsole).toBe(true);

    await admin.query('delete from events where site_id = $1', [siteId]);
    const sessao = await abrirDiagnostico(accountId, siteId);
    await evento({ pageId: pageDoSite });
    const d = (await verificarDiagnostico(accountId, siteId, sessao.token)).diagnostico;
    expect(d.sinal).toBe('sem_token');
    expect(d.ofereceConsole).toBe(false);
  });

  it('devolve o identificador público para montar a conferência', async () => {
    const sessao = await abrirDiagnostico(accountId, siteId);
    const r = await verificarDiagnostico(accountId, siteId, sessao.token);
    expect(r.publicId).toBe(PUBLIC_ID);
  });
});
