import 'server-only';
import type { Queryable } from '@/server/db';
import type { ChaveDoSinal } from '@/lib/otimizacoes';
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
export const MINUTOS_ATE_ABANDONO = 10;
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
 * O desfecho de um pedido de reanálise. Código, não frase: o texto vive na
 * tela, e assim o mecanismo fica testável sem depender de redação.
 */
export type PedidoDeReanalise =
  | { resultado: 'enfileirada' }
  | { resultado: 'ja_na_fila' }
  | { resultado: 'sem_pagina' }
  | { resultado: 'nao_configurado' }
  | { resultado: 'recusado'; motivo: string };

/** Os dois dispositivos, para o sinal que não é de um só. */
const AMBOS = ['mobile', 'desktop'] as const;

/**
 * Põe na fila a análise que "aguardando nova análise" acabou de prometer.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 *
 * `aguardando_nova_analise` era o único status que afirmava um ACONTECIMENTO
 * FUTURO, e não havia nada por trás dele. O agendador diário só olha URL
 * prioritária; uma página comum não é reanalisada por ninguém. Então o item
 * ficava ali, esperando para sempre um evento que nunca vinha — e, pior, dizendo
 * ao operador que estava esperando. Um status que promete e não cumpre é a mesma
 * família do `configurado: true` que este projeto recusa: estado declarado sem
 * fato por trás.
 *
 * ── O que ele recusa, e por quê ──────────────────────────────────────────────
 *
 * Sinal sem página (o de coleta vale para o site inteiro) não se resolve medindo
 * URL nenhuma. Enfileirar ali gastaria a vaga diária do plano Hobby com uma
 * medição que não responde à pergunta — e devolveria uma confirmação falsa.
 *
 * Toda recusa vira código, e a tela diz qual foi. "Registrei a situação mas não
 * consegui enfileirar" não pode virar "pronto".
 *
 * Mora aqui, e não junto da lista de otimizações, por uma razão mecânica:
 * `otimizacoes.ts` já é importado por este arquivo (o fechamento por
 * verificação), e a volta fecharia um ciclo entre os dois módulos.
 */
export async function enfileirarReanalise(
  db: Queryable,
  sinal: ChaveDoSinal,
): Promise<PedidoDeReanalise> {
  if (!sinal.url) return { resultado: 'sem_pagina' };
  if (!process.env.PAGESPEED_API_KEY) return { resultado: 'nao_configurado' };

  // Sinal com dispositivo pede aquele dispositivo. Sem dispositivo, o sinal é
  // sobre a AUSÊNCIA de análise — e aí faltam as duas, exatamente como o
  // agendador diário já trata as URLs prioritárias.
  const alvos = sinal.dispositivo ? [sinal.dispositivo] : AMBOS;
  const pedidos: Enfileiramento[] = [];
  // Em série, e não em `Promise.all`: dentro de uma transação o `Queryable`
  // serializa as consultas de qualquer jeito, e em série o segundo pedido
  // enxerga o primeiro — que é o que faz a deduplicação valer entre eles.
  for (const strategy of alvos) {
    pedidos.push(await enfileirar(db, { siteId: sinal.siteId, url: sinal.url, strategy }));
  }

  const recusado = pedidos.find((p) => !p.ok);
  if (recusado && !recusado.ok) return { resultado: 'recusado', motivo: recusado.erro };

  // Clique repetido não vira segunda tarefa — e quem chama diz isso em vez de
  // fingir que enfileirou de novo.
  return pedidos.every((p) => p.ok && p.jaExistia)
    ? { resultado: 'ja_na_fila' }
    : { resultado: 'enfileirada' };
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
  /**
   * Antes de reivindicar, encerra os abandonados que já esgotaram as tentativas.
   *
   * Sem este passo, `MAX_TENTATIVAS` só valia para o job que FALHA de um jeito
   * que o código consegue registrar — porque só `registrarFalha` o consultava. O
   * job cujo processo morre no meio (a Vercel corta a função aos 60s, e é o caso
   * comum numa página pesada) nunca chega lá: ele fica em `executando`, é
   * recuperado dez minutos depois, morre de novo, e assim indefinidamente.
   *
   * Com uma análise por dia no plano Hobby, uma única URL nessa condição consome
   * a vaga diária inteira, para sempre, e nenhuma outra análise do sistema
   * acontece. O sintoma seria "as auditorias pararam", sem erro em lugar nenhum.
   */
  await db.query(
    `update audit_jobs
        set status = 'erro',
            concluido_em = now(),
            erro = coalesce(erro, 'Abandonado após ' || tentativas || ' tentativas sem conclusão.')
      where status = 'executando'
        and iniciado_em < now() - make_interval(mins => $1::int)
        and tentativas >= $2::int`,
    [MINUTOS_ATE_ABANDONO, MAX_TENTATIVAS],
  );

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

/**
 * Grava o resultado. A análise anterior continua na tabela: histórico não se apaga.
 *
 * **Não fecha acompanhamento aqui**, e isso mudou depois de uma revisão. O
 * fechamento rodava nesta mesma transação, com o argumento de que separá-los
 * deixaria um instante com a medição boa no banco e o acompanhamento ainda "em
 * andamento". O instante é inofensivo; o custo do contrário não era: o
 * fechamento varre os sinais da CONTA inteira, e qualquer erro ou tempo
 * esgotado ali derrubava a transação — levando junto a análise que o Google
 * acabou de cobrar. O `catch` da rota então chamava `registrarFalha`, e o
 * trabalho pago sumia.
 *
 * A medição é a coisa cara e irrepetível; o fechamento é barato e tem a
 * varredura diária como rede. Quem fecha agora é a rota, depois do commit, em
 * transação própria.
 */
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

/**
 * As correções elegíveis de cada (URL, dispositivo), da análise mais recente.
 *
 * Lê `lighthouse_results.auditorias` — uma coluna que existia desde o esquema
 * inicial e que **nenhuma linha do projeto lia**. Eram 153 auditorias por
 * análise gravadas e nunca mostradas, enquanto a lista de Otimizações mandava
 * "abrir Qualidade técnica e ver os diagnósticos" numa tela que não tinha
 * diagnóstico nenhum.
 *
 * `distinct on (url, strategy)` pelo mesmo motivo de `ultimasAnalises`: a nota
 * pertence a uma URL E a um dispositivo, e a análise anterior continua na tabela
 * como histórico — mostrar as correções de uma medição velha seria pedir
 * trabalho sobre um problema que talvez já não exista.
 *
 * A separação entre correção e auditoria informativa acontece fora daqui, em
 * `src/lib/correcoes.ts`: é regra pura, e ali ela é testável sem subir banco.
 */
export type AnaliseComAuditorias = {
  url_solicitada: string;
  strategy: Estrategia;
  performance: string | null;
  auditorias: unknown;
  medido_em: Date;
};

export async function ultimasAuditorias(
  db: Queryable,
  siteId: string,
): Promise<AnaliseComAuditorias[]> {
  return db.query<AnaliseComAuditorias>(
    `select distinct on (url_solicitada, strategy)
            url_solicitada, strategy, performance, auditorias, medido_em
       from lighthouse_results
      where site_id = $1
      order by url_solicitada, strategy, medido_em desc`,
    [siteId],
  );
}

/**
 * A SÉRIE de medições de cada (URL, dispositivo) — a evidência, não o último número.
 *
 * `lighthouse_results` grava uma linha nova a cada análise de propósito, e o
 * comentário de `registrarSucesso` diz por quê. Só que toda consulta do projeto
 * lia `distinct on (…)`: o histórico era guardado para uma comparação que
 * nenhuma tela fazia.
 *
 * O teto por par existe para a tela não crescer sem limite, e quem chama
 * DEVOLVE o total junto — uma lista cortada em silêncio parece completa. É o
 * mesmo motivo pelo qual as auditorias informativas aparecem contadas em vez de
 * sumirem.
 */
export type PontoDeAnalise = {
  url_solicitada: string;
  strategy: Estrategia;
  performance: string | null;
  lcp_ms: string | null;
  tbt_ms: string | null;
  cls: string | null;
  medido_em: Date;
};

export async function historicoDeAnalises(
  db: Queryable,
  siteId: string,
  porPar: number,
): Promise<{ pontos: PontoDeAnalise[]; totais: Map<string, number> }> {
  const pontos = await db.query<PontoDeAnalise & { posicao: string }>(
    `select url_solicitada, strategy, performance, lcp_ms, tbt_ms, cls, medido_em
       from (
         select *, row_number() over (
                     partition by url_solicitada, strategy order by medido_em desc
                   ) as posicao
           from lighthouse_results
          where site_id = $1
       ) t
      where posicao <= $2::int
      order by url_solicitada, strategy, medido_em`,
    [siteId, porPar],
  );

  const contagens = await db.query<{ url_solicitada: string; strategy: Estrategia; total: string }>(
    `select url_solicitada, strategy, count(*) as total
       from lighthouse_results
      where site_id = $1
      group by url_solicitada, strategy`,
    [siteId],
  );

  return {
    pontos,
    totais: new Map(contagens.map((c) => [`${c.url_solicitada}|${c.strategy}`, Number(c.total)])),
  };
}

/** A série de campo. Mesmo desenho, e nunca misturada com a de laboratório. */
export type PontoDeCampo = {
  alvo: string;
  escopo: 'url' | 'origem';
  form_factor: string;
  lcp_p75_ms: string | null;
  inp_p75_ms: string | null;
  cls_p75: string | null;
  coletado_em: Date;
};

export async function historicoDeCampo(
  db: Queryable,
  siteId: string,
  porAlvo: number,
): Promise<{ pontos: PontoDeCampo[]; totais: Map<string, number> }> {
  const pontos = await db.query<PontoDeCampo>(
    `select alvo, escopo, form_factor, lcp_p75_ms, inp_p75_ms, cls_p75, coletado_em
       from (
         select *, row_number() over (
                     partition by alvo, escopo, form_factor order by coletado_em desc
                   ) as posicao
           from crux_snapshots
          where site_id = $1
       ) t
      where posicao <= $2::int
      order by alvo, escopo, form_factor, coletado_em`,
    [siteId, porAlvo],
  );

  // O total vem junto pelo mesmo motivo do laboratório: série cortada em
  // silêncio parece completa. Sem isto o painel de campo nunca conseguiria
  // escrever "12 de 37", e o comentário da tela prometia que conseguiria.
  const contagens = await db.query<{ alvo: string; escopo: string; form_factor: string; total: string }>(
    `select alvo, escopo, form_factor, count(*) as total
       from crux_snapshots
      where site_id = $1
      group by alvo, escopo, form_factor`,
    [siteId],
  );

  return {
    pontos,
    totais: new Map(contagens.map((c) => [`${c.alvo}|${c.escopo}|${c.form_factor}`, Number(c.total)])),
  };
}

// ───────────────────────────── experiência real (CrUX) ─────────────────────────────

export type SnapshotCrux = {
  escopo: 'url' | 'origem';
  alvo: string;
  form_factor: string;
  lcp_p75_ms: string | null;
  inp_p75_ms: string | null;
  cls_p75: string | null;
  janela_inicio: Date | null;
  janela_fim: Date | null;
  coletado_em: Date;
};

/**
 * Guarda uma leitura do CrUX.
 *
 * Linha nova a cada coleta, como nas auditorias: a janela do CrUX anda sozinha
 * (são 28 dias corridos), e sobrescrever apagaria a possibilidade de comparar
 * como a experiência real evoluiu.
 */
export async function salvarSnapshotCrux(
  db: Queryable,
  siteId: string,
  leitura: {
    escopo: 'url' | 'origem';
    alvo: string;
    formFactor: string;
    lcpP75Ms: number | null;
    inpP75Ms: number | null;
    clsP75: number | null;
    janela: { inicio: string; fim: string } | null;
  },
): Promise<void> {
  await db.query(
    `insert into crux_snapshots
       (account_id, site_id, escopo, alvo, form_factor, lcp_p75_ms, inp_p75_ms, cls_p75,
        janela_inicio, janela_fim)
     values (app.current_account_id(), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      siteId, leitura.escopo, leitura.alvo, leitura.formFactor,
      leitura.lcpP75Ms, leitura.inpP75Ms, leitura.clsP75,
      leitura.janela?.inicio ?? null, leitura.janela?.fim ?? null,
    ],
  );
}

/** A leitura mais recente de cada (alvo, escopo, dispositivo). */
export async function ultimosCrux(db: Queryable, siteId: string): Promise<SnapshotCrux[]> {
  return db.query<SnapshotCrux>(
    `select distinct on (alvo, escopo, form_factor)
            escopo, alvo, form_factor, lcp_p75_ms, inp_p75_ms, cls_p75,
            janela_inicio, janela_fim, coletado_em
       from crux_snapshots
      where site_id = $1
      order by alvo, escopo, form_factor, coletado_em desc`,
    [siteId],
  );
}
