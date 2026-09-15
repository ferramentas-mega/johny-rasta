import 'server-only';
import type { Queryable } from '@/server/db';

/**
 * "Onde atuar primeiro".
 *
 * A lista tem duas origens, e a distinção importa:
 *
 *  - **Derivadas**: calculadas na hora a partir dos dados. Some sozinha quando
 *    a causa some. Não guardo no banco porque guardar significaria ter de
 *    apagar depois, e uma linha órfã afirmaria um problema que já acabou.
 *  - **Registradas** (`optimizations`): as que alguém acompanhou, com status.
 *
 * Duas coisas que esta lista NÃO faz, de propósito:
 *
 *  1. Não conclui que o rastreamento quebrou porque um site ficou sem eventos.
 *     Site de pouco tráfego passa dias sem visita, e isso é normal. O aviso só
 *     aparece quando o site JÁ coletou com regularidade e parou.
 *  2. Não afirma que lentidão causou queda de conversão. Os dois sinais podem
 *     aparecer juntos sem um causar o outro; a lista mostra os dois separados e
 *     deixa a conclusão para quem investiga.
 */

export type TipoOtimizacao = 'tecnico' | 'comercial' | 'coleta' | 'atualizacao';

export type Otimizacao = {
  id: string | null;
  siteId: string;
  site: string;
  cliente: string;
  url: string | null;
  tipo: TipoOtimizacao;
  titulo: string;
  evidencia: string;
  prioridade: number;
  status: string;
  proximaAcao: string;
  detectadoEm: Date;
};

export const TIPO_LABEL: Record<TipoOtimizacao, string> = {
  tecnico: 'Técnico',
  comercial: 'Comercial',
  coleta: 'Coleta',
  atualizacao: 'Atualização',
};

export const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando_nova_analise: 'Aguardando nova análise',
  resolvida_manual: 'Resolvida manualmente',
  resolvida_por_verificacao: 'Resolvida por verificação',
};

/** Nota abaixo disto, numa URL monitorada, vira item da lista. */
const DESEMPENHO_RUIM = 0.5;
/** Depois disto, a análise é velha o bastante para não sustentar decisão. */
const DIAS_ANALISE_VENCIDA = 14;
/** Sem evento por mais tempo que isto, num site que coletava, é suspeito. */
const DIAS_SEM_EVENTO = 3;

type LinhaBruta = {
  id: string | null;
  site_id: string;
  site: string;
  cliente: string;
  url: string | null;
  tipo: TipoOtimizacao;
  titulo: string;
  evidencia: string;
  prioridade: number;
  status: string;
  proxima_acao: string;
  detectado_em: Date;
};

export async function listarOtimizacoes(db: Queryable): Promise<Otimizacao[]> {
  const linhas = await db.query<LinhaBruta>(
    `
    -- 1. Registradas, com acompanhamento humano.
    select o.id, o.site_id, s.name as site, c.name as cliente, o.url, o.tipo,
           o.titulo, coalesce(o.evidencia->>'texto','') as evidencia,
           o.prioridade, o.status, coalesce(o.proxima_acao,'') as proxima_acao,
           o.detectado_em
      from optimizations o
      join sites s   on s.id = o.site_id
      join clients c on c.id = s.client_id
     where o.status not in ('resolvida_manual','resolvida_por_verificacao')

    union all

    -- 2. Desempenho ruim numa URL monitorada. Compara a análise MAIS RECENTE de
    --    cada par (url, dispositivo): uma medição antiga não sustenta alerta.
    select null, r.site_id, s.name, c.name, r.url_solicitada, 'tecnico',
           'Desempenho baixo em página monitorada',
           'Nota ' || round(r.performance * 100) || '/100 no ' ||
             case r.strategy when 'mobile' then 'celular' else 'computador' end,
           1, 'pendente', 'Abrir Qualidade técnica e ver os diagnósticos', r.medido_em
      from (
        select distinct on (site_id, url_solicitada, strategy)
               site_id, url_solicitada, strategy, performance, medido_em
          from lighthouse_results
         order by site_id, url_solicitada, strategy, medido_em desc
      ) r
      join sites s   on s.id = r.site_id
      join clients c on c.id = s.client_id
     where r.performance is not null and r.performance < $1

    union all

    -- 3. URL prioritária sem análise, ou com análise velha.
    select null, m.site_id, s.name, c.name, m.url, 'atualizacao',
           case when ultima.medido_em is null
                then 'URL prioritária nunca analisada'
                else 'Análise desatualizada' end,
           coalesce('Última análise em ' || to_char(ultima.medido_em,'DD/MM/YYYY'),
                    'Nenhuma análise registrada'),
           2, 'pendente', 'Executar análise', coalesce(ultima.medido_em, m.created_at)
      from monitored_urls m
      join sites s   on s.id = m.site_id
      join clients c on c.id = s.client_id
      left join lateral (
        select max(medido_em) as medido_em from lighthouse_results r
         where r.site_id = m.site_id and r.url_solicitada = m.url
      ) ultima on true
     where m.prioritaria
       and (ultima.medido_em is null
            or ultima.medido_em < now() - make_interval(days => $2::int))

    union all

    -- 4. Site que COLETAVA e parou.
    --
    --    A condição de ter mais de 30 eventos é o que separa "parou de coletar"
    --    de "site de pouco tráfego". Sem ela, todo site pequeno viraria alarme
    --    falso — e alarme falso treina o usuário a ignorar a lista.
    select null, s.id, s.name, c.name, null, 'coleta',
           'Sem eventos recentes num site que coletava',
           'Último evento em ' || to_char(e.ultimo,'DD/MM/YYYY') ||
             ' · ' || e.total || ' eventos no histórico',
           1, 'pendente', 'Conferir se o script continua instalado', e.ultimo
      from sites s
      join clients c on c.id = s.client_id
      join lateral (
        select max(occurred_at) as ultimo, count(*) as total
          from events ev where ev.site_id = s.id and not ev.is_test
      ) e on true
     where s.archived_at is null
       and e.total > 30
       and e.ultimo < now() - make_interval(days => $3::int)

    order by 9, 12 desc
    `,
    [DESEMPENHO_RUIM, DIAS_ANALISE_VENCIDA, DIAS_SEM_EVENTO],
  );

  return linhas.map((l) => ({
    id: l.id,
    siteId: l.site_id,
    site: l.site,
    cliente: l.cliente,
    url: l.url,
    tipo: l.tipo,
    titulo: l.titulo,
    evidencia: l.evidencia,
    prioridade: l.prioridade,
    status: l.status,
    proximaAcao: l.proxima_acao,
    detectadoEm: l.detectado_em,
  }));
}
