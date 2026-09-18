import 'server-only';
import webpush from 'web-push';
import type { Queryable } from '@/server/db';
import { listarAvisos } from '@/server/services/avisos';
import { listarSites } from '@/server/services/sites';
import { novosParaEnviar, mensagensParaPush } from '@/lib/push';

export * from '@/lib/push';

/**
 * Chaves VAPID: a pública vai ao navegador; a privada NUNCA sai daqui. Sem as
 * duas, push está indisponível — e a tela diz isso, em vez de prometer.
 */
export function pushConfigurado(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function chavePublicaVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function prepararVapid(): boolean {
  if (!pushConfigurado()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:contato@example.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

export type InscricaoRecebida = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Grava (ou renova) a inscrição deste navegador para ESTE usuário. O
 * `endpoint` é único no mundo; se já existia de outro usuário desta conta
 * (mesmo navegador, outra sessão), passa a ser dele — o navegador é de quem
 * está logado agora.
 */
export async function salvarInscricao(
  db: Queryable,
  userId: string,
  inscricao: InscricaoRecebida,
  userAgent: string | null,
): Promise<void> {
  await db.query(
    `insert into push_subscriptions (account_id, user_id, endpoint, p256dh, auth, user_agent)
     values (app.current_account_id(), $1, $2, $3, $4, $5)
     on conflict (endpoint) do update
       set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
           user_agent = excluded.user_agent`,
    [userId, inscricao.endpoint, inscricao.keys.p256dh, inscricao.keys.auth, userAgent],
  );
}

export async function removerInscricao(db: Queryable, userId: string, endpoint: string): Promise<boolean> {
  const r = await db.query<{ id: string }>(
    'delete from push_subscriptions where endpoint = $1 and user_id = $2 returning id',
    [endpoint, userId],
  );
  return r.length > 0;
}

export type Dispositivo = { id: string; userAgent: string | null; criadaEm: Date; ultimoOk: Date | null; endpoint: string };

/** Os dispositivos DESTE usuário — nunca os de outro, mesmo na mesma conta. */
export async function listarDispositivos(db: Queryable, userId: string): Promise<Dispositivo[]> {
  return db.query<Dispositivo>(
    `select id, user_agent as "userAgent", criada_em as "criadaEm", ultimo_ok as "ultimoOk", endpoint
       from push_subscriptions where user_id = $1 order by criada_em desc`,
    [userId],
  );
}

type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Envia para TODAS as inscrições da conta. 404/410 do serviço de push
 * significam inscrição morta (navegador revogou, app desinstalado): remove.
 * Outros erros só registram — o cron tenta de novo amanhã.
 */
async function enviarParaTodas(db: Queryable, corpo: { titulo: string; corpo: string; url: string }): Promise<number> {
  const inscricoes = await db.query<Inscricao>('select id, endpoint, p256dh, auth from push_subscriptions');
  let enviadas = 0;
  for (const i of inscricoes) {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(corpo),
        { TTL: 60 * 60 * 24 },
      );
      await db.query('update push_subscriptions set ultimo_ok = now() where id = $1', [i.id]);
      enviadas += 1;
    } catch (erro) {
      const status = (erro as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.query('delete from push_subscriptions where id = $1', [i.id]);
      } else {
        console.error('[push] falha ao enviar', status ?? String(erro).slice(0, 120));
      }
    }
  }
  return enviadas;
}

/**
 * Avisa a conta sobre avisos de gravidade ALTA que ainda não foram avisados.
 *
 * Roda dentro de `withAccount`: os avisos são derivados aqui (mesma função do
 * sino), as inscrições são as desta conta, e o registro do que já foi enviado
 * é por conta. Devolve quantas notificações saíram — zero quando nada mudou.
 */
export async function notificarAvisosCriticos(db: Queryable, accountId: string): Promise<number> {
  if (!prepararVapid()) return 0;
  const inscritos = await db.one<{ n: number }>('select count(*)::int as n from push_subscriptions');
  if (!inscritos || inscritos.n === 0) return 0;

  const avisos = (await listarAvisos(accountId)).filter((a) => a.gravidade === 'alta');
  const jaEnviadas = (await db.query<{ chave: string }>('select chave from push_enviados')).map((r) => r.chave);
  const { enviar, limpar } = novosParaEnviar(avisos.map((a) => a.chave), jaEnviadas);

  if (limpar.length) await db.query('delete from push_enviados where chave = any($1::text[])', [limpar]);
  if (enviar.length === 0) return 0;

  const sites = await listarSites(accountId);
  const clienteDe = new Map(sites.map((s) => [s.id, s.clientId]));
  const novos = avisos.filter((a) => enviar.includes(a.chave));
  const mensagens = mensagensParaPush(novos, (a) => clienteDe.get(a.siteId) ?? '');

  let total = 0;
  for (const m of mensagens) {
    total += await enviarParaTodas(db, { titulo: m.titulo, corpo: m.corpo, url: m.url });
  }
  // Registra as chaves DEPOIS de tentar enviar; falha total (todas as
  // inscrições mortas) não registra, e amanhã tenta de novo.
  if (total > 0) {
    for (const chave of enviar) {
      await db.query('insert into push_enviados (account_id, chave) values (app.current_account_id(), $1) on conflict do nothing', [chave]);
    }
  }
  return total;
}
