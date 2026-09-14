import 'server-only';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withAccount } from '@/server/db';

/**
 * Cadastro de clientes e sites.
 *
 * Só existe UM registro por cliente e por site. Renomear um site muda o nome em
 * todas as telas porque todas leem a mesma linha — não há cópia do nome
 * espalhada por lugar nenhum.
 */

export const ClienteEntrada = z.object({
  nome: z.string().trim().min(2, 'O nome do cliente precisa de ao menos 2 caracteres.').max(160),
  observacoes: z.string().trim().max(2000).optional().or(z.literal('')),
});
export type ClienteEntrada = z.infer<typeof ClienteEntrada>;

export const SiteEntrada = z.object({
  clienteId: z.string().uuid('Selecione um cliente.'),
  nome: z.string().trim().min(2, 'Informe um nome para o site.').max(160),
  dominio: z
    .string()
    .trim()
    .min(4, 'Informe o domínio.')
    .max(253)
    .transform((v) => v.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase())
    .refine((v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), 'Domínio inválido. Exemplo: meucliente.com.br'),
  fuso: z.string().trim().min(3).max(64).default('America/Sao_Paulo'),
});
export type SiteEntrada = z.infer<typeof SiteEntrada>;

/**
 * Identificador público do site.
 *
 * Endereça o site no coletor e aparece no HTML de quem instalar — por isso não
 * é, e não pode virar, credencial. A aleatoriedade serve só para evitar
 * colisões e adivinhação casual.
 */
function gerarPublicId(): string {
  return `sit_${randomBytes(6).toString('hex')}`;
}

export async function criarCliente(accountId: string, entrada: ClienteEntrada): Promise<string> {
  return withAccount(accountId, async (db) => {
    const linha = await db.one<{ id: string }>(
      'insert into clients (account_id, name, notes) values ($1, $2, $3) returning id',
      [accountId, entrada.nome, entrada.observacoes || null],
    );
    return linha!.id;
  });
}

export async function atualizarCliente(accountId: string, id: string, entrada: ClienteEntrada): Promise<boolean> {
  return withAccount(accountId, async (db) => {
    // Sem `account_id` no WHERE: a RLS já restringe a linha à conta da sessão.
    // Um id de outra conta não encontra nada e devolve false.
    const linha = await db.one<{ id: string }>(
      'update clients set name = $2, notes = $3 where id = $1 and archived_at is null returning id',
      [id, entrada.nome, entrada.observacoes || null],
    );
    return linha !== null;
  });
}

export async function arquivarCliente(accountId: string, id: string): Promise<{ ok: boolean; motivo?: string }> {
  return withAccount(accountId, async (db) => {
    const sites = await db.one<{ total: number }>(
      'select count(*)::int as total from sites where client_id = $1 and archived_at is null',
      [id],
    );
    // Arquivar um cliente que ainda tem site ativo deixaria eventos órfãos de
    // dono na interface. Exigimos que os sites saiam antes.
    if ((sites?.total ?? 0) > 0) {
      return { ok: false, motivo: `Este cliente ainda tem ${sites!.total} site(s) ativo(s). Arquive os sites primeiro.` };
    }
    const linha = await db.one<{ id: string }>(
      'update clients set archived_at = now() where id = $1 and archived_at is null returning id',
      [id],
    );
    return { ok: linha !== null };
  });
}

export type SiteCriado = { id: string; publicId: string };

export async function criarSite(accountId: string, entrada: SiteEntrada): Promise<SiteCriado> {
  return withAccount(accountId, async (db) => {
    // O cliente precisa ser da mesma conta. A RLS garante isso: se não for, a
    // consulta não devolve linha e paramos antes de criar o site.
    const cliente = await db.one<{ id: string }>(
      'select id from clients where id = $1 and archived_at is null',
      [entrada.clienteId],
    );
    if (!cliente) throw new Error('Cliente não encontrado nesta conta.');

    const linha = await db.one<SiteCriado>(
      `insert into sites (account_id, client_id, name, domain, timezone, public_id)
            values ($1, $2, $3, $4, $5, $6)
         returning id, public_id as "publicId"`,
      [accountId, entrada.clienteId, entrada.nome, entrada.dominio, entrada.fuso, gerarPublicId()],
    );
    return linha!;
  });
}

export async function atualizarSite(accountId: string, id: string, entrada: SiteEntrada): Promise<boolean> {
  return withAccount(accountId, async (db) => {
    const cliente = await db.one<{ id: string }>(
      'select id from clients where id = $1 and archived_at is null',
      [entrada.clienteId],
    );
    if (!cliente) throw new Error('Cliente não encontrado nesta conta.');

    const linha = await db.one<{ id: string }>(
      `update sites set client_id = $2, name = $3, domain = $4, timezone = $5
        where id = $1 and archived_at is null
    returning id`,
      [id, entrada.clienteId, entrada.nome, entrada.dominio, entrada.fuso],
    );
    return linha !== null;
  });
}

export async function arquivarSite(accountId: string, id: string): Promise<boolean> {
  return withAccount(accountId, async (db) => {
    const linha = await db.one<{ id: string }>(
      'update sites set archived_at = now() where id = $1 and archived_at is null returning id',
      [id],
    );
    return linha !== null;
  });
}

/**
 * Marca que o operador já viu o snippet de instalação.
 *
 * Isso muda o estado de "aguardando instalação" para "aguardando primeiro
 * evento" — e só isso. Não afirma que o script foi instalado, porque o painel
 * não tem como saber disso antes de um evento chegar.
 */
export async function registrarSnippetVisto(accountId: string, siteId: string): Promise<void> {
  await withAccount(accountId, async (db) => {
    await db.query(
      'update sites set snippet_seen_at = coalesce(snippet_seen_at, now()) where id = $1',
      [siteId],
    );
  });
}
