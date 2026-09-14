import 'server-only';
import { withAccount, type Queryable } from '@/server/db';

/**
 * Estado do rastreamento de um site.
 *
 * É SEMPRE derivado dos eventos realmente recebidos, nunca guardado numa coluna
 * que alguém marca ao salvar o cadastro. Cadastrar um domínio e gerar um
 * identificador não significa que o script foi instalado — e o painel não pode
 * afirmar que significa.
 */
export type EstadoRastreamento =
  | 'aguardando_instalacao'
  | 'aguardando_primeiro_evento'
  | 'evento_teste_recebido'
  | 'coletando'
  | 'sem_eventos_recentes';

export const ESTADO_LABEL: Record<EstadoRastreamento, string> = {
  aguardando_instalacao: 'Aguardando instalação',
  aguardando_primeiro_evento: 'Aguardando primeiro evento',
  evento_teste_recebido: 'Evento de teste recebido',
  coletando: 'Coletando',
  sem_eventos_recentes: 'Sem eventos recentes',
};

/** Cor do ponto indicador, na linguagem do protótipo. */
export const ESTADO_TOM: Record<EstadoRastreamento, 'ok' | 'aguardando' | 'inativo'> = {
  aguardando_instalacao: 'inativo',
  aguardando_primeiro_evento: 'aguardando',
  evento_teste_recebido: 'aguardando',
  coletando: 'ok',
  sem_eventos_recentes: 'aguardando',
};

export type Site = {
  id: string;
  clientId: string;
  clienteNome: string;
  name: string;
  domain: string;
  timezone: string;
  publicId: string;
  snippetSeenAt: Date | null;
  ultimoEvento: Date | null;
  ultimoTeste: Date | null;
  totalEventos: number;
  estado: EstadoRastreamento;
};

const SITE_COLUNAS = `
  s.id,
  s.client_id  as "clientId",
  c.name       as "clienteNome",
  s.name,
  s.domain,
  s.timezone,
  s.public_id  as "publicId",
  s.snippet_seen_at as "snippetSeenAt",
  (select max(e.occurred_at) from events e where e.site_id = s.id and not e.is_test) as "ultimoEvento",
  (select max(e.occurred_at) from events e where e.site_id = s.id and     e.is_test) as "ultimoTeste",
  (select count(*)::int     from events e where e.site_id = s.id)                    as "totalEventos"
`;

type LinhaSite = Omit<Site, 'estado'>;

/** Nunca chame isto com dados de formulário: o estado vem só do banco. */
function derivarEstado(linha: LinhaSite): EstadoRastreamento {
  if (linha.totalEventos === 0) {
    return linha.snippetSeenAt ? 'aguardando_primeiro_evento' : 'aguardando_instalacao';
  }
  if (!linha.ultimoEvento) return 'evento_teste_recebido';

  const horas = (Date.now() - linha.ultimoEvento.getTime()) / 3_600_000;
  return horas <= 48 ? 'coletando' : 'sem_eventos_recentes';
}

function comEstado(linha: LinhaSite): Site {
  return { ...linha, estado: derivarEstado(linha) };
}

export async function listarSites(accountId: string, clienteId?: string): Promise<Site[]> {
  return withAccount(accountId, async (db) => {
    const linhas = await db.query<LinhaSite>(
      `select ${SITE_COLUNAS}
         from sites s
         join clients c on c.id = s.client_id
        where s.archived_at is null
          and ($1::uuid is null or s.client_id = $1)
        order by c.name, s.name`,
      [clienteId ?? null],
    );
    return linhas.map(comEstado);
  });
}

/**
 * Um site da conta, ou null.
 *
 * Um id de outra conta devolve null porque a RLS não entrega a linha — não há
 * checagem de `account_id` no TypeScript que possa ser esquecida aqui.
 */
export async function obterSite(accountId: string, siteId: string): Promise<Site | null> {
  return withAccount(accountId, async (db) => {
    const linha = await db.one<LinhaSite>(
      `select ${SITE_COLUNAS}
         from sites s
         join clients c on c.id = s.client_id
        where s.id = $1 and s.archived_at is null`,
      [siteId],
    );
    return linha ? comEstado(linha) : null;
  });
}

export async function obterSiteNaTransacao(db: Queryable, siteId: string): Promise<Site | null> {
  const linha = await db.one<LinhaSite>(
    `select ${SITE_COLUNAS}
       from sites s
       join clients c on c.id = s.client_id
      where s.id = $1 and s.archived_at is null`,
    [siteId],
  );
  return linha ? comEstado(linha) : null;
}

export type Cliente = {
  id: string;
  name: string;
  notes: string | null;
  createdAt: Date;
  sites: number;
};

export async function listarClientes(accountId: string): Promise<Cliente[]> {
  return withAccount(accountId, async (db) =>
    db.query<Cliente>(
      `select c.id, c.name, c.notes, c.created_at as "createdAt",
              (select count(*)::int from sites s
                where s.client_id = c.id and s.archived_at is null) as sites
         from clients c
        where c.archived_at is null
        order by c.name`,
    ),
  );
}
