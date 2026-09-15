'use server';

import { revalidatePath } from 'next/cache';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { enfileirar } from '@/server/qualidade/auditoria';
import { validarUrlPublica, MOTIVO_LABEL } from '@/server/qualidade/url-publica';
import type { Estrategia } from '@/server/qualidade/pagespeed';

export type EstadoAnalise = { erro?: string; aviso?: string; ok?: string };

/**
 * Cadastra uma URL para monitoramento.
 *
 * A URL precisa ser pública E pertencer ao domínio do site. Sem a segunda
 * regra, qualquer usuário poderia cadastrar qualquer endereço da internet e
 * gastar a quota da conta auditando site alheio.
 */
export async function cadastrarUrl(_anterior: EstadoAnalise, dados: FormData): Promise<EstadoAnalise> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const bruta = String(dados.get('url') ?? '').trim();
  const prioritaria = dados.get('prioritaria') === 'on';

  const validada = validarUrlPublica(bruta);
  if (!validada.ok) return { erro: MOTIVO_LABEL[validada.motivo] };

  try {
    const resultado = await withAccount(usuario.accountId, async (db) => {
      const site = await db.one<{ domain: string }>('select domain from sites where id = $1', [siteId]);
      if (!site) return { erro: 'Site não encontrado.' };

      const host = new URL(validada.url).hostname.replace(/^www\./, '').toLowerCase();
      const dominio = site.domain.replace(/^www\./, '').toLowerCase();
      if (host !== dominio && !host.endsWith(`.${dominio}`)) {
        return { erro: `A URL precisa ser do domínio ${site.domain}.` };
      }

      await db.query(
        `insert into monitored_urls (account_id, site_id, url, prioritaria)
         values (app.current_account_id(), $1, $2, $3)
         on conflict (site_id, url) do update set prioritaria = excluded.prioritaria`,
        [siteId, validada.url, prioritaria],
      );
      return { ok: 'URL cadastrada para monitoramento.' };
    });

    revalidatePath(`/sites/${siteId}/qualidade`);
    return resultado;
  } catch (erro) {
    console.error('[qualidade] falha ao cadastrar URL', erro);
    return { erro: 'Não foi possível cadastrar a URL.' };
  }
}

/**
 * Enfileira uma análise.
 *
 * Só enfileira: quem gasta os 11 a 48 segundos é o endpoint de processamento,
 * chamado logo depois pelo cliente. Fazer a chamada externa aqui dentro
 * prenderia o formulário e estouraria o tempo da função nas páginas pesadas.
 */
export async function solicitarAnalise(_anterior: EstadoAnalise, dados: FormData): Promise<EstadoAnalise> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const url = String(dados.get('url') ?? '');
  const strategy = String(dados.get('strategy') ?? 'mobile') as Estrategia;

  if (!process.env.PAGESPEED_API_KEY) {
    return { erro: 'Análise técnica não configurada neste servidor: falta PAGESPEED_API_KEY.' };
  }

  try {
    const r = await withAccount(usuario.accountId, (db) =>
      enfileirar(db, { siteId, url, strategy }),
    );
    revalidatePath(`/sites/${siteId}/qualidade`);
    if (!r.ok) return { erro: r.erro };
    // Clique repetido não vira segunda tarefa — e a tela diz isso em vez de
    // fingir que enfileirou de novo.
    return r.jaExistia
      ? { aviso: 'Já havia uma análise desta URL na fila. Ela vale para este pedido também.' }
      : { ok: 'Análise enfileirada.' };
  } catch (erro) {
    console.error('[qualidade] falha ao enfileirar', erro);
    return { erro: 'Não foi possível enfileirar a análise.' };
  }
}

/**
 * Deixa de monitorar uma URL.
 *
 * Faltava, e o custo não era estético. URL prioritária é reanalisada a cada
 * sete dias, e o plano Hobby dá **uma execução automática por dia**: um
 * endereço digitado errado entrava na rotação e consumia a vaga diária para
 * sempre, sem nenhuma forma de desfazer pela interface. Cadastrar sem
 * descadastrar é uma porta que só abre.
 *
 * Remove a URL e as tarefas que ainda não rodaram. O que já foi MEDIDO fica:
 * `lighthouse_results` e `crux_snapshots` são histórico, e apagar medição
 * porque alguém parou de acompanhar a página reescreveria o passado.
 */
export async function removerUrl(_anterior: EstadoAnalise, dados: FormData): Promise<EstadoAnalise> {
  const usuario = await exigirSessao();
  const siteId = String(dados.get('siteId') ?? '');
  const url = String(dados.get('url') ?? '');
  if (!siteId || !url) return { erro: 'URL inválida.' };

  try {
    const resultado = await withAccount(usuario.accountId, async (db) => {
      const linha = await db.one<{ id: string }>(
        'delete from monitored_urls where site_id = $1 and url = $2 returning id',
        [siteId, url],
      );
      if (!linha) return { erro: 'Esta URL não está sendo monitorada.' };

      // Só as que ainda não rodaram. Uma análise em execução termina e grava:
      // interromper no meio deixaria a fila com um registro sem desfecho.
      await db.query(
        `delete from audit_jobs where site_id = $1 and url = $2 and status = 'pendente'`,
        [siteId, url],
      );
      return { ok: 'URL removida do monitoramento. As medições já feitas continuam no histórico.' };
    });

    revalidatePath(`/sites/${siteId}/qualidade`);
    return resultado;
  } catch (erro) {
    console.error('[qualidade] falha ao remover URL', erro);
    return { erro: 'Não foi possível remover a URL.' };
  }
}
