/**
 * Massa determinística de desenvolvimento.
 *
 * Roda como superusuário (DATABASE_URL_ADMIN), então enxerga tudo — é o único
 * lugar do projeto que ignora RLS, de propósito.
 *
 * Gera DUAS contas com dados, para que o isolamento entre contas possa ser
 * testado de verdade, e não apenas afirmado.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv, required } from './env';
import { hashPassword } from '../src/server/auth/password';

loadEnv();

/** PRNG com semente fixa: rodar o seed duas vezes dá exatamente a mesma massa. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const PAGES = [
  { path: '/', weight: 0.44 },
  { path: '/planos', weight: 0.23 },
  { path: '/contato', weight: 0.18 },
  { path: '/blog/como-escolher', weight: 0.15 },
];

const SOURCES = [
  { source: 'google / cpc', campaign: 'institucional-set', weight: 0.36 },
  { source: 'meta / cpc', campaign: 'remarketing-lp', weight: 0.24 },
  { source: 'google / organic', campaign: '', weight: 0.19 },
  { source: 'direto', campaign: '', weight: 0.14 },
  { source: 'Não identificado', campaign: '', weight: 0.07 },
];

const BUTTONS = [
  { id: 'cta-whatsapp-hero', text: 'Falar no WhatsApp', subtype: 'whatsapp', position: 'Hero', page: '/', rate: 0.055 },
  { id: 'cta-whatsapp-float', text: 'Chamar no WhatsApp', subtype: 'whatsapp', position: 'Flutuante', page: '*', rate: 0.05 },
  { id: 'cta-form-planos', text: 'Solicitar proposta', subtype: 'form_open', position: 'Conteúdo', page: '/planos', rate: 0.09 },
  { id: 'cta-phone-footer', text: 'Ligar agora', subtype: 'phone', position: 'Rodapé', page: '*', rate: 0.02 },
  { id: 'cta-whatsapp-planos', text: 'Falar no WhatsApp', subtype: 'whatsapp', position: 'Conteúdo', page: '/planos', rate: 0.04 },
  { id: 'cta-email-contato', text: 'Escrever por e-mail', subtype: 'email', position: 'Rodapé', page: '/contato', rate: 0.03 },
];

const NOMES = ['Ana Ribeiro', 'Bruno Faria', 'Carla Menezes', 'Diego Prado', 'Elisa Tavares', 'Fábio Nunes', 'Gisele Alves', 'Heitor Lima', 'Iara Souza', 'João Castro', 'Karina Melo', 'Lucas Vieira'];

function pick<T extends { weight: number }>(list: T[], r: number): T {
  let acc = 0;
  for (const item of list) {
    acc += item.weight;
    if (r <= acc) return item;
  }
  return list[list.length - 1]!;
}

const DAY_MS = 86_400_000;

type SiteSpec = {
  name: string;
  domain: string;
  publicId: string;
  /** Sessões por dia. 0 = site cadastrado que nunca recebeu evento. */
  perDay: number;
  seed: number;
  snippetSeen: boolean;
};

async function main() {
  const client = new Client({ connectionString: required('DATABASE_URL_ADMIN') });
  await client.connect();

  console.log('· limpando dados anteriores');
  await client.query('truncate accounts cascade');

  const senha = await hashPassword('painel123');
  // Fim da janela: início do dia de amanhã em UTC, para que "hoje" tenha dados.
  const hoje = new Date();
  hoje.setUTCHours(0, 0, 0, 0);

  async function criarConta(opts: {
    accountName: string;
    userEmail: string;
    userName: string;
    isDemo: boolean;
    clientes: { nome: string; sites: SiteSpec[] }[];
  }) {
    const accountId = randomUUID();
    await client.query('insert into accounts (id, name, is_demo) values ($1, $2, $3)', [
      accountId, opts.accountName, opts.isDemo,
    ]);
    await client.query(
      'insert into users (account_id, email, password_hash, name, role) values ($1, $2, $3, $4, $5)',
      [accountId, opts.userEmail, senha, opts.userName, 'owner'],
    );

    for (const cliente of opts.clientes) {
      const clientId = randomUUID();
      await client.query('insert into clients (id, account_id, name) values ($1, $2, $3)', [
        clientId, accountId, cliente.nome,
      ]);

      for (const spec of cliente.sites) {
        const siteId = randomUUID();
        await client.query(
          `insert into sites (id, account_id, client_id, name, domain, timezone, public_id, snippet_seen_at)
           values ($1, $2, $3, $4, $5, 'America/Sao_Paulo', $6, $7)`,
          [siteId, accountId, clientId, spec.name, spec.domain, spec.publicId,
           spec.snippetSeen ? new Date(hoje.getTime() - 20 * DAY_MS) : null],
        );
        if (spec.perDay > 0) {
          await gerarMassa({ accountId, clientId, siteId, spec, hoje });
        }
        console.log(`  · ${spec.name} (${spec.perDay ? `${spec.perDay}/dia` : 'sem coleta'})`);
      }
    }
    return accountId;
  }

  async function gerarMassa(ctx: {
    accountId: string; clientId: string; siteId: string; spec: SiteSpec; hoje: Date;
  }) {
    const { accountId, clientId, siteId, spec } = ctx;
    const rnd = rng(spec.seed);

    // Páginas: criadas antes, para que os eventos possam referenciá-las.
    const pageIds = new Map<string, string>();
    for (const p of PAGES) {
      const id = randomUUID();
      pageIds.set(p.path, id);
      await client.query(
        'insert into pages (id, account_id, site_id, path, first_seen_at) values ($1, $2, $3, $4, $5)',
        [id, accountId, siteId, p.path, new Date(ctx.hoje.getTime() - 30 * DAY_MS)],
      );
    }

    const sessions: unknown[][] = [];
    const events: unknown[][] = [];
    const submissions: { sessionId: string; pageId: string; form: string; at: Date; nome: string; email: string; phone: string }[] = [];

    for (let back = 29; back >= 0; back--) {
      const n = spec.perDay + Math.floor(rnd() * Math.round(spec.perDay * 0.2));
      for (let i = 0; i < n; i++) {
        const sessionId = randomUUID();
        const src = pick(SOURCES, rnd());
        // Visitantes se repetem dentro do dia e entre dias vizinhos, para que
        // "visitantes únicos" seja menor que "sessões" — como na vida real.
        const visitor = `v${Math.floor(rnd() * Math.round(spec.perDay * 0.8)) + back * 7}`;
        const minuto = Math.floor(rnd() * 1380);
        const inicio = new Date(ctx.hoje.getTime() - back * DAY_MS + minuto * 60_000);

        const vistas = [pick(PAGES, rnd()).path];
        const extra = rnd();
        if (extra > 0.52) vistas.push(pick(PAGES, rnd()).path);
        if (extra > 0.86) vistas.push(pick(PAGES, rnd()).path);
        const device = rnd() < 0.62 ? 'Celular' : 'Desktop';

        let ultimo = inicio;
        vistas.forEach((path, idx) => {
          const at = new Date(inicio.getTime() + idx * 90_000);
          ultimo = at;
          events.push([randomUUID(), accountId, siteId, sessionId, pageIds.get(path), 'page_view', null, null, null, null, at, randomUUID(), false]);
        });

        sessions.push([sessionId, accountId, siteId, visitor, inicio, ultimo, src.source,
          src.source.includes('/') ? src.source.split('/')[1]!.trim() : null,
          src.campaign || null, src.source === 'direto' ? null : 'google.com', device,
          pageIds.get(vistas[0]!), false]);

        for (const b of BUTTONS) {
          const alvo = b.page === '*' ? vistas[0]! : b.page;
          if (b.page !== '*' && !vistas.includes(b.page)) continue;
          if (rnd() >= b.rate) continue;
          const at = new Date(ultimo.getTime() + 20_000);
          events.push([randomUUID(), accountId, siteId, sessionId, pageIds.get(alvo), 'cta_click',
            b.subtype, b.id, b.text, b.position, at, randomUUID(), false]);
        }

        // Só envia formulário quem passou por uma página que tem formulário.
        const podeEnviar = vistas.includes('/contato') || vistas.includes('/planos');
        if (podeEnviar && rnd() < 0.052) {
          const pagina = vistas.includes('/contato') ? '/contato' : '/planos';
          const nome = NOMES[Math.floor(rnd() * NOMES.length)]!;
          // Sufixo numérico dá variedade suficiente para exercitar a
          // deduplicação de leads sem colapsar centenas de submissões.
          const sufixo = Math.floor(rnd() * 400);
          const base = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '.');
          const slug = `${base}.${sufixo}`;
          submissions.push({
            sessionId, pageId: pageIds.get(pagina)!, at: new Date(ultimo.getTime() + 60_000),
            form: pagina === '/contato' ? 'Fale conosco' : 'Solicitar proposta',
            nome, email: `${slug}@exemplo.com.br`, phone: `1199${String(1000000 + Math.floor(rnd() * 8999999))}`,
          });
          // Uma parte das sessões envia DUAS vezes. É isso que faz "sessões
          // convertidas" e "envios por sessão" divergirem — no protótipo o
          // modelo não permitia isso e as duas taxas eram sempre iguais.
          if (rnd() < 0.12) {
            submissions.push({
              sessionId, pageId: pageIds.get(pagina)!, at: new Date(ultimo.getTime() + 240_000),
              form: 'Solicitar proposta', nome, email: `${slug}@exemplo.com.br`,
              phone: `1199${String(1000000 + Math.floor(rnd() * 8999999))}`,
            });
          }
        }
      }
    }

    await inserirEmLotes(client,
      `insert into sessions (id, account_id, site_id, visitor_id, started_at, last_seen_at, source, medium, campaign, referrer_host, device, entry_page_id, is_test) values`,
      13, sessions);
    await inserirEmLotes(client,
      `insert into events (id, account_id, site_id, session_id, page_id, type, subtype, button_id, button_text, button_position, occurred_at, event_uid, is_test) values`,
      13, events);

    // Leads: deduplicados por e-mail dentro do site, como faz o endpoint real.
    const leadIds = new Map<string, string>();
    for (const s of submissions) {
      const chave = s.email.toLowerCase();
      if (!leadIds.has(chave)) {
        const id = randomUUID();
        leadIds.set(chave, id);
        await client.query(
          `insert into leads (id, account_id, site_id, client_id, name, email, phone, dedupe_key, first_seen_at, last_seen_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
          [id, accountId, siteId, clientId, s.nome, s.email, s.phone, chave, s.at],
        );
      }
      await client.query(
        `insert into form_submissions (account_id, site_id, session_id, page_id, lead_id, form_name, status, payload, idempotency_key, created_at)
         values ($1,$2,$3,$4,$5,$6,'confirmada',$7,$8,$9)`,
        [accountId, siteId, s.sessionId, s.pageId, leadIds.get(chave), s.form,
         JSON.stringify({ nome: s.nome, email: s.email, telefone: s.phone }), randomUUID(), s.at],
      );
    }
  }

  const contaPrincipal = await criarConta({
    accountName: 'Equipe de marketing',
    userEmail: 'ferramentas@megaads.com.br',
    userName: 'Equipe de marketing',
    isDemo: false,
    clientes: [
      {
        nome: 'Mega Ads',
        sites: [
          { name: 'megaads.com.br', domain: 'megaads.com.br', publicId: 'sit_9f3a21c7b04e', perDay: 250, seed: 20260914, snippetSeen: true },
          { name: 'lp-consorcio-imobiliario', domain: 'lp.megaads.com.br', publicId: 'sit_4b18ee90ac35', perDay: 0, seed: 7, snippetSeen: true },
        ],
      },
      {
        nome: 'Clínica Vitta',
        sites: [
          { name: 'clinica-vitta.com.br', domain: 'clinica-vitta.com.br', publicId: 'sit_c7d2f1a03b55', perDay: 62, seed: 31337, snippetSeen: true },
        ],
      },
    ],
  });

  // Segunda conta: existe para provar isolamento. Nada dela pode aparecer na
  // primeira, nem via URL montada à mão.
  await criarConta({
    accountName: 'Agência Concorrente',
    userEmail: 'outro@exemplo.com',
    userName: 'Outra agência',
    isDemo: false,
    clientes: [
      {
        nome: 'Cliente Externo',
        sites: [
          { name: 'externo.com.br', domain: 'externo.com.br', publicId: 'sit_ff0011223344', perDay: 40, seed: 99, snippetSeen: true },
        ],
      },
    ],
  });

  const resumo = await client.query(
    `select (select count(*) from accounts) as contas,
            (select count(*) from clients)  as clientes,
            (select count(*) from sites)    as sites,
            (select count(*) from sessions) as sessoes,
            (select count(*) from events)   as eventos,
            (select count(*) from form_submissions) as submissoes,
            (select count(*) from leads)    as leads`,
  );
  console.log('·', resumo.rows[0]);
  console.log(`\nLogin: ferramentas@megaads.com.br / painel123  (conta ${contaPrincipal.slice(0, 8)}…)`);
  await client.end();
}

/** Insere em lotes: um INSERT por linha levaria minutos com milhares de eventos. */
async function inserirEmLotes(client: Client, prefixo: string, colunas: number, linhas: unknown[][]) {
  const LOTE = 500;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const chunk = linhas.slice(i, i + LOTE);
    const placeholders = chunk
      .map((_, r) => `(${Array.from({ length: colunas }, (_, c) => `$${r * colunas + c + 1}`).join(',')})`)
      .join(',');
    await client.query(`${prefixo} ${placeholders}`, chunk.flat());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
