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
 * Fuso de todos os sites da massa, e o mesmo usado para ancorá-la no tempo.
 *
 * Precisa ser um valor só: é a janela de recorte das consultas e a colocação
 * dos eventos ao mesmo tempo. Divergirem foi exatamente a causa da falha
 * intermitente descrita na âncora, mais abaixo.
 */
const FUSO_DA_MASSA = 'America/Sao_Paulo';

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

/**
 * Funil de qualidade dos leads do site Alfa em 7 dias.
 *
 * Confira sessão a sessão em SESSOES_ALFA: das oito, só a quinta (v5, dois dias
 * atrás) não clica nem envia. As três que enviam (v3, v1 e v6) trazem contatos
 * que não existiam antes — ana, bruno e carla — e nenhum deles tem telefone.
 */
export const ESPERADO_FUNIL_ALFA_7D = {
  sessoes: 8,
  /** Sete: todas menos v5, que só viu duas páginas. */
  interagiram: 7,
  enviaram: 3,
  contatoNovo: 3,
  leadsDistintos: 3,
  enviosSemSessao: 0,
  enviosDeContatoConhecido: 0,
  /** A massa de Alfa só grava e-mail. O caso com os dois está em Beta. */
  leadsComOsDoisContatos: 0,
} as const;

/**
 * Funil do site Beta em 7 dias.
 *
 * Existe por causa de b3, que envia sem clicar: aqui `interagiram` (2) só é
 * maior ou igual a `enviaram` (2) porque a etapa soma cliques E envios. Se
 * alguém trocar a definição por "clicou em CTA", este teste quebra com 1 < 2 —
 * um funil que se inverte.
 */
export const ESPERADO_FUNIL_BETA_7D = {
  sessoes: 3,
  interagiram: 2,
  enviaram: 2,
  contatoNovo: 2,
  leadsDistintos: 2,
  enviosSemSessao: 0,
  enviosDeContatoConhecido: 0,
  /** Só Elis tem e-mail e telefone. */
  leadsComOsDoisContatos: 1,
} as const;

type EspecSessao = {
  visitante: string;
  diasAtras: number;
  vistas: string[];
  cliques: { subtipo: string; botao: string; texto: string; posicao: string }[];
  /**
   * `telefone` é opcional de propósito: a diferença entre um contato com um só
   * caminho e um com os dois é o que o funil de qualidade mede, e sem um caso
   * de cada na massa esse indicador seria sempre zero — um número que não pode
   * variar não prova consulta nenhuma.
   */
  envios: { email: string; nome: string; telefone?: string }[];
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

/**
 * Site Beta: pouca coisa, só para provar que os filtros separam os sites — e um
 * caso que só existe aqui.
 *
 * A terceira sessão ENVIA SEM CLICAR EM NADA. É o caso que justifica a etapa
 * "interagiram" do funil ser "clicou OU enviou": se ela fosse só "clicou", esta
 * sessão ficaria de fora e a etapa seguinte (enviaram) seria MAIOR que ela — um
 * funil invertido, desenhando perda onde não houve. Em Alfa toda sessão que
 * envia também clica, então nenhum teste sobre Alfa perceberia o erro.
 *
 * Essa sessão é também o único contato da massa com e-mail E telefone.
 */
const SESSOES_BETA: EspecSessao[] = [
  { visitante: 'b1', diasAtras: 2, vistas: ['/'], cliques: [], envios: [] },
  { visitante: 'b2', diasAtras: 1, vistas: ['/', '/orcamento'],
    cliques: [{ subtipo: 'whatsapp', botao: 'cta-whatsapp-hero', texto: 'Falar no WhatsApp', posicao: 'Hero' }],
    envios: [{ email: 'davi@teste.com', nome: 'Davi Teste' }] },
  { visitante: 'b3', diasAtras: 1, vistas: ['/orcamento'],
    cliques: [],
    envios: [{ email: 'elis@teste.com', nome: 'Elis Teste', telefone: '11999990000' }] },
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

  // Âncora da massa: meio-dia de HOJE no fuso do site, não em UTC.
  //
  // Isto já esteve errado e falhava sozinho, uma vez por dia. A massa ancorava
  // em 12:00 UTC de "hoje" segundo o relógio do processo, enquanto as consultas
  // recortam a janela com `date_trunc('day', now() at time zone <fuso do site>)`
  // — veja `resolvePeriod` em src/server/metrics/queries.ts. Entre 00:00 e 03:00
  // UTC, São Paulo ainda está no dia anterior: o "dia 0" da massa caía num dia
  // futuro, saía da janela de 7 dias, e quatro testes numéricos quebravam.
  //
  // Quem responde que dia é hoje passa a ser o Postgres, com o mesmo fuso e a
  // mesma função que a consulta usa. O meio-dia dá 12 horas de folga para cada
  // lado, então nenhum evento encosta na borda do dia.
  const { rows: ancora } = await db.query<{ hoje: Date }>(
    `select (date_trunc('day', now() at time zone $1) + interval '12 hours') at time zone $1 as hoje`,
    [FUSO_DA_MASSA],
  );
  const hoje = ancora[0].hoje;

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
       values ($1, $2, $3, $4, $5, $7, $6, now())`,
      [siteId, accountId, clientId, nome, dominio, publicId, FUSO_DA_MASSA],
    );
    return siteId;
  }

  /**
   * Um acompanhamento que a MEDIÇÃO fechou — o rastro histórico que o sistema
   * real deixa quando uma análise nova não encontra mais o problema.
   *
   * Está na massa porque sem ele o painel "Fechadas pela medição" não renderiza
   * em teste nenhum: ele só existe quando há o que mostrar. E é justamente a
   * tela que prova que o ciclo se fecha — marcar, corrigir, medir de novo.
   *
   * Não cria item na lista de pendências: `optimizations` entra por `left join`
   * sobre os sinais, e o sinal desta linha não existe mais. É exatamente o que
   * a linha afirma.
   */
  async function semearResolvidaPorVerificacao(accountId: string, siteId: string) {
    await db.query(
      `insert into optimizations
         (account_id, site_id, url, dispositivo, tipo, titulo, prioridade, status, proxima_acao,
          evidencia, detectado_em, atualizado_em)
       values ($1, $2, 'https://alfa.teste/planos', 'mobile', 'tecnico',
               'Desempenho baixo em página monitorada', 1,
               'resolvida_por_verificacao', 'Abrir Qualidade técnica e ver os diagnósticos',
               jsonb_build_object(
                 'texto', 'Nota 34/100 no celular',
                 'em', to_jsonb(now() - interval '9 days'),
                 'resolvidoPor', 'nova medição',
                 'resolvidoEm', to_jsonb(now() - interval '2 days'),
                 'notaDepois', 91
               ),
               now() - interval '9 days', now() - interval '2 days')`,
      [accountId, siteId],
    );
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
          `insert into leads (account_id, site_id, client_id, name, email, phone, dedupe_key,
                              first_seen_at, last_seen_at)
                values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           on conflict (site_id, dedupe_key) do update set last_seen_at = excluded.last_seen_at
             returning id`,
          [accountId, siteId, clientId, envio.nome, envio.email, envio.telefone ?? null, chave,
           new Date(inicio.getTime() + 600_000)],
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
  await semearResolvidaPorVerificacao(agencia, alfa);

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
