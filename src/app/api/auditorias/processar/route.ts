import { NextResponse } from 'next/server';
import { withAccount, withoutAccount } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { segredoConfere } from '@/server/segredos';
import { MINUTOS_ATE_ABANDONO } from '@/server/qualidade/auditoria';
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
 *  - **GET**: o cron diário do `vercel.json`, autenticado pelo `CRON_SECRET`.
 *    A Vercel dispara crons por GET, e só por GET — um endpoint só de POST
 *    nunca seria chamado por ela. Foi o que aconteceu aqui: o agendador
 *    enfileirava todo dia e ninguém drenava a fila, porque este arquivo
 *    exportava apenas POST enquanto o comentário afirmava que o cron o chamava.
 *  - **POST**: a própria tela, logo depois de enfileirar, para o usuário não
 *    esperar o cron do dia seguinte. Aceita sessão OU segredo.
 *
 * O que NÃO chama: qualquer um. O endpoint consome quota da chave do Google —
 * 25.000 análises por dia — e aberto seria um jeito barato de esgotá-la. Por
 * isso o GET exige o segredo mesmo havendo sessão: é o caminho do agendador.
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
  return segredoConfere(request.headers.get('authorization'), `Bearer ${esperado}`);
}

/**
 * O caminho do agendador. Só o segredo abre — nunca a sessão: um GET autenticado
 * por cookie seria disparável por qualquer página que o usuário logado abrisse.
 */
export async function GET(request: Request) {
  if (!autorizadoComoCron(request)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  return processar(true);
}

export async function POST(request: Request) {
  const usuario = await getSessionUser().catch(() => null);
  const cron = autorizadoComoCron(request);
  if (!usuario && !cron) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }
  return processar(cron, usuario?.accountId);
}

async function processar(cron: boolean, accountId?: string) {
  if (!process.env.PAGESPEED_API_KEY) {
    // Configuração ausente é 503, não 500: o servidor está bem, a integração é
    // que não está ligada. E jamais devolve nota inventada.
    return NextResponse.json(
      { erro: 'Análise técnica não configurada neste servidor.', configurada: false },
      { status: 503 },
    );
  }

  /**
   * O cron não tem sessão, logo não tem conta — mas também NÃO roda sem uma.
   *
   * Rodava. Com `withoutAccount`, sem `app.account_id`, e as tabelas de
   * qualidade estão com RLS FORCE: a fila era invisível, o endpoint respondia
   * "fila vazia" todo dia, e nenhuma análise agendada jamais aconteceu. Nem um
   * erro aparecia. Pior: se a reivindicação tivesse funcionado,
   * `registrarSucesso` gravaria `account_id = app.current_account_id()` — NULL
   * numa coluna NOT NULL — e o trabalho já pago ao Google se perderia ao salvar.
   *
   * Agora o cron PERGUNTA em quais contas há trabalho (função `SECURITY
   * DEFINER` estreita, que devolve só identificadores de conta) e processa
   * dentro de `withAccount`, como um usuário logado daquela conta. A política
   * vale o tempo todo, e um defeito aqui erra uma conta em vez da base inteira.
   */
  let contaDoJob = accountId;
  let restantes = 0;

  if (cron) {
    const contas = await withoutAccount((db) =>
      db.query<{ conta: string }>('select app.contas_com_job_pendente($1) as conta', [
        MINUTOS_ATE_ABANDONO,
      ]),
    );
    if (contas.length === 0) {
      return NextResponse.json({ processado: false, motivo: 'fila vazia' });
    }
    // A mais antiga primeiro — a função já devolve nessa ordem. As demais ficam
    // para as próximas invocações, e o número vai na resposta: uma fila que não
    // anda precisa ser visível, não silenciosa.
    contaDoJob = contas[0]!.conta;
    restantes = contas.length - 1;
  }

  const executar = <T,>(fn: Parameters<typeof withAccount<T>>[1]) =>
    withAccount<T>(contaDoJob!, fn);

  const job = await executar((db) => reivindicarProximo(db));
  // Corrida possível: outra invocação pegou o job entre a pergunta e a
  // reivindicação. `for update skip locked` garante que ninguém processa duas
  // vezes; aqui só se relata que não sobrou nada nesta conta.
  if (!job) return NextResponse.json({ processado: false, motivo: 'fila vazia', contasRestantes: restantes });

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

    return NextResponse.json({
      processado: true,
      jobId: job.id,
      url: job.url,
      strategy: job.strategy,
      campo,
      contasRestantes: restantes,
    });
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
