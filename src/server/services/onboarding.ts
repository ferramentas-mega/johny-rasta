import 'server-only';
import { randomBytes } from 'node:crypto';
import { withAccount, type Queryable } from '@/server/db';
import {
  RECURSOS,
  derivarEstado,
  type ConfiguracaoDoSite,
  type EventoDiagnostico,
  type LinhaFeature,
  type ModoFormulario,
  type Plataforma,
  type Recurso,
  type ResumoDeConfiguracao,
  type SessaoDiagnostico,
  type SiteExistente,
} from '@/lib/recursos';

/**
 * Leitura e escrita da configuração de mensuração.
 *
 * As regras de derivação — que estado cada recurso tem, quais etapas estão
 * pendentes — vivem em `src/lib/recursos.ts`, sem dependência de banco. Aqui
 * fica só o que fala com o Postgres.
 *
 * Reexporta o módulo puro para que quem consome tenha um import só.
 */
export * from '@/lib/recursos';

export type ResultadoVerificacao = {
  eventos: EventoDiagnostico[];
  /** Recursos que passaram a verificar nesta conferência. */
  verificados: Recurso[];
  /** Envios de formulário gravados nesta sessão de diagnóstico. */
  formularios: number;
};

export async function obterConfiguracao(accountId: string, siteId: string): Promise<ConfiguracaoDoSite | null> {
  return withAccount(accountId, (db) => obterConfiguracaoNaTransacao(db, siteId));
}

export async function obterConfiguracaoNaTransacao(
  db: Queryable,
  siteId: string,
): Promise<ConfiguracaoDoSite | null> {
  const site = await db.one<{
    id: string;
    platform: Plataforma;
    primary_url: string | null;
    form_mode: ModoFormulario | null;
    recursos_escolhidos_em: Date | null;
  }>(
    `select id, platform, primary_url, form_mode, recursos_escolhidos_em
       from sites where id = $1 and archived_at is null`,
    [siteId],
  );
  if (!site) return null;

  const linhas = await db.query<LinhaFeature>(
    'select feature, selecionado, verificado_em, evidencia, erro from site_features where site_id = $1',
    [siteId],
  );
  const urls = await db.one<{ total: number }>(
    'select count(*)::int as total from monitored_urls where site_id = $1',
    [siteId],
  );

  const contexto = {
    urlsMonitoradas: urls?.total ?? 0,
    pagespeedConfigurado: !!process.env.PAGESPEED_API_KEY,
    modoFormulario: site.form_mode,
  };

  const porRecurso = new Map(linhas.map((l) => [l.feature, l]));

  return {
    siteId: site.id,
    plataforma: site.platform,
    urlPrincipal: site.primary_url,
    modoFormulario: site.form_mode,
    recursosEscolhidosEm: site.recursos_escolhidos_em,
    urlsMonitoradas: contexto.urlsMonitoradas,
    pagespeedConfigurado: contexto.pagespeedConfigurado,
    features: RECURSOS.map((recurso) => {
      // Recurso sem linha ainda é "não selecionado", não "erro": o operador
      // simplesmente não chegou na etapa 2.
      const linha = porRecurso.get(recurso) ?? {
        feature: recurso,
        selecionado: false,
        verificado_em: null,
        evidencia: null,
        erro: null,
      };
      return {
        recurso,
        selecionado: linha.selecionado,
        verificadoEm: linha.verificado_em,
        evidencia: linha.evidencia,
        erro: linha.erro,
        estado: derivarEstado(linha, contexto),
      };
    }),
  };
}

// ───────────────────────── escrita ─────────────────────────

/**
 * Erro de site que não é desta conta — ou que não existe.
 *
 * As duas situações devolvem a mesma coisa, de propósito: distinguir "não é seu"
 * de "não existe" confirma a existência de um registro alheio a quem só tem o
 * identificador.
 */
export class SiteForaDaConta extends Error {
  constructor() {
    super('Site não encontrado nesta conta.');
    this.name = 'SiteForaDaConta';
  }
}

/**
 * Exige que o site pertença à conta da transação. Lança se não pertencer.
 *
 * **Por que isto precisa existir, se há RLS.** A RLS de `site_features` casa por
 * `account_id`, e o valor gravado ali vem de `app.current_account_id()` — o da
 * conta que está escrevendo. Ou seja: a política aprova a linha, porque a linha
 * É da conta certa. O que ela não olha é o `site_id`, que vem do formulário.
 *
 * O resultado, antes desta guarda: um usuário autenticado da conta A mandava a
 * Server Action com o `siteId` de um site da conta B e criava a linha
 * (A, site-de-B, 'visitas'). A FK aceitava, porque o site existe. A RLS aceitava,
 * porque o `account_id` é o de A. E como `site_features` tem `unique (site_id,
 * feature)`, **o dono legítimo ficava impedido de gravar o próprio recurso para
 * sempre** — contra uma linha que a política esconde dele, então nem o erro fazia
 * sentido do lado de lá. Uma negação de serviço entre clientes, aberta a qualquer
 * um com uma sessão válida e um id.
 *
 * A consulta roda sob RLS: `sites` só devolve os sites da conta corrente, então
 * site de outra conta e site inexistente dão o mesmo "nenhuma linha".
 */
async function exigirSiteDaConta(db: Queryable, siteId: string): Promise<void> {
  const site = await db.one<{ id: string }>('select id from sites where id = $1', [siteId]);
  if (!site) throw new SiteForaDaConta();
}

export async function salvarRecursos(
  accountId: string,
  siteId: string,
  escolhidos: Recurso[],
): Promise<void> {
  await withAccount(accountId, async (db) => {
    await exigirSiteDaConta(db, siteId);
    for (const recurso of RECURSOS) {
      await db.query(
        `insert into site_features (account_id, site_id, feature, selecionado, atualizado_em)
              values (app.current_account_id(), $1, $2, $3, now())
         on conflict (site_id, feature) do update
                set selecionado = excluded.selecionado, atualizado_em = now()`,
        [siteId, recurso, escolhidos.includes(recurso)],
      );
    }
    await db.query('update sites set recursos_escolhidos_em = now() where id = $1', [siteId]);
  });
}

export async function salvarModoFormulario(
  accountId: string,
  siteId: string,
  modo: ModoFormulario,
): Promise<void> {
  await withAccount(accountId, async (db) => {
    // A RLS já faria este UPDATE afetar zero linhas num site de outra conta —
    // mas zero linhas afetadas, sem ninguém olhar, virava "Configuração salva"
    // na tela. Confirmar uma gravação que não aconteceu é o mesmo defeito de
    // sempre: falha que vira sucesso.
    await exigirSiteDaConta(db, siteId);
    await db.query('update sites set form_mode = $2 where id = $1', [siteId, modo]);
  });
}

/**
 * Carimba uma verificação bem-sucedida.
 *
 * Idempotente: repetir não move a data. A primeira vez que funcionou é o fato
 * que interessa — reescrever a cada nova conferência apagaria quando a
 * instalação passou a funcionar.
 */
async function carimbarVerificado(
  db: Queryable,
  siteId: string,
  recurso: Recurso,
  evidencia: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into site_features (account_id, site_id, feature, selecionado, verificado_em, evidencia, erro, atualizado_em)
          values (app.current_account_id(), $1, $2, true, now(), $3::jsonb, null, now())
     on conflict (site_id, feature) do update
            set verificado_em = coalesce(site_features.verificado_em, now()),
                evidencia     = coalesce(site_features.evidencia, excluded.evidencia),
                erro          = null,
                atualizado_em = now()`,
    [siteId, recurso, JSON.stringify(evidencia)],
  );
}

export async function registrarErroDeRecurso(
  accountId: string,
  siteId: string,
  recurso: Recurso,
  erro: string,
): Promise<void> {
  await withAccount(accountId, async (db) => {
    await exigirSiteDaConta(db, siteId);
    await db.query(
      `insert into site_features (account_id, site_id, feature, selecionado, erro, atualizado_em)
            values (app.current_account_id(), $1, $2, true, $3, now())
       on conflict (site_id, feature) do update set erro = excluded.erro, atualizado_em = now()`,
      [siteId, recurso, erro.slice(0, 500)],
    );
  });
}

export async function verificarDiagnostico(
  accountId: string,
  siteId: string,
  token: string,
): Promise<ResultadoVerificacao> {
  return withAccount(accountId, async (db) => {
    // Esta função ESCREVE (`carimbarVerificado`), e a escrita não confere o dono
    // do site — o `account_id` gravado é o de quem chama. Sem a guarda, um id
    // alheio no formulário criava linha de `site_features` no site de outro.
    await exigirSiteDaConta(db, siteId);

    const eventos = await db.query<EventoDiagnostico>(
      `select e.type as tipo, e.subtype as subtipo, p.path as caminho,
              e.occurred_at as quando, e.button_id as botao
         from events e
         left join pages p on p.id = e.page_id
        where e.site_id = $1 and e.diagnostic_token = $2
        order by e.occurred_at desc
        limit 50`,
      [siteId, token],
    );

    const envios = await db.one<{ total: number }>(
      `select count(*)::int as total from form_submissions
        where site_id = $1 and diagnostic_token = $2 and status = 'confirmada'`,
      [siteId, token],
    );

    const verificados: Recurso[] = [];
    const marcar = async (recurso: Recurso, evidencia: Record<string, unknown>) => {
      await carimbarVerificado(db, siteId, recurso, evidencia);
      verificados.push(recurso);
    };

    const visualizacao = eventos.find((e) => e.tipo === 'page_view');
    if (visualizacao) {
      await marcar('visitas', { evento: 'page_view', caminho: visualizacao.caminho, em: visualizacao.quando });
    }

    const whatsapp = eventos.find((e) => e.tipo === 'cta_click' && e.subtipo === 'whatsapp');
    if (whatsapp) {
      await marcar('whatsapp', { evento: 'cta_click/whatsapp', botao: whatsapp.botao, em: whatsapp.quando });
    }

    const contato = eventos.find((e) => e.tipo === 'cta_click' && (e.subtipo === 'phone' || e.subtipo === 'email'));
    if (contato) {
      await marcar('contatos', { evento: `cta_click/${contato.subtipo}`, botao: contato.botao, em: contato.quando });
    }

    if ((envios?.total ?? 0) > 0) {
      await marcar('formularios', { envios: envios!.total, origem: 'diagnostico' });
    }

    return { eventos, verificados, formularios: envios?.total ?? 0 };
  });
}

/**
 * Verifica a qualidade técnica a partir de análises já gravadas.
 *
 * Diferente da anterior: não há gesto do operador a correlacionar. Uma análise
 * concluída com nota é a evidência.
 */
export async function verificarQualidade(accountId: string, siteId: string): Promise<boolean> {
  return withAccount(accountId, async (db) => {
    await exigirSiteDaConta(db, siteId);
    const ultima = await db.one<{ url_solicitada: string; performance: string | null; medido_em: Date }>(
      `select url_solicitada, performance, medido_em from lighthouse_results
        where site_id = $1 and performance is not null
        order by medido_em desc limit 1`,
      [siteId],
    );
    if (!ultima) return false;
    await carimbarVerificado(db, siteId, 'qualidade', {
      url: ultima.url_solicitada,
      performance: ultima.performance,
      em: ultima.medido_em,
    });
    return true;
  });
}

// ───────────────────────── sessão de diagnóstico ─────────────────────────

/**
 * Abre uma sessão de diagnóstico.
 *
 * O token vai na URL do site (`?painel_diag=…`), o coletor o devolve em cada
 * evento, e é assim que o painel distingue "o clique que eu acabei de dar" de
 * "um clique de visitante que caiu no mesmo minuto".
 */
export async function abrirDiagnostico(accountId: string, siteId: string): Promise<SessaoDiagnostico> {
  return withAccount(accountId, async (db) => {
    await exigirSiteDaConta(db, siteId);
    const token = `diag_${randomBytes(9).toString('hex')}`;
    const linha = await db.one<{ id: string; aberta_em: Date }>(
      `insert into diagnostic_sessions (account_id, site_id, token)
            values (app.current_account_id(), $1, $2)
         returning id, aberta_em`,
      [siteId, token],
    );
    return { id: linha!.id, token, abertaEm: linha!.aberta_em };
  });
}

/** A sessão aberta mais recente, se houver. Permite retomar sem abrir outra. */
export async function diagnosticoAberto(accountId: string, siteId: string): Promise<SessaoDiagnostico | null> {
  return withAccount(accountId, async (db) => {
    const linha = await db.one<{ id: string; token: string; aberta_em: Date }>(
      `select id, token, aberta_em from diagnostic_sessions
        where site_id = $1 and encerrada_em is null
        order by aberta_em desc limit 1`,
      [siteId],
    );
    return linha ? { id: linha.id, token: linha.token, abertaEm: linha.aberta_em } : null;
  });
}

// ───────────────────────── resumo em lote ─────────────────────────

/**
 * Situação de configuração de vários sites, numa consulta só.
 *
 * Existe para a lista de sites, o painel do cliente e a visão geral poderem
 * mostrar a pendência sem fazer uma consulta por linha — com trinta sites, o
 * N+1 apareceria como lentidão antes de aparecer como defeito.
 *
 * A regra do estado continua a mesma do caminho individual: `verificado_em`
 * preenchido é verificado; selecionado sem verificação é pendente; não
 * selecionado não conta para nada.
 */
export async function resumoDeConfiguracao(
  accountId: string,
  siteIds: string[],
): Promise<Map<string, ResumoDeConfiguracao>> {
  if (siteIds.length === 0) return new Map();

  return withAccount(accountId, async (db) => {
    const linhas = await db.query<{
      site_id: string;
      pendentes: number;
      verificados: number;
      escolhidos: Date | null;
      faltando: Recurso[] | null;
      com_erro: Recurso[] | null;
    }>(
      `select s.id as site_id,
              coalesce(sum(case when f.selecionado and f.verificado_em is null then 1 else 0 end), 0)::int as pendentes,
              coalesce(sum(case when f.selecionado and f.verificado_em is not null then 1 else 0 end), 0)::int as verificados,
              s.recursos_escolhidos_em as escolhidos,
              -- QUAIS faltam, e não só quantos: um número sozinho não diz o que
              -- fazer em seguida. \`filter\` em vez de \`case\`, para o array não
              -- ganhar nulos.
              array_agg(f.feature) filter (
                where f.selecionado and f.verificado_em is null
              ) as faltando,
              array_agg(f.feature) filter (
                where f.selecionado and f.erro is not null and f.verificado_em is null
              ) as com_erro
         from sites s
         left join site_features f on f.site_id = s.id
        where s.id = any($1::uuid[])
        group by s.id, s.recursos_escolhidos_em`,
      [siteIds],
    );

    return new Map(
      linhas.map((l) => [
        l.site_id,
        {
          siteId: l.site_id,
          pendentes: l.pendentes,
          verificados: l.verificados,
          naoIniciado: l.escolhidos === null,
          faltando: l.faltando ?? [],
          comErro: l.com_erro ?? [],
        },
      ]),
    );
  });
}

// ───────────────────────── duplicidade ─────────────────────────

/**
 * Procura um site ativo com o mesmo domínio.
 *
 * Roda dentro da conta, então nunca revela um site de outra conta — o que
 * seria, por si só, um vazamento: saber que outra agência atende aquele
 * domínio é informação.
 */
export async function siteComDominio(
  accountId: string,
  dominio: string,
  ignorarId?: string,
): Promise<SiteExistente | null> {
  return withAccount(accountId, async (db) =>
    db.one<SiteExistente>(
      `select s.id, s.name, s.domain, c.name as "clienteNome"
         from sites s join clients c on c.id = s.client_id
        where lower(s.domain) = lower($1) and s.archived_at is null
          and ($2::uuid is null or s.id <> $2)
        limit 1`,
      [dominio, ignorarId ?? null],
    ),
  );
}
