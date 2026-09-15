import { NextResponse } from 'next/server';
import { withoutAccount } from '@/server/db';

/**
 * Enfileira as auditorias vencidas. Chamado uma vez por dia pelo cron.
 *
 * Por que diário, se a regra é semanal: no plano Hobby a Vercel aceita no
 * máximo **dois** crons por projeto e **uma execução por dia** — expressão mais
 * frequente não é ignorada, ela FALHA o deploy. Então o gatilho é diário e a
 * regra semanal vive na consulta: só entra na fila a URL prioritária cuja
 * última análise passou de sete dias.
 *
 * Este endpoint só ENFILEIRA. Quem gasta os 11 a 48 segundos de cada análise é
 * `/api/auditorias/processar`, uma por invocação — encadear as duas coisas aqui
 * estouraria o tempo da função no segundo item.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DIAS_ATE_VENCER = 7;

export async function GET(request: Request) {
  const esperado = process.env.CRON_SECRET;
  // Sem segredo configurado o endpoint fica fechado. O padrão é negar: um
  // agendador aberto enfileira análises de graça e queima a quota da conta.
  if (!esperado || request.headers.get('authorization') !== `Bearer ${esperado}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  if (!process.env.PAGESPEED_API_KEY) {
    return NextResponse.json({ enfileiradas: 0, motivo: 'integração não configurada' }, { status: 503 });
  }

  const enfileiradas = await withoutAccount(async (db) =>
    db.query<{ id: string }>(
      `insert into audit_jobs (account_id, site_id, url, strategy, origem)
       select m.account_id, m.site_id, m.url, d.strategy, 'agendada'
         from monitored_urls m
        cross join (values ('mobile'), ('desktop')) as d(strategy)
        where m.prioritaria
          and not exists (
            select 1 from lighthouse_results r
             where r.site_id = m.site_id and r.url_solicitada = m.url
               and r.strategy = d.strategy
               and r.medido_em > now() - make_interval(days => $1::int)
          )
       on conflict (site_id, url, strategy) where status in ('pendente','executando')
       do nothing
       returning id`,
      [DIAS_ATE_VENCER],
    ),
  );

  return NextResponse.json({ enfileiradas: enfileiradas.length });
}
