import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { withIngest, withForms, withAccount } from '@/server/db';
import {
  resolverSite,
  registrarEvento,
  registrarSubmissao,
  normalizarCaminho,
  chaveLead,
  EventoRecebido,
  SubmissaoRecebida,
} from '@/server/services/ingestao';
import { resolvePeriod, getKpis } from '@/server/metrics/queries';
import { prepararBancoDeTeste, MASSA } from '../../scripts/test-db';
import { Client } from 'pg';

/** Ingestão: idempotência, regra de sessão, validação e privacidade. */

let contaDoSite: string;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const r = await admin.query<{ account_id: string }>('select account_id from sites where public_id = $1', [
    MASSA.siteSemColeta,
  ]);
  contaDoSite = r.rows[0]!.account_id;
  await admin.end();
});

const eventoBase = (extras: Partial<Record<string, unknown>> = {}) => ({
  site: MASSA.siteSemColeta,
  tipo: 'page_view' as const,
  uid: randomUUID(),
  visitante: randomUUID(),
  caminho: '/',
  ...extras,
});

async function gravar(evento: Record<string, unknown>) {
  return withIngest(async (db) => {
    const site = await resolverSite(db, String(evento.site));
    return registrarEvento(db, site!, EventoRecebido.parse(evento));
  });
}

describe('normalização de caminhos', () => {
  it('trata variações da mesma página como uma só', () => {
    expect(normalizarCaminho('/planos')).toBe('/planos');
    expect(normalizarCaminho('/planos/')).toBe('/planos');
    expect(normalizarCaminho('/planos?utm_source=x')).toBe('/planos');
    expect(normalizarCaminho('/planos#preco')).toBe('/planos');
    expect(normalizarCaminho('https://site.com.br/planos?a=1')).toBe('/planos');
  });

  it('preserva a raiz e conserta caminho sem barra inicial', () => {
    expect(normalizarCaminho('/')).toBe('/');
    expect(normalizarCaminho('planos')).toBe('/planos');
  });
});

describe('chave de deduplicação de lead', () => {
  it('normaliza e-mail e ignora formatação do telefone', () => {
    expect(chaveLead('Ana@Exemplo.COM ')).toBe('email:ana@exemplo.com');
    expect(chaveLead(undefined, '(11) 99999-1234')).toBe('tel:11999991234');
    expect(chaveLead(undefined, '11999991234')).toBe('tel:11999991234');
  });

  it('prefere o e-mail quando os dois existem', () => {
    expect(chaveLead('ana@x.com', '11999991234')).toBe('email:ana@x.com');
  });
});

describe('idempotência de eventos', () => {
  it('o mesmo uid reenviado grava uma linha só', async () => {
    const uid = randomUUID();
    const visitante = randomUUID();

    const primeiro = await gravar(eventoBase({ uid, visitante }));
    const segundo = await gravar(eventoBase({ uid, visitante }));
    const terceiro = await gravar(eventoBase({ uid, visitante }));

    expect(primeiro.duplicado).toBe(false);
    expect(segundo.duplicado).toBe(true);
    expect(terceiro.duplicado).toBe(true);

    const linhas = await withIngest((db) => db.query('select id from events where event_uid = $1', [uid]));
    expect(linhas).toHaveLength(1);
  });

  it('uids diferentes do mesmo visitante contam como cliques distintos', async () => {
    const visitante = randomUUID();
    await gravar(eventoBase({ visitante, tipo: 'cta_click', subtipo: 'whatsapp', botaoId: 'b1' }));
    await gravar(eventoBase({ visitante, tipo: 'cta_click', subtipo: 'whatsapp', botaoId: 'b1' }));

    const linhas = await withIngest((db) =>
      db.query('select id from events where session_id in (select id from sessions where visitor_id = $1)', [visitante]),
    );
    expect(linhas).toHaveLength(2);
  });
});

describe('regra de sessão', () => {
  it('eventos próximos do mesmo visitante ficam na mesma sessão', async () => {
    const visitante = randomUUID();
    const a = await gravar(eventoBase({ visitante, caminho: '/' }));
    const b = await gravar(eventoBase({ visitante, caminho: '/planos' }));
    expect(a.sessionId).toBe(b.sessionId);
  });

  it('depois de 30 minutos de inatividade, abre uma sessão nova', async () => {
    const visitante = randomUUID();
    const agora = new Date();
    const antes = new Date(agora.getTime() - 45 * 60_000);

    const a = await gravar(eventoBase({ visitante, ocorridoEm: antes.toISOString() }));
    const b = await gravar(eventoBase({ visitante, ocorridoEm: agora.toISOString() }));
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it('visitantes diferentes nunca compartilham sessão', async () => {
    const a = await gravar(eventoBase({ visitante: randomUUID() }));
    const b = await gravar(eventoBase({ visitante: randomUUID() }));
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe('validação de eventos', () => {
  it('recusa cta_click sem subtipo', () => {
    const r = EventoRecebido.safeParse(eventoBase({ tipo: 'cta_click' }));
    expect(r.success).toBe(false);
  });

  it('aceita cta_click com subtipo', () => {
    expect(EventoRecebido.safeParse(eventoBase({ tipo: 'cta_click', subtipo: 'whatsapp' })).success).toBe(true);
  });

  it('recusa uid que não seja UUID', () => {
    expect(EventoRecebido.safeParse(eventoBase({ uid: 'nao-e-uuid' })).success).toBe(false);
  });

  it('não permite plantar evento no futuro', async () => {
    const futuro = new Date(Date.now() + 5 * 86_400_000);
    const visitante = randomUUID();
    await gravar(eventoBase({ visitante, ocorridoEm: futuro.toISOString() }));

    const linha = await withIngest((db) =>
      db.query<{ occurred_at: Date }>(
        'select occurred_at from events where session_id in (select id from sessions where visitor_id = $1)',
        [visitante],
      ),
    );
    // O carimbo do cliente foi descartado em favor do relógio do servidor.
    expect(linha[0]!.occurred_at.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });
});

describe('eventos de teste ficam fora das métricas', () => {
  it('um evento marcado como teste não altera os indicadores', async () => {
    const medir = () =>
      withAccount(contaDoSite, async (db) => {
        const site = await db.one<{ id: string; timezone: string }>(
          'select id, timezone from sites where public_id = $1',
          [MASSA.siteSemColeta],
        );
        const p = await resolvePeriod(db, site!.timezone, { key: '7d' });
        return getKpis(db, site!, { ...p, label: '' });
      });

    const antes = await medir();
    await gravar(eventoBase({ visitante: randomUUID(), teste: true }));
    const depois = await medir();

    expect(depois.atual.sessoes).toBe(antes.atual.sessoes);
    expect(depois.atual.visualizacoes).toBe(antes.atual.visualizacoes);
  });
});

describe('submissões de formulário', () => {
  const submissaoBase = (extras: Partial<Record<string, unknown>> = {}) => ({
    nome: 'Fulano de Tal',
    email: 'fulano@teste.com',
    formulario: 'Fale conosco',
    caminho: '/contato',
    visitante: randomUUID(),
    idempotencia: randomUUID(),
    ...extras,
  });

  async function enviar(dados: Record<string, unknown>) {
    return withForms(async (db) => {
      const site = await resolverSite(db, MASSA.siteSemColeta);
      return registrarSubmissao(db, site!, SubmissaoRecebida.parse(dados));
    });
  }

  it('exige nome e ao menos uma forma de contato', () => {
    expect(SubmissaoRecebida.safeParse(submissaoBase({ nome: 'A' })).success).toBe(false);
    expect(SubmissaoRecebida.safeParse(submissaoBase({ email: '', telefone: '' })).success).toBe(false);
    expect(SubmissaoRecebida.safeParse(submissaoBase({ email: '', telefone: '11999991234' })).success).toBe(true);
  });

  it('recusa e-mail malformado', () => {
    expect(SubmissaoRecebida.safeParse(submissaoBase({ email: 'nao-e-email' })).success).toBe(false);
  });

  it('cria a submissão e o lead correspondente', async () => {
    const dados = submissaoBase({ email: `novo-${randomUUID()}@teste.com` });
    const r = await enviar(dados);

    expect(r.duplicada).toBe(false);
    expect(r.leadId).toBeTruthy();

    const lead = await withForms((db) => db.one('select email from leads where id = $1', [r.leadId]));
    expect(lead).toBeTruthy();
  });

  it('reenviar a mesma chave não cria segunda submissão nem segundo lead', async () => {
    const dados = submissaoBase({ email: `reenvio-${randomUUID()}@teste.com` });

    const primeiro = await enviar(dados);
    const segundo = await enviar(dados);

    expect(primeiro.duplicada).toBe(false);
    expect(segundo.duplicada).toBe(true);
    expect(segundo.submissionId).toBe(primeiro.submissionId);

    const linhas = await withForms((db) =>
      db.query('select id from form_submissions where idempotency_key = $1', [dados.idempotencia]),
    );
    expect(linhas).toHaveLength(1);
  });

  it('o mesmo contato enviando duas vezes gera duas submissões e UM lead', async () => {
    const email = `mesmo-contato-${randomUUID()}@teste.com`;
    const a = await enviar(submissaoBase({ email }));
    const b = await enviar(submissaoBase({ email }));

    expect(a.submissionId).not.toBe(b.submissionId);
    expect(a.leadId).toBe(b.leadId);
  });

  it('o evento de analytics da submissão não carrega dados do formulário', async () => {
    const visitante = randomUUID();
    // Abre uma sessão primeiro, para a submissão ter onde se anexar.
    await gravar(eventoBase({ visitante, caminho: '/contato' }));
    const idem = randomUUID();
    await enviar(submissaoBase({ visitante, idempotencia: idem, email: `privado-${randomUUID()}@teste.com`, mensagem: 'segredo comercial' }));

    const evento = await withForms((db) =>
      db.one<Record<string, unknown>>('select * from events where event_uid = $1', [idem]),
    );

    expect(evento).toBeTruthy();
    expect(evento!.type).toBe('form_submit_success');
    // Nenhuma coluna do evento guarda conteúdo do formulário.
    const serializado = JSON.stringify(evento);
    expect(serializado).not.toContain('segredo comercial');
    expect(serializado).not.toContain('privado-');
  });
});
