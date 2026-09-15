import { NextResponse } from 'next/server';
import { withAccount, withoutAccount } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { analisar, IntegracaoNaoConfigurada, FalhaNaAnalise } from '@/server/qualidade/pagespeed';
import { reivindicarProximo, registrarSucesso, registrarFalha, salvarSnapshotCrux } from '@/server/qualidade/auditoria';
import { consultarPaginaOuOrigem, CruxNaoConfigurado } from '@/server/qualidade/crux';

/**
 * Processa UMA auditoria da fila.
 *
 * Uma por invocação, e não um laço sobre a fila inteira, porque a medição real
 * mandou: 11s numa página leve, 48s numa pesada, contra um teto de 60s na
 * Vercel Hobby. Um laço estouraria no segundo item e perderia o trabalho do
 * primeiro.
 *
 * Quem chama:
 *  - o cron diário (`vercel.json`), autenticado pelo CRON_SECRET;
 *  - a própria tela, logo depois de enfileirar, para o usuário não esperar o
 *    cron do dia seguinte.
 *
 * O que NÃO chama: qualquer um. O endpoint consome quota da chave do Google —
 * 25.000 análises por dia — e aberto seria um jeito barato de esgotá-la.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// O teto do plano. Não adianta pedir mais: a plataforma corta.
export const maxDuration = 60;

/** Margem para gravar o resultado antes de a plataforma cortar a invocação. */
const ORCAMENTO_MS = 50_000;

function autorizadoComoCron(request: Request): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  const recebido = request.headers.get('authorization');
  return recebido === `Bearer ${esperado}`;
}

export async function POST(request: Request) {
  const usuario = await getSessionUser().catch(() => null);
  const cron = autorizadoComoCron(request);
  if (!usuario && !cron) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  if (!process.env.PAGESPEED_API_KEY) {
    // Configuração ausente é 503, não 500: o servidor está bem, a integração é
    // que não está ligada. E jamais devolve nota inventada.
    return NextResponse.json(
      { erro: 'Análise técnica não configurada neste servidor.', configurada: false },
      { status: 503 },
    );
  }

  // O cron não tem sessão, então não tem conta: ele varre a fila inteira, o que
  // só é possível sem RLS de conta. Por isso usa `withoutAccount`, e por isso
  // este caminho exige o segredo.
  const executar = cron ? withoutAccount : <T,>(fn: Parameters<typeof withAccount<T>>[1]) =>
    withAccount<T>(usuario!.accountId, fn);

  const job = await executar((db) => reivindicarProximo(db));
  if (!job) return NextResponse.json({ processado: false, motivo: 'fila vazia' });

  const controle = new AbortController();
  const corte = setTimeout(() => controle.abort(), ORCAMENTO_MS);

  try {
    const resultado = await analisar(job.url, job.strategy, { signal: controle.signal });
    // As auditorias vão para o banco sem as partes pesadas: capturas de tela
    // sozinhas respondiam por 96 dos 285 KB de uma resposta real.
    const auditorias = Object.fromEntries(resultado.diagnosticos.map((d) => [d.id, d]));
    await executar((db) => registrarSucesso(db, job, resultado, auditorias));

    // A experiência real vem junto da auditoria, e não a cada carregamento da
    // tela: são 25.000 pedidos por dia, e uma consulta por visita queimaria a
    // quota sem trazer dado novo — a janela do CrUX anda de 28 em 28 dias.
    //
    // Falhar aqui NÃO invalida a auditoria que acabou de dar certo. São medidas
    // independentes: laboratório e campo. Por isso o catch é próprio e silencioso
    // no retorno, apenas registrado no log.
    let campo: 'coletado' | 'sem_dados' | 'indisponivel' = 'indisponivel';
    try {
      const leitura = await consultarPaginaOuOrigem(
        job.url,
        job.strategy === 'mobile' ? 'PHONE' : 'DESKTOP',
        controle.signal,
      );
      if (leitura) {
        await executar((db) => salvarSnapshotCrux(db, job.site_id, leitura));
        campo = 'coletado';
      } else {
        campo = 'sem_dados';
      }
    } catch (erro) {
      console.error(
        '[auditoria] CrUX indisponível para',
        job.id,
        erro instanceof CruxNaoConfigurado ? 'API não habilitada' : String(erro).slice(0, 120),
      );
    }

    return NextResponse.json({ processado: true, jobId: job.id, url: job.url, strategy: job.strategy, campo });
  } catch (erro) {
    const motivo =
      erro instanceof IntegracaoNaoConfigurada ? 'Integração não configurada'
      : erro instanceof FalhaNaAnalise ? `PageSpeed: ${erro.message}`
      : controle.signal.aborted ? 'Tempo esgotado antes da resposta do PageSpeed'
      : erro instanceof Error ? erro.message
      : 'Falha desconhecida';

    // A mensagem vai para o job, nunca a URL da chamada — a chave está nela.
    console.error('[auditoria] falha ao processar', job.id, motivo);
    await executar((db) => registrarFalha(db, job, motivo));
    return NextResponse.json({ processado: false, jobId: job.id, erro: motivo }, { status: 502 });
  } finally {
    clearTimeout(corte);
  }
}
