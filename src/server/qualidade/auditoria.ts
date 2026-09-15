import 'server-only';
import type { Queryable } from '@/server/db';
import { validarUrlPublica, MOTIVO_LABEL } from './url-publica';
import type { Estrategia, ResultadoPageSpeed } from './pagespeed';

/**
 * Fila de auditorias.
 *
 * O estado vive no banco, não em memória. Um processo que guarda a tarefa num
 * array morre junto com a invocação serverless — e a tarefa some sem deixar
 * rastro. Aqui, se o processo morrer no meio, o job fica em `executando` com
 * `iniciado_em` preenchido, e a retomada consegue enxergá-lo.
 */

export type StatusJob = 'pendente' | 'executando' | 'sucesso' | 'erro';

export type Job = {
  id: string;
  site_id: string;
  url: string;
  strategy: Estrategia;
  status: StatusJob;
  tentativas: number;
  erro: string | null;
};

export type Enfileiramento =
  | { ok: true; jobId: string; jaExistia: boolean }
  | { ok: false; erro: string };

/** Depois disto, um job `executando` é considerado abandonado por um processo morto. */
const MINUTOS_ATE_ABANDONO = 10;
export const MAX_TENTATIVAS = 3;

/**
 * Enfileira uma análise.
 *
 * Três verificações, nesta ordem, e todas no servidor:
 *
 * 1. A URL é pública e bem formada (contra SSRF).
 * 2. A URL está cadastrada em `monitored_urls` daquele site. Não basta ser
 *    pública: auditar qualquer endereço seria um endpoint aberto consumindo a
 *    quota da conta.
 * 3. O site pertence à conta da sessão — garantido pela RLS, porque a consulta
 *    roda dentro de `withAccount`.
 *
 * A deduplicação é do índice único parcial, não de um `select` antes do
 * `insert`: entre o select e o insert cabe outra requisição.
 */
export async function enfileirar(
  db: Queryable,
  entrada: { siteId: string; url: string; strategy: Estrategia; origem?: 'manual' | 'agendada' },
): Promise<Enfileiramento> {
  const validada = validarUrlPublica(entrada.url);
  if (!validada.ok) return { ok: false, erro: MOTIVO_LABEL[validada.motivo] };

  const cadastrada = await db.one<{ id: string }>(
    'select id from monitored_urls where site_id = $1 and url = $2',
    [entrada.siteId, validada.url],
  );
  if (!cadastrada) {
    return { ok: false, erro: 'Esta URL não está cadastrada para monitoramento neste site.' };
  }

  const inserido = await db.one<{ id: string }>(
    `insert into audit_jobs (account_id, site_id, url, strategy, origem)
     select app.current_account_id(), $1, $2, $3, $4
     on conflict (site_id, url, strategy) where status in ('pendente','executando')
     do nothing
     returning id`,
    [entrada.siteId, validada.url, entrada.strategy, entrada.origem ?? 'manual'],
  );

  if (inserido) return { ok: true, jobId: inserido.id, jaExistia: false };

  // Conflito: já há tarefa equivalente em andamento. Devolver o id dela é o que
  // faz um clique repetido ser inofensivo em vez de virar fila duplicada.
  const existente = await db.one<{ id: string }>(
    `select id from audit_jobs
      where site_id = $1 and url = $2 and strategy = $3
        and status in ('pendente','executando')
      limit 1`,
    [entrada.siteId, validada.url, entrada.strategy],
  );
  return existente
    ? { ok: true, jobId: existente.id, jaExistia: true }
    : { ok: false, erro: 'Não foi possível enfileirar a análise.' };
}

/**
 * Reivindica UM job para processar.
 *
 * `for update skip locked` é o que impede duas invocações simultâneas pegarem
 * o mesmo: quem chegar depois pula a linha travada em vez de esperar por ela.
 *
 * Também recupera jobs presos em `executando` há mais de dez minutos — o
 * sintoma de um processo que morreu no meio, que na Vercel acontece quando a
 * função estoura o tempo máximo.
 */
export async function reivindicarProximo(db: Queryable): Promise<Job | null> {
  return db.one<Job>(
    `update audit_jobs
        set status = 'executando',
            iniciado_em = now(),
            tentativas = tentativas + 1
      where id = (
        select id from audit_jobs
         where status = 'pendente'
            or (status = 'executando' and iniciado_em < now() - make_interval(mins => $1::int))
         order by criado_em
         limit 1
         for update skip locked
      )
      returning id, site_id, url, strategy, status, tentativas, erro`,
    [MINUTOS_ATE_ABANDONO],
  );
}

/** Grava o resultado. A análise anterior continua na tabela: histórico não se apaga. */
export async function registrarSucesso(
  db: Queryable,
  job: Job,
  r: ResultadoPageSpeed,
  auditorias: unknown,
): Promise<void> {
  await db.query(
    `insert into lighthouse_results
       (account_id, site_id, job_id, url_solicitada, url_final, strategy, lighthouse_version,
        performance, acessibilidade, boas_praticas, seo,
        lcp_ms, fcp_ms, tbt_ms, cls, speed_index_ms, tti_ms, auditorias, avisos)
     values (app.current_account_id(), $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [
      job.site_id, job.id, r.urlSolicitada || job.url, r.urlFinal || job.url, r.estrategia,
      r.versaoLighthouse,
      r.notas.performance, r.notas.acessibilidade, r.notas.boasPraticas, r.notas.seo,
      r.metricas.lcpMs, r.metricas.fcpMs, r.metricas.tbtMs, r.metricas.cls,
      r.metricas.speedIndexMs, r.metricas.ttiMs,
      JSON.stringify(auditorias ?? {}), JSON.stringify(r.avisos),
    ],
  );
  await db.query(
    `update audit_jobs set status = 'sucesso', erro = null, concluido_em = now() where id = $1`,
    [job.id],
  );
}

/**
 * Marca falha. NÃO toca em `lighthouse_results`: a última análise válida
 * continua lá, e é ela que a tela mostra, identificada como antiga.
 */
export async function registrarFalha(db: Queryable, job: Job, motivo: string): Promise<void> {
  const esgotou = job.tentativas >= MAX_TENTATIVAS;
  await db.query(
    `update audit_jobs
        set status = case when $2 then 'erro' else 'pendente' end,
            erro = $3,
            concluido_em = case when $2 then now() else null end
      where id = $1`,
    [job.id, esgotou, motivo.slice(0, 500)],
  );
}

export type UltimaAnalise = {
  url_solicitada: string;
  strategy: Estrategia;
  performance: string | null;
  acessibilidade: string | null;
  boas_praticas: string | null;
  seo: string | null;
  lcp_ms: string | null;
  cls: string | null;
  tbt_ms: string | null;
  lighthouse_version: string | null;
  medido_em: Date;
};

/** A análise mais recente de cada (url, dispositivo). Mobile e desktop nunca se sobrescrevem. */
export async function ultimasAnalises(db: Queryable, siteId: string): Promise<UltimaAnalise[]> {
  return db.query<UltimaAnalise>(
    `select distinct on (url_solicitada, strategy)
            url_solicitada, strategy, performance, acessibilidade, boas_praticas, seo,
            lcp_ms, cls, tbt_ms, lighthouse_version, medido_em
       from lighthouse_results
      where site_id = $1
      order by url_solicitada, strategy, medido_em desc`,
    [siteId],
  );
}
