import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionUser, type SessionUser } from '@/server/auth/session';
import { listarSites, listarClientes, type Site, type Cliente } from '@/server/services/sites';
import { parsePeriodParams, periodLabel, type PeriodInput, type ResolvedPeriod } from '@/lib/periodo';
import { withAccount } from '@/server/db';
import { resolvePeriod } from '@/server/metrics/queries';

export type ParametrosBusca = Record<string, string | string[] | undefined>;

function texto(valor: string | string[] | undefined): string | null {
  return typeof valor === 'string' ? valor : null;
}

export async function exigirSessao(): Promise<SessionUser> {
  const usuario = await getSessionUser();
  if (!usuario) redirect('/entrar');
  return usuario;
}

export type ContextoPainel = {
  usuario: SessionUser;
  clientes: Cliente[];
  sites: Site[];
  /** Site em contexto. `null` quando a conta ainda não cadastrou nenhum. */
  site: Site | null;
  periodoInput: PeriodInput;
  /** Resolvido no fuso do site. `null` junto com `site`. */
  periodo: ResolvedPeriod | null;
  clienteId: string | null;
  /** Query string a propagar na navegação, para não perder os filtros. */
  busca: string;
};

/**
 * Contexto compartilhado das telas do painel.
 *
 * Site, cliente e período vêm da URL e voltam para a URL. É isso que faz
 * recarregar, abrir link direto e usar voltar/avançar preservarem um estado
 * válido — sem nenhum estado global de cliente para sincronizar.
 */
export async function contextoPainel(searchParams: ParametrosBusca): Promise<ContextoPainel> {
  const usuario = await exigirSessao();

  const clienteId = texto(searchParams.cliente);
  // Sequencial, não `Promise.all`: cada chamada abre a própria transação, e o
  // pool em serverless é pequeno. Duas conexões simultâneas por render, somadas
  // às do layout, chegariam ao limite sem necessidade.
  const clientes = await listarClientes(usuario.accountId);
  const sites = await listarSites(usuario.accountId, clienteId ?? undefined);

  const pedido = texto(searchParams.site);
  // Um id de outra conta simplesmente não está na lista: cai no padrão em vez
  // de vazar dados. A RLS já barraria, isto evita até a tentativa.
  const site = sites.find((s) => s.id === pedido) ?? sites.find((s) => s.totalEventos > 0) ?? sites[0] ?? null;

  const periodoInput = parsePeriodParams({
    periodo: texto(searchParams.periodo),
    de: texto(searchParams.de),
    ate: texto(searchParams.ate),
  });

  const periodo = site
    ? await withAccount(usuario.accountId, async (db) => {
        const resolvido = await resolvePeriod(db, site.timezone, periodoInput);
        return { ...resolvido, label: periodLabel(resolvido) };
      })
    : null;

  const params = new URLSearchParams();
  if (site) params.set('site', site.id);
  if (clienteId) params.set('cliente', clienteId);
  params.set('periodo', periodoInput.key);
  if (periodoInput.de) params.set('de', periodoInput.de);
  if (periodoInput.ate) params.set('ate', periodoInput.ate);

  return {
    usuario,
    clientes,
    sites,
    site,
    periodoInput,
    periodo,
    clienteId,
    busca: `?${params.toString()}`,
  };
}
