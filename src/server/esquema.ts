import 'server-only';
import { withoutAccount } from '@/server/db';

/**
 * O que o código publicado EXIGE do banco.
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 *
 * Esta lista nasceu de um estrago real. O código novo subiu para produção antes
 * da migração `20260916000008`, e tudo passou a responder 500 — inclusive a
 * coleta, então a janela inteira de eventos daquele período se perdeu. O
 * `/api/diagnostico` respondeu **`tudoOk: true`** durante o incidente inteiro,
 * porque ele conferia se a conexão abria e nada mais. Conexão abria; a tabela é
 * que não existia.
 *
 * Um diagnóstico que responde "tudo OK" enquanto o aplicativo está quebrado é
 * pior que nenhum: ele desvia a investigação para os lugares errados.
 *
 * ── Como manter ──────────────────────────────────────────────────────────────
 *
 * Ao escrever uma migração nova, acrescente aqui os objetos que o código passou
 * a usar. É trabalho manual de propósito: derivar a lista lendo os arquivos de
 * migração diria o que as migrações criam, e não o que o código precisa — as
 * duas coisas divergem, e é exatamente na divergência que mora o incidente.
 *
 * A lista não precisa ser exaustiva. Precisa cobrir o que, faltando, derruba uma
 * rota inteira.
 */

/** Tabelas sem as quais alguma rota inteira deixa de funcionar. */
const TABELAS = [
  'accounts',
  'users',
  'clients',
  'sites',
  'pages',
  'sessions',
  'events',
  'leads',
  'form_submissions',
  'monitored_urls',
  'lighthouse_results',
  'crux_snapshots',
  'audit_jobs',
  'optimizations',
  // 20260916000008 — o onboarding por recurso
  'site_features',
  'diagnostic_sessions',
  // 20260916000009 — os limites de requisição
  'rate_limits',
] as const;

/**
 * Colunas acrescentadas por migrações posteriores à inicial.
 *
 * Estas são as perigosas: a tabela existe, então `to_regclass` responde que está
 * tudo bem, e a consulta falha mesmo assim por causa de uma coluna.
 */
const COLUNAS: readonly (readonly [tabela: string, coluna: string])[] = [
  ['sites', 'platform'],
  ['sites', 'primary_url'],
  ['sites', 'form_mode'],
  ['sites', 'recursos_escolhidos_em'],
  ['events', 'diagnostic_token'],
  ['form_submissions', 'diagnostic_token'],
  // 20260916000011 — o prazo da sessão de diagnóstico
  ['diagnostic_sessions', 'expira_em'],
  // 20260916000014 — o dispositivo faz parte da identidade do sinal
  ['optimizations', 'dispositivo'],
] as const;

/**
 * Funções com a assinatura exata que o código chama.
 *
 * A assinatura importa: trocar `integer` por `bigint` numa função mantém o nome
 * e quebra a chamada. `to_regprocedure` confere as duas coisas.
 */
const FUNCOES = [
  'app.current_account_id()',
  'app.find_user_for_login(text)',
  'app.find_user_for_session(uuid)',
  // 20260916000009
  'app.consumir_limite(text,integer)',
  'app.zerar_limite(text)',
  'app.limpar_limites(timestamptz)',
  // 20260916000010
  'app.contas_com_job_pendente(integer)',
  'app.contas_com_auditoria_vencida(integer)',
  // 20260916000016
  'app.contas_com_acompanhamento_aberto()',
] as const;

export type FaltaNoEsquema = {
  tipo: 'tabela' | 'coluna' | 'funcao';
  nome: string;
};

export type EstadoDoEsquema =
  | { verificado: true; completo: boolean; faltando: FaltaNoEsquema[] }
  /**
   * Não deu para verificar — tipicamente porque a conexão não abre.
   *
   * Distinto de "está completo": afirmar que o esquema está bem sem ter olhado é
   * o defeito que este módulo existe para corrigir.
   */
  | { verificado: false; motivo: string };

export async function verificarEsquema(): Promise<EstadoDoEsquema> {
  try {
    return await withoutAccount(async (db) => {
      const faltando: FaltaNoEsquema[] = [];

      // Uma consulta só para tudo: um round-trip por objeto custaria dezenas de
      // idas ao banco num endpoint que existe justamente para responder rápido
      // quando algo está errado.
      const linha = await db.one<{
        tabelas: string[] | null;
        colunas: string[] | null;
        funcoes: string[] | null;
      }>(
        `select
           (select array_agg(t) from unnest($1::text[]) t
             where to_regclass('public.' || t) is null)                       as tabelas,
           (select array_agg(c.tabela || '.' || c.coluna)
              from unnest($2::text[], $3::text[]) as c(tabela, coluna)
             where to_regclass('public.' || c.tabela) is not null
               and not exists (
                 select 1 from information_schema.columns ic
                  where ic.table_schema = 'public'
                    and ic.table_name = c.tabela
                    and ic.column_name = c.coluna
               ))                                                             as colunas,
           (select array_agg(f) from unnest($4::text[]) f
             where to_regprocedure(f) is null)                                as funcoes`,
        [
          TABELAS as readonly string[],
          COLUNAS.map(([t]) => t),
          COLUNAS.map(([, c]) => c),
          FUNCOES as readonly string[],
        ],
      );

      for (const nome of linha?.tabelas ?? []) faltando.push({ tipo: 'tabela', nome });
      for (const nome of linha?.colunas ?? []) faltando.push({ tipo: 'coluna', nome });
      for (const nome of linha?.funcoes ?? []) faltando.push({ tipo: 'funcao', nome });

      return { verificado: true, completo: faltando.length === 0, faltando };
    });
  } catch (erro) {
    // A mensagem do driver pode carregar host e usuário. Só a classe do erro
    // sai daqui; o detalhe fica no log do servidor.
    console.error('[diagnostico] falha ao verificar o esquema:', erro);
    return {
      verificado: false,
      motivo: 'Não foi possível consultar o catálogo do banco. Veja as conexões acima.',
    };
  }
}

/** Frase acionável para quem está lendo o diagnóstico às três da manhã. */
export function comoResolverEsquema(faltando: FaltaNoEsquema[]): string {
  return (
    `O banco está atrás do código: ${faltando.length} objeto(s) que a aplicação usa não existem. ` +
    'Aplique as migrações pendentes de supabase/migrations/ ANTES de publicar de novo. ' +
    'Publicar código na frente da migração derruba login, coleta e formulários com 500.'
  );
}
