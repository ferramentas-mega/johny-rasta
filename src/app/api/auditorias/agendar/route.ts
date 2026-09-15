import { NextResponse } from 'next/server';
import { withAccount, withoutAccount } from '@/server/db';
import { segredoConfere } from '@/server/segredos';

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
  if (!esperado || !segredoConfere(request.headers.get('authorization'), `Bearer ${esperado}`)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  if (!process.env.PAGESPEED_API_KEY) {
    return NextResponse.json({ enfileiradas: 0, motivo: 'integração não configurada' }, { status: 503 });
  }

  /**
   * UMA TRANSAÇÃO POR CONTA, e não uma consulta sobre a base inteira.
   *
   * O `insert … select` global que existia aqui rodava com `withoutAccount`, ou
   * seja, sem `app.account_id`. Com RLS FORCE nas tabelas de qualidade,
   * `app.current_account_id()` devolvia NULL, nenhuma linha casava, e o endpoint
   * respondia `{"enfileiradas": 0}` todo santo dia sem nunca enfileirar nada.
   * Não havia erro para ninguém notar — o no-op se declarava bem-sucedido.
   *
   * A função abaixo é `SECURITY DEFINER` e devolve só identificadores de conta.
   * O trabalho continua acontecendo dentro da política, conta por conta: um
   * defeito aqui erra uma conta, não a base.
   */
  const contas = await withoutAccount(async (db) =>
    db.query<{ conta: string }>(
      'select app.contas_com_auditoria_vencida($1) as conta',
      [DIAS_ATE_VENCER],
    ),
  );

  let enfileiradas = 0;
  for (const { conta } of contas) {
    const linhas = await withAccount(conta, async (db) =>
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
    enfileiradas += linhas.length;
  }

  return NextResponse.json({ enfileiradas, contas: contas.length });
}
