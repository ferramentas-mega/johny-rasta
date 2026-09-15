import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { withAccount } from '@/server/db';
import { getInventarioDeBotoes, getTagsDuplicadas } from '@/server/metrics/queries';
import { prepararBancoDeTeste, MASSA, CONTAS } from '../../scripts/test-db';

/**
 * Inventário de tags e botões, contra o banco.
 *
 * A massa compartilhada não serve aqui: os casos que importam são cenários que
 * ninguém produz por acaso — uma tag disparando duas vezes, um botão parado há
 * semanas. Então este arquivo monta o próprio site e limpa no fim, sem tocar nos
 * sites que as suítes numéricas medem.
 */

let admin: Client;
let accountId: string;
let siteId: string;
let clientId: string;
let pageId: string;
let sessionId: string;

const PUBLIC_ID = 'sit_teste_invent';
const DIA = 86_400_000;

async function evento(opcoes: {
  tipo: string;
  subtipo?: string;
  botaoId?: string;
  texto?: string;
  posicao?: string;
  quando: Date;
  teste?: boolean;
  sessao?: string;
}) {
  await admin.query(
    `insert into events (account_id, site_id, session_id, page_id, type, subtype,
                         button_id, button_text, button_position, occurred_at, event_uid, is_test)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      accountId, siteId, opcoes.sessao ?? sessionId, pageId, opcoes.tipo,
      opcoes.subtipo ?? null, opcoes.botaoId ?? null, opcoes.texto ?? null,
      opcoes.posicao ?? null, opcoes.quando, randomUUID(), opcoes.teste ?? false,
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
  clientId = cliente.rows[0]!.id;

  const site = await admin.query<{ id: string }>(
    `insert into sites (account_id, client_id, name, domain, public_id, timezone)
     values ($1,$2,'inventario.teste','inventario.teste',$3,'America/Sao_Paulo')
     returning id`,
    [accountId, clientId, PUBLIC_ID],
  );
  siteId = site.rows[0]!.id;

  const pagina = await admin.query<{ id: string }>(
    `insert into pages (account_id, site_id, path) values ($1,$2,'/') returning id`,
    [accountId, siteId],
  );
  pageId = pagina.rows[0]!.id;

  const sessao = await admin.query<{ id: string }>(
    `insert into sessions (account_id, site_id, visitor_id, source, medium, device, started_at, last_seen_at)
     values ($1,$2,'v-inv','direto','none','desktop', now() - interval '1 hour', now())
     returning id`,
    [accountId, siteId],
  );
  sessionId = sessao.rows[0]!.id;
});

afterAll(async () => {
  // O site inteiro sai, e com ele eventos, páginas e sessões por cascata.
  await admin.query('delete from sites where public_id = $1', [PUBLIC_ID]);
  await admin.end();
});

const inventario = () => withAccount(accountId, (db) => getInventarioDeBotoes(db, siteId));

describe('inventário de botões', () => {
  it('site sem clique nenhum devolve lista vazia, não erro', async () => {
    expect(await inventario()).toEqual([]);
  });

  it('agrupa por botão e marca o detectado automaticamente', async () => {
    const agora = new Date();
    await evento({ tipo: 'cta_click', subtipo: 'whatsapp', botaoId: 'cta-wa-hero',
      texto: 'Falar no WhatsApp', posicao: 'Hero', quando: new Date(agora.getTime() - 2 * DIA) });
    await evento({ tipo: 'cta_click', subtipo: 'whatsapp', botaoId: 'cta-wa-hero',
      texto: 'Falar agora', posicao: 'Hero', quando: agora });
    await evento({ tipo: 'cta_click', subtipo: 'phone', botaoId: 'auto:phone',
      texto: 'Ligar', quando: agora });

    const lista = await inventario();
    const porId = Object.fromEntries(lista.map((b) => [b.buttonId, b]));

    expect(lista).toHaveLength(2);
    expect(porId['cta-wa-hero']!.cliques).toBe(2);
    expect(porId['cta-wa-hero']!.identificado).toBe(true);
    // O prefixo `auto:` é a marca de "medido, mas sem nome".
    expect(porId['auto:phone']!.identificado).toBe(false);
  });

  it('mostra o texto MAIS RECENTE, não um qualquer', async () => {
    // O rótulo muda quando alguém reescreve a página. Mostrar o antigo faria o
    // operador procurar na página algo que não está mais escrito lá.
    const lista = await inventario();
    expect(lista.find((b) => b.buttonId === 'cta-wa-hero')!.texto).toBe('Falar agora');
  });

  it('NÃO é recortado por período: o histórico inteiro entra', async () => {
    // É a diferença central para `getByButton`. Um botão bem instalado que não
    // recebeu clique nesta semana continua existindo — recortá-lo por período o
    // faria sumir do inventário e parecer removido do site.
    await evento({ tipo: 'cta_click', subtipo: 'email', botaoId: 'cta-email-antigo',
      texto: 'E-mail', quando: new Date(Date.now() - 200 * DIA) });

    const lista = await inventario();
    expect(lista.map((b) => b.buttonId)).toContain('cta-email-antigo');
  });

  it('ignora evento de teste: diagnóstico do operador não é botão de visitante', async () => {
    await evento({ tipo: 'cta_click', subtipo: 'whatsapp', botaoId: 'cta-so-teste',
      texto: 'Teste', quando: new Date(), teste: true });

    const lista = await inventario();
    expect(lista.map((b) => b.buttonId)).not.toContain('cta-so-teste');
  });

  it('não enxerga botão de outro site', async () => {
    const outro = await withAccount(accountId, async (db) => {
      const s = await db.one<{ id: string }>('select id from sites where public_id = $1', [
        MASSA.siteAlfa,
      ]);
      return getInventarioDeBotoes(db, s!.id);
    });
    expect(outro.map((b) => b.buttonId)).not.toContain('cta-wa-hero');
  });
});

describe('tag duplicada', () => {
  const duplicadas = () => withAccount(accountId, (db) => getTagsDuplicadas(db, siteId));

  it('visualizações espaçadas não acusam nada', async () => {
    const base = new Date(Date.now() - 3600_000);
    await evento({ tipo: 'page_view', quando: base });
    await evento({ tipo: 'page_view', quando: new Date(base.getTime() + 30_000) });

    expect(await duplicadas()).toEqual([]);
  });

  it('duas visualizações da mesma sessão em menos de 2s acusam coletor duplicado', async () => {
    // O sintoma de duas tags na mesma página: cada instância dispara a própria
    // visualização, com `event_uid` distinto — a deduplicação por idempotência
    // não pega, porque do ponto de vista do banco são dois eventos legítimos.
    const base = new Date(Date.now() - 1800_000);
    await evento({ tipo: 'page_view', quando: base });
    await evento({ tipo: 'page_view', quando: new Date(base.getTime() + 300) });

    const lista = await duplicadas();
    expect(lista).toHaveLength(1);
    expect(lista[0]!.caminho).toBe('/');
    expect(lista[0]!.ocorrencias).toBe(1);
  });

  it('sessões DIFERENTES no mesmo instante não são duplicação', async () => {
    // Duas pessoas abrindo a mesma página ao mesmo tempo é tráfego, não defeito.
    const outra = await admin.query<{ id: string }>(
      `insert into sessions (account_id, site_id, visitor_id, source, medium, device, started_at, last_seen_at)
       values ($1,$2,'v-inv-2','direto','none','desktop', now() - interval '1 hour', now())
       returning id`,
      [accountId, siteId],
    );
    const base = new Date(Date.now() - 900_000);
    await evento({ tipo: 'page_view', quando: base });
    await evento({ tipo: 'page_view', quando: new Date(base.getTime() + 200), sessao: outra.rows[0]!.id });

    const lista = await duplicadas();
    // Continua sendo só a ocorrência do teste anterior.
    expect(lista[0]!.ocorrencias).toBe(1);
  });
});
