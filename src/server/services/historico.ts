import 'server-only';
import type { Queryable } from '@/server/db';
import type { EventoDeHistorico } from '@/lib/historico';

export * from '@/lib/historico';

/**
 * Histórico derivado: um `union all` sobre as tabelas que já guardam fato
 * datado. Cada ramo é uma leitura direta — nada aqui é gravado por este
 * serviço, e por isso ele não pode esquecer de registrar.
 *
 * `notaAnterior` é a medição imediatamente anterior do MESMO par (URL,
 * dispositivo), via `lag()`: é o que permite dizer "72 → 89" sem inventar
 * comparação entre páginas ou entre celular e computador.
 *
 * `siteIds` recorta; `null` = a conta inteira (a RLS já limita).
 */
export async function listarHistorico(
  db: Queryable,
  opcoes: { siteIds?: string[]; limite?: number } = {},
): Promise<EventoDeHistorico[]> {
  const linhas = await db.query<{
    quando: Date;
    tipo: EventoDeHistorico['tipo'];
    site_id: string;
    site: string;
    cliente: string;
    url: string | null;
    dispositivo: 'mobile' | 'desktop' | null;
    titulo: string;
    detalhe: string | null;
    nota: number | null;
    nota_anterior: number | null;
  }>(
    `with eventos as (
       -- Medições, com a anterior do mesmo par.
       select r.medido_em as quando, 'analise'::text as tipo, r.site_id, r.url_solicitada as url,
              r.strategy as dispositivo,
              'Desempenho ' || coalesce(round(r.performance * 100)::text, 'sem nota') as titulo,
              null::text as detalhe,
              round(r.performance * 100)::int as nota,
              round(lag(r.performance) over (partition by r.site_id, r.url_solicitada, r.strategy
                                              order by r.medido_em) * 100)::int as nota_anterior
         from lighthouse_results r
       union all
       select j.concluido_em, 'analise_falhou', j.site_id, j.url, j.strategy,
              'Análise não concluída', j.erro, null, null
         from audit_jobs j
        where j.status = 'erro' and j.concluido_em is not null
       union all
       -- Fechadas pela medição: a data está na evidência, gravada pelo fechamento.
       select (o.evidencia->>'resolvidoEm')::timestamptz, 'problema_resolvido', o.site_id, o.url,
              o.dispositivo, o.titulo,
              'por ' || coalesce(o.evidencia->>'resolvidoPor', 'medição')
              || coalesce(' · nota ' || (o.evidencia->>'notaDepois'), ''),
              null, null
         from optimizations o
        where o.status = 'resolvida_por_verificacao' and o.evidencia ? 'resolvidoEm'
       union all
       select o.atualizado_em, 'acompanhamento', o.site_id, o.url, o.dispositivo, o.titulo,
              case o.status
                when 'pendente' then 'pendente'
                when 'em_andamento' then 'em andamento'
                when 'aguardando_nova_analise' then 'aguardando nova análise'
                when 'resolvida_manual' then 'marcada como resolvida'
                else o.status end,
              null, null
         from optimizations o
        where o.status <> 'resolvida_por_verificacao'
       union all
       select t.criada_em, 'tarefa_criada', t.site_id, t.sinal_url, t.sinal_dispositivo,
              t.titulo, t.sinal_titulo, null, null
         from tasks t
       union all
       select t.concluida_em, 'tarefa_concluida', t.site_id, t.sinal_url, t.sinal_dispositivo,
              t.titulo, t.sinal_titulo, null, null
         from tasks t
        where t.concluida_em is not null
       union all
       select f.verificado_em, 'recurso_verificado', f.site_id, null, null,
              case f.feature
                when 'visitas' then 'Visitas e páginas acessadas'
                when 'whatsapp' then 'Cliques no WhatsApp'
                when 'contatos' then 'Cliques em telefone e e-mail'
                when 'formularios' then 'Formulários e leads'
                when 'qualidade' then 'Qualidade técnica'
                else f.feature end,
              null, null, null
         from site_features f
        where f.verificado_em is not null
       union all
       select m.created_at, 'url_monitorada', m.site_id, m.url, null, m.url, null, null, null
         from monitored_urls m
       union all
       select s.created_at, 'site_cadastrado', s.id, null, null, s.domain, null, null, null
         from sites s
     )
     select e.quando, e.tipo, e.site_id, s.name as site, c.name as cliente,
            e.url, e.dispositivo, e.titulo, e.detalhe, e.nota, e.nota_anterior
       from eventos e
       join sites s   on s.id = e.site_id
       join clients c on c.id = s.client_id
      where e.quando is not null
        and ($1::uuid[] is null or e.site_id = any($1))
      order by e.quando desc
      limit $2::int`,
    [opcoes.siteIds ?? null, opcoes.limite ?? 100],
  );

  return linhas.map((l) => ({
    quando: l.quando,
    tipo: l.tipo,
    siteId: l.site_id,
    site: l.site,
    cliente: l.cliente,
    url: l.url,
    dispositivo: l.dispositivo,
    titulo: l.titulo,
    detalhe: l.detalhe,
    nota: l.nota,
    notaAnterior: l.nota_anterior,
  }));
}
