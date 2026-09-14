/**
 * Banco de testes isolado.
 *
 * Recria `painel_matrix_test` do zero e aplica as mesmas migrações do
 * desenvolvimento — não um schema paralelo escrito à mão, que poderia divergir
 * sem ninguém perceber.
 *
 * A massa é determinística: duas contas, dois clientes, três sites, com números
 * que os testes conferem exatamente. Rodar duas vezes produz o mesmo banco.
 */
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { loadEnv, required } from './env';
import { runMigrations } from './migrate';
import { hashPassword } from '../src/server/auth/password';

loadEnv();

export const SENHA_TESTE = 'teste123456';

/** Credenciais fixas, para os testes não precisarem descobrir nada. */
export const CONTAS = {
  agencia: { email: 'dona@agencia.teste', nome: 'Agência Teste' },
  rival: { email: 'dona@rival.teste', nome: 'Agência Rival' },
} as const;

export function urlDoTeste(variavel: string): string {
  const base = new URL(required(variavel));
  base.pathname = `/${process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test'}`;
  return base.toString();
}

const DIA = 86_400_000;

/**
 * Identificadores fixos da massa. Os testes referenciam estes valores
 * diretamente, então a massa é parte do contrato dos testes.
 */
export const MASSA = {
  siteAlfa: 'sit_teste_alfa01',
  siteBeta: 'sit_teste_beta01',
  siteRival: 'sit_teste_rival1',
  /** Sem nenhum evento: exercita os estados de instalação. */
  siteSemColeta: 'sit_teste_novo01',
  /**
   * Alvo das suítes que GRAVAM (formulários, coleta pela página de teste).
   *
   * Existe para que os testes numéricos possam afirmar totais exatos sobre
   * `siteAlfa` sem depender da ordem de execução: quem escreve, escreve aqui.
   */
  siteEscrita: 'sit_teste_forms1',
} as const;

/**
 * Números que a massa DEVE produzir para o site Alfa nos últimos 7 dias.
 * Escritos aqui, à mão, a partir da especificação abaixo — se uma consulta
 * mudar de comportamento, o teste quebra em vez de acompanhar o erro.
 */
export const ESPERADO_ALFA_7D = {
  /** Oito sessões, uma por entrada de SESSOES_ALFA. */
  sessoes: 8,
  /** v1 e v2 aparecem duas vezes cada: 8 sessões, 6 pessoas. */
  visitantesUnicos: 6,
  /** Soma dos `vistas`: 2+1+2+1+2+1+3+2. */
  visualizacoes: 14,
  /** Soma dos `cliques`: 3 WhatsApp + 2 telefone + 2 e-mail + 1 abertura. */
  cliquesCta: 8,
  cliquesWhatsapp: 3,
  /** Telefone e e-mail; NÃO inclui WhatsApp nem abertura de formulário. */
  cliquesContato: 4,
  aberturasFormulario: 1,
  /** Quatro envios, de três contatos distintos. */
  formularios: 4,
  /** Três sessões converteram; uma delas enviou DUAS vezes. */
  sessoesConvertidasAbs: 3,
  leads: 3,
} as const;

type EspecSessao = {
  visitante: string;
  diasAtras: number;
  vistas: string[];
  cliques: { subtipo: string; botao: string; texto: string; posicao: string }[];
  envios: { email: string; nome: string }[];
};

/**
 * Massa do site Alfa, escrita explicitamente.
 *
 * Confira somando as colunas: 8 sessões, 6 visitantes distintos (v1 e v2
 * repetem), 14 visualizações, 8 cliques, 4 envios de 3 contatos distintos.
 * A sexta sessão envia DUAS vezes — é o caso que torna "sessões convertidas"
 * (3/8 = 37,5%) diferente de "envios por sessão" (4/8 = 50%). No protótipo o
 * modelo não admitia isso, e as duas taxas eram sempre idênticas.
 */
const SESSOES_ALFA: EspecSessao[] = [
  { visitante: 'v1', diasAtras: 5, vistas: ['/', '/planos'],
    cliques: [{ subtipo: 'whatsapp', botao: 'cta-whatsapp-hero', texto: 'Falar no WhatsApp', posicao: 'Hero' }],
    envios: [] },
  { visitante: 'v2', diasAtras: 4, vistas: ['/'],
    cliques: [{ subtipo: 'whatsapp', botao: 'cta-whatsapp-hero', texto: 'Falar no WhatsApp', posicao: 'Hero' }],
    envios: [] },
  { visitante: 'v3', diasAtras: 3, vistas: ['/', '/contato'],
    cliques: [{ subtipo: 'phone', botao: 'cta-telefone-rodape', texto: 'Ligar agora', posicao: 'Rodapé' }],
    envios: [{ email: 'ana@teste.com', nome: 'Ana Teste' }] },
  { visitante: 'v4', diasAtras: 3, vistas: ['/planos'],
    cliques: [{ subtipo: 'form_open', botao: 'cta-form-planos', texto: 'Solicitar proposta', posicao: 'Conteúdo' }],
    envios: [] },
  { visitante: 'v5', diasAtras: 2, vistas: ['/blog/guia', '/'],
    cliques: [], envios: [] },
  // Duas submissões na MESMA sessão, do mesmo contato: um lead, dois envios.
  { visitante: 'v1', diasAtras: 2, vistas: ['/contato'],
    cliques: [{ subtipo: 'email', botao: 'cta-email-rodape', texto: 'Escrever por e-mail', posicao: 'Rodapé' }],
    envios: [{ email: 'bruno@teste.com', nome: 'Bruno Teste' }, { email: 'bruno@teste.com', nome: 'Bruno Teste' }] },
  { visitante: 'v6', diasAtras: 1, vistas: ['/', '/planos', '/contato'],
    cliques: [
      { subtipo: 'whatsapp', botao: 'cta-whatsapp-planos', texto: 'Falar no WhatsApp', posicao: 'Conteúdo' },
      { subtipo: 'phone', botao: 'cta-telefone-rodape', texto: 'Ligar agora', posicao: 'Rodapé' },
    ],
    envios: [{ email: 'carla@teste.com', nome: 'Carla Teste' }] },
  { visitante: 'v2', diasAtras: 0, vistas: ['/', '/contato'],
    cliques: [{ subtipo: 'email', botao: 'cta-email-rodape', texto: 'Escrever por e-mail', posicao: 'Rodapé' }],
    envios: [] },

  // Um dia movimentado FORA da janela de 7 dias. Existe para que, em 30 dias, o
  // pico diário de cliques (5) supere o de formulários (2) — sem isso os dois
  // eixos do gráfico coincidiriam por acaso, e o teste que verifica escalas
  // independentes não teria como distinguir um gráfico correto de um que
  // normaliza as duas séries contra o mesmo eixo.
  // Os totais de 7 dias ficam intactos: este dia não entra naquela janela.
  { visitante: 'v7', diasAtras: 20, vistas: ['/', '/planos'],
    cliques: [
      { subtipo: 'whatsapp', botao: 'cta-whatsapp-hero', texto: 'Falar no WhatsApp', posicao: 'Hero' },
      { subtipo: 'whatsapp', botao: 'cta-whatsapp-planos', texto: 'Falar no WhatsApp', posicao: 'Conteúdo' },
      { subtipo: 'phone', botao: 'cta-telefone-rodape', texto: 'Ligar agora', posicao: 'Rodapé' },
    ],
    envios: [] },
  { visitante: 'v8', diasAtras: 20, vistas: ['/planos'],
    cliques: [
      { subtipo: 'form_open', botao: 'cta-form-planos', texto: 'Solicitar proposta', posicao: 'Conteúdo' },
      { subtipo: 'email', botao: 'cta-email-rodape', texto: 'Escrever por e-mail', posicao: 'Rodapé' },
    ],
    envios: [] },
];

/** Site Beta: pouca coisa, só para provar que os filtros separam os sites. */
const SESSOES_BETA: EspecSessao[] = [
  { visitante: 'b1', diasAtras: 2, vistas: ['/'], cliques: [], envios: [] },
  { visitante: 'b2', diasAtras: 1, vistas: ['/', '/orcamento'],
    cliques: [{ subtipo: 'whatsapp', botao: 'cta-whatsapp-hero', texto: 'Falar no WhatsApp', posicao: 'Hero' }],
    envios: [{ email: 'davi@teste.com', nome: 'Davi Teste' }] },
];

/** Site da conta rival: existe só para os testes de isolamento. */
const SESSOES_RIVAL: EspecSessao[] = [
  { visitante: 'r1', diasAtras: 1, vistas: ['/'],
    cliques: [], envios: [{ email: 'segredo@rival.teste', nome: 'Lead Confidencial' }] },
];

export async function prepararBancoDeTeste(): Promise<void> {
  const adminUrl = new URL(required('DATABASE_URL_ADMIN'));
  const alvo = process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test';

  const manutencao = new URL(adminUrl.toString());
  manutencao.pathname = '/postgres';
  const admin = new Client({ connectionString: manutencao.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${alvo}" with (force)`);
  await admin.query(`create database "${alvo}"`);
  await admin.end();

  const testeUrl = urlDoTeste('DATABASE_URL_ADMIN');
  await runMigrations(testeUrl);

  const db = new Client({ connectionString: testeUrl });
  await db.connect();
  const senha = await hashPassword(SENHA_TESTE);

  // Meia-noite UTC de hoje, para as datas caírem em dias previsíveis.
  const hoje = new Date();
  hoje.setUTCHours(12, 0, 0, 0);

  async function criarConta(nome: string, email: string) {
    const accountId = randomUUID();
    await db.query('insert into accounts (id, name) values ($1, $2)', [accountId, nome]);
    await db.query(
      'insert into users (account_id, email, password_hash, name) values ($1, $2, $3, $4)',
      [accountId, email, senha, nome],
    );
    return accountId;
  }

  async function criarSite(accountId: string, clientId: string, nome: string, dominio: string, publicId: string) {
    const siteId = randomUUID();
    await db.query(
      `insert into sites (id, account_id, client_id, name, domain, timezone, public_id, snippet_seen_at)
       values ($1, $2, $3, $4, $5, 'America/Sao_Paulo', $6, now())`,
      [siteId, accountId, clientId, nome, dominio, publicId],
    );
    return siteId;
  }

  async function criarCliente(accountId: string, nome: string) {
    const id = randomUUID();
    await db.query('insert into clients (id, account_id, name) values ($1, $2, $3)', [id, accountId, nome]);
    return id;
  }

  async function semear(accountId: string, clientId: string, siteId: string, specs: EspecSessao[]) {
    const paginas = new Map<string, string>();
    const garantir = async (caminho: string) => {
      if (paginas.has(caminho)) return paginas.get(caminho)!;
      const id = randomUUID();
      await db.query(
        'insert into pages (id, account_id, site_id, path, first_seen_at) values ($1,$2,$3,$4,now())',
        [id, accountId, siteId, caminho],
      );
      paginas.set(caminho, id);
      return id;
    };

    for (const spec of specs) {
      const inicio = new Date(hoje.getTime() - spec.diasAtras * DIA);
      const sessionId = randomUUID();
      const primeira = await garantir(spec.vistas[0]!);

      await db.query(
        `insert into sessions (id, account_id, site_id, visitor_id, started_at, last_seen_at,
                               source, campaign, device, entry_page_id)
         values ($1,$2,$3,$4,$5,$5,'google / cpc','institucional','Celular',$6)`,
        [sessionId, accountId, siteId, spec.visitante, inicio, primeira],
      );

      for (const [i, caminho] of spec.vistas.entries()) {
        const pageId = await garantir(caminho);
        await db.query(
          `insert into events (account_id, site_id, session_id, page_id, type, occurred_at, event_uid)
           values ($1,$2,$3,$4,'page_view',$5,$6)`,
          [accountId, siteId, sessionId, pageId, new Date(inicio.getTime() + i * 60_000), randomUUID()],
        );
      }

      for (const clique of spec.cliques) {
        const pageId = await garantir(spec.vistas[spec.vistas.length - 1]!);
        await db.query(
          `insert into events (account_id, site_id, session_id, page_id, type, subtype,
                               button_id, button_text, button_position, occurred_at, event_uid)
           values ($1,$2,$3,$4,'cta_click',$5,$6,$7,$8,$9,$10)`,
          [accountId, siteId, sessionId, pageId, clique.subtipo, clique.botao, clique.texto,
           clique.posicao, new Date(inicio.getTime() + 300_000), randomUUID()],
        );
      }

      for (const envio of spec.envios) {
        const pageId = await garantir(spec.vistas[spec.vistas.length - 1]!);
        const chave = `email:${envio.email}`;
        const lead = await db.query<{ id: string }>(
          `insert into leads (account_id, site_id, client_id, name, email, dedupe_key, first_seen_at, last_seen_at)
                values ($1,$2,$3,$4,$5,$6,$7,$7)
           on conflict (site_id, dedupe_key) do update set last_seen_at = excluded.last_seen_at
             returning id`,
          [accountId, siteId, clientId, envio.nome, envio.email, chave, new Date(inicio.getTime() + 600_000)],
        );
        await db.query(
          `insert into form_submissions (account_id, site_id, session_id, page_id, lead_id, form_name,
                                         status, idempotency_key, created_at)
           values ($1,$2,$3,$4,$5,'Fale conosco','confirmada',$6,$7)`,
          [accountId, siteId, sessionId, pageId, lead.rows[0]!.id, randomUUID(),
           new Date(inicio.getTime() + 600_000)],
        );
      }
    }
  }

  const agencia = await criarConta(CONTAS.agencia.nome, CONTAS.agencia.email);
  const clienteUm = await criarCliente(agencia, 'Cliente Um');
  const clienteDois = await criarCliente(agencia, 'Cliente Dois');
  const alfa = await criarSite(agencia, clienteUm, 'alfa.teste', 'alfa.teste', MASSA.siteAlfa);
  const beta = await criarSite(agencia, clienteDois, 'beta.teste', 'beta.teste', MASSA.siteBeta);
  await criarSite(agencia, clienteDois, 'novo.teste', 'novo.teste', MASSA.siteSemColeta);
  await criarSite(agencia, clienteDois, 'escrita.teste', 'escrita.teste', MASSA.siteEscrita);
  await semear(agencia, clienteUm, alfa, SESSOES_ALFA);
  await semear(agencia, clienteDois, beta, SESSOES_BETA);

  const rival = await criarConta(CONTAS.rival.nome, CONTAS.rival.email);
  const clienteRival = await criarCliente(rival, 'Cliente Rival');
  const siteRival = await criarSite(rival, clienteRival, 'rival.teste', 'rival.teste', MASSA.siteRival);
  await semear(rival, clienteRival, siteRival, SESSOES_RIVAL);

  await db.end();
}

if (process.argv[1]?.endsWith('test-db.ts')) {
  prepararBancoDeTeste()
    .then(() => console.log('banco de testes pronto'))
    .catch((erro) => {
      console.error(erro);
      process.exit(1);
    });
}
