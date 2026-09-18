import 'server-only';
import { cache } from 'react';
import { withAccount } from '@/server/db';
import { listarSites } from '@/server/services/sites';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { listarOtimizacoes } from '@/server/qualidade/otimizacoes';
import { derivarAvisos, type Aviso } from '@/lib/avisos';

export * from '@/lib/avisos';

/**
 * Os avisos da conta, derivados na hora.
 *
 * `cache()` do React: o sino do cabeçalho e a página de avisos pedem a mesma
 * lista no MESMO render, e sem isto seriam duas varreduras de sinais por
 * requisição. O cache vive só nessa renderização — não atravessa requisições,
 * então nunca serve um aviso de outra conta nem um aviso velho.
 */
export const listarAvisos = cache(async (accountId: string): Promise<Aviso[]> => {
  const sites = await listarSites(accountId);
  const resumos = await resumoDeConfiguracao(accountId, sites.map((s) => s.id));
  const sinais = await withAccount(accountId, (db) => listarOtimizacoes(db));
  return derivarAvisos({ sites, resumos, sinais });
});
