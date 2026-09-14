import 'server-only';
import { z } from 'zod';
import type { Queryable } from '@/server/db';

/**
 * Ingestão de eventos e submissões.
 *
 * Regras que valem para tudo aqui:
 *
 *  - IDEMPOTÊNCIA. Cada gesto do usuário carrega um uid gerado no navegador.
 *    Reenvio por instabilidade de rede, script instalado duas vezes e retry do
 *    sendBeacon colapsam no mesmo evento. Um clique nunca vira dois.
 *  - PRIVACIDADE. Eventos de analytics não carregam nome, telefone, e-mail nem
 *    conteúdo de formulário. Esses dados entram apenas pelo endpoint de
 *    formulários, que os grava na submissão e no lead.
 *  - HONESTIDADE. Clique no WhatsApp registra intenção de contato, não conversa
 *    iniciada. Abertura de formulário não é envio. São eventos distintos.
 */

/** Sessão expira após 30 minutos de inatividade. */
const JANELA_SESSAO_MIN = 30;

const TIPOS = ['page_view', 'cta_click'] as const;
const SUBTIPOS = ['whatsapp', 'phone', 'email', 'form_open', 'outro'] as const;

/** Remove caracteres de controle de texto livre vindo da web. */
const CONTROLES = /[\p{Cc}\p{Cf}]/gu;

const textoCurto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v.replace(CONTROLES, ''))
    .optional();

export const EventoRecebido = z
  .object({
    site: z.string().min(4).max(64),
    tipo: z.enum(TIPOS),
    subtipo: z.enum(SUBTIPOS).optional(),
    /** Chave de idempotência do gesto. */
    uid: z.string().uuid(),
    /** Identificador do navegador, gerado no cliente. Não é identidade pessoal. */
    visitante: z.string().min(8).max(64),
    caminho: z.string().trim().min(1).max(512),
    ocorridoEm: z.string().datetime().optional(),
    referenciador: textoCurto(256),
    utmSource: textoCurto(128),
    utmMedium: textoCurto(128),
    utmCampaign: textoCurto(128),
    botaoId: textoCurto(128),
    botaoTexto: textoCurto(160),
    botaoPosicao: textoCurto(64),
    dispositivo: z.enum(['Celular', 'Desktop', 'Tablet']).optional(),
    teste: z.boolean().optional(),
  })
  // cta_click sem subtipo seria um clique que não se sabe classificar — e a
  // tabela por botão não teria como declarar seu escopo.
  .refine((e) => e.tipo !== 'cta_click' || !!e.subtipo, {
    message: 'cta_click exige subtipo',
    path: ['subtipo'],
  });

export type EventoRecebido = z.infer<typeof EventoRecebido>;

export type SitePublico = {
  id: string;
  accountId: string;
  clientId: string;
  domain: string;
  timezone: string;
  publicId: string;
};

/** Resolve o identificador público. Ele endereça o site; não é credencial. */
export async function resolverSite(db: Queryable, publicId: string): Promise<SitePublico | null> {
  return db.one<SitePublico>(
    `select id, account_id as "accountId", client_id as "clientId", domain, timezone,
            public_id as "publicId"
       from sites
      where public_id = $1 and archived_at is null`,
    [publicId],
  );
}

/**
 * Normaliza o caminho para que "/planos", "/planos/" e "/planos?x=1" não virem
 * três páginas distintas na tabela de desempenho.
 */
export function normalizarCaminho(bruto: string): string {
  let caminho = bruto.trim();
  try {
    caminho = caminho.startsWith('http') ? new URL(caminho).pathname : caminho.split('?')[0]!.split('#')[0]!;
  } catch {
    caminho = caminho.split('?')[0]!.split('#')[0]!;
  }
  if (!caminho.startsWith('/')) caminho = `/${caminho}`;
  if (caminho.length > 1) caminho = caminho.replace(/\/+$/, '') || '/';
  return caminho.slice(0, 512);
}

async function garantirPagina(db: Queryable, site: SitePublico, caminho: string): Promise<string> {
  const normalizado = normalizarCaminho(caminho);
  // DO NOTHING em vez de DO UPDATE de propósito: um upsert que atualiza exigiria
  // privilégio de UPDATE em `pages` para os papéis públicos de ingestão, e não há
  // nada a atualizar aqui. Menos privilégio, mesmo resultado.
  const inserida = await db.one<{ id: string }>(
    `insert into pages (account_id, site_id, path)
          values ($1, $2, $3)
     on conflict (site_id, path) do nothing
       returning id`,
    [site.accountId, site.id, normalizado],
  );
  if (inserida) return inserida.id;

  const existente = await db.one<{ id: string }>(
    'select id from pages where site_id = $1 and path = $2',
    [site.id, normalizado],
  );
  if (!existente) throw new Error(`Não foi possível resolver a página ${normalizado}.`);
  return existente.id;
}

/** Origem legível a partir de UTM ou referenciador. Sem inferência criativa. */
function derivarOrigem(evento: EventoRecebido): {
  source: string;
  medium: string | null;
  referrerHost: string | null;
} {
  const host = (() => {
    if (!evento.referenciador) return null;
    try {
      return new URL(evento.referenciador).hostname.replace(/^www\./, '').slice(0, 128);
    } catch {
      return null;
    }
  })();

  if (evento.utmSource) {
    return {
      source: `${evento.utmSource}${evento.utmMedium ? ` / ${evento.utmMedium}` : ''}`,
      medium: evento.utmMedium ?? null,
      referrerHost: host,
    };
  }
  if (host) return { source: `${host} / referral`, medium: 'referral', referrerHost: host };
  // Sem UTM e sem referenciador é acesso direto, e dizemos isso.
  // "Não identificado" fica para o que chega ilegível.
  return { source: 'direto', medium: null, referrerHost: null };
}

export type ResultadoEvento = { sessionId: string; duplicado: boolean };

export async function registrarEvento(
  db: Queryable,
  site: SitePublico,
  evento: EventoRecebido,
): Promise<ResultadoEvento> {
  const ocorridoEm = evento.ocorridoEm ? new Date(evento.ocorridoEm) : new Date();
  const agora = new Date();
  // Um relógio adiantado no cliente não pode plantar eventos no futuro nem
  // reescrever o passado distante.
  const limiteAntigo = new Date(agora.getTime() - 7 * 86_400_000);
  const carimbo = ocorridoEm > agora || ocorridoEm < limiteAntigo ? agora : ocorridoEm;

  const pageId = await garantirPagina(db, site, evento.caminho);
  const origem = derivarOrigem(evento);
  const teste = evento.teste === true;

  const aberta = await db.one<{ id: string }>(
    `select id from sessions
      where site_id = $1 and visitor_id = $2 and is_test = $4
        and last_seen_at > $3::timestamptz - make_interval(mins => $5)
      order by last_seen_at desc
      limit 1`,
    [site.id, evento.visitante, carimbo, teste, JANELA_SESSAO_MIN],
  );

  let sessionId: string;
  if (aberta) {
    sessionId = aberta.id;
    // `greatest` evita que um evento atrasado empurre a sessão para trás.
    await db.query('update sessions set last_seen_at = greatest(last_seen_at, $2) where id = $1', [
      sessionId,
      carimbo,
    ]);
  } else {
    const nova = await db.one<{ id: string }>(
      `insert into sessions (account_id, site_id, visitor_id, started_at, last_seen_at,
                             source, medium, campaign, referrer_host, device, entry_page_id, is_test)
            values ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11)
         returning id`,
      [
        site.accountId, site.id, evento.visitante, carimbo, origem.source, origem.medium,
        evento.utmCampaign ?? null, origem.referrerHost, evento.dispositivo ?? 'Desconhecido',
        pageId, teste,
      ],
    );
    sessionId = nova!.id;
  }

  const inserido = await db.one<{ id: string }>(
    `insert into events (account_id, site_id, session_id, page_id, type, subtype,
                         button_id, button_text, button_position, occurred_at, event_uid, is_test)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (event_uid) do nothing
       returning id`,
    [
      site.accountId, site.id, sessionId, pageId, evento.tipo, evento.subtipo ?? null,
      evento.botaoId ?? null, evento.botaoTexto ?? null, evento.botaoPosicao ?? null,
      carimbo, evento.uid, teste,
    ],
  );

  return { sessionId, duplicado: inserido === null };
}

// ───────────────────────── formulários ─────────────────────────

export const SubmissaoRecebida = z
  .object({
    formulario: z.string().trim().min(1).max(120).default('Formulário'),
    nome: z.string().trim().min(2, 'Informe o nome.').max(160),
    email: z.string().trim().email('Informe um e-mail válido.').max(254).optional().or(z.literal('')),
    telefone: z.string().trim().max(40).optional().or(z.literal('')),
    mensagem: z.string().trim().max(4000).optional(),
    caminho: z.string().trim().min(1).max(512).default('/'),
    visitante: z.string().min(8).max(64),
    /** Reenviar o mesmo formulário não cria segunda submissão nem lead novo. */
    idempotencia: z.string().uuid(),
    teste: z.boolean().optional(),
  })
  .refine((s) => !!s.email || !!s.telefone, {
    message: 'Informe e-mail ou telefone para que o contato seja localizável.',
    path: ['email'],
  });

export type SubmissaoRecebida = z.infer<typeof SubmissaoRecebida>;

/**
 * Chave de deduplicação do lead dentro do site: e-mail normalizado, ou
 * telefone só com dígitos quando não há e-mail.
 */
export function chaveLead(email?: string, telefone?: string): string {
  if (email) return `email:${email.trim().toLowerCase()}`;
  return `tel:${(telefone ?? '').replace(/\D/g, '')}`;
}

export type ResultadoSubmissao = { submissionId: string; leadId: string; duplicada: boolean };

/**
 * Persiste a submissão e cria ou associa o lead.
 *
 * Roda inteiro numa transação: se qualquer passo falhar, nada é gravado e o
 * chamador recebe erro. Uma falha de persistência não pode virar mensagem de
 * sucesso nem contar como conversão.
 */
export async function registrarSubmissao(
  db: Queryable,
  site: SitePublico,
  dados: SubmissaoRecebida,
): Promise<ResultadoSubmissao> {
  const agora = new Date();
  const teste = dados.teste === true;

  const jaExiste = await db.one<{ id: string; lead_id: string | null }>(
    'select id, lead_id from form_submissions where idempotency_key = $1',
    [dados.idempotencia],
  );
  if (jaExiste) {
    return { submissionId: jaExiste.id, leadId: jaExiste.lead_id ?? '', duplicada: true };
  }

  const pageId = await garantirPagina(db, site, dados.caminho);

  // Anexa à sessão aberta do visitante, se houver. Sem sessão a submissão ainda
  // é gravada: perder um lead porque o analytics falhou seria pior.
  const sessao = await db.one<{ id: string }>(
    `select id from sessions
      where site_id = $1 and visitor_id = $2 and is_test = $3
        and last_seen_at > now() - make_interval(mins => $4)
      order by last_seen_at desc
      limit 1`,
    [site.id, dados.visitante, teste, JANELA_SESSAO_MIN],
  );

  const chave = chaveLead(dados.email || undefined, dados.telefone || undefined);
  const lead = await db.one<{ id: string }>(
    `insert into leads (account_id, site_id, client_id, name, email, phone, dedupe_key, first_seen_at, last_seen_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $8)
     on conflict (site_id, dedupe_key) do update
            set last_seen_at = excluded.last_seen_at,
                name  = coalesce(nullif(excluded.name, ''),  leads.name),
                email = coalesce(nullif(excluded.email, ''), leads.email),
                phone = coalesce(nullif(excluded.phone, ''), leads.phone)
       returning id`,
    [
      site.accountId, site.id, site.clientId, dados.nome,
      dados.email || null, dados.telefone || null, chave, agora,
    ],
  );

  const submissao = await db.one<{ id: string }>(
    `insert into form_submissions (account_id, site_id, session_id, page_id, lead_id, form_name,
                                   status, payload, idempotency_key, is_test, created_at)
          values ($1, $2, $3, $4, $5, $6, 'confirmada', $7, $8, $9, $10)
       returning id`,
    [
      site.accountId, site.id, sessao?.id ?? null, pageId, lead!.id, dados.formulario,
      JSON.stringify({
        nome: dados.nome,
        email: dados.email || null,
        telefone: dados.telefone || null,
        mensagem: dados.mensagem ?? null,
      }),
      dados.idempotencia, teste, agora,
    ],
  );

  // Evento de analytics correspondente, SEM conteúdo do formulário. Existe para
  // que a submissão apareça na linha do tempo da sessão.
  if (sessao) {
    await db.query(
      `insert into events (account_id, site_id, session_id, page_id, type, occurred_at, event_uid, is_test)
            values ($1, $2, $3, $4, 'form_submit_success', $5, $6, $7)
       on conflict (event_uid) do nothing`,
      [site.accountId, site.id, sessao.id, pageId, agora, dados.idempotencia, teste],
    );
  }

  return { submissionId: submissao!.id, leadId: lead!.id, duplicada: false };
}
