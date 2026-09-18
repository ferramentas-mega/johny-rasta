/**
 * Agrupamento de sites por cliente — a parte PURA.
 *
 * O cliente é a unidade de trabalho de quem opera o painel: a pergunta do dia
 * é "como está o cliente X", não "como está o site Y". A grade plana de sites
 * respondia a segunda e escondia a primeira numa carteira de vinte sites. Aqui
 * a ordem dos grupos é a ordem em que os sites CHEGAM (a consulta já ordena por
 * cliente e site), e a função não reordena nada: reordenar aqui criaria uma
 * segunda regra de ordenação, que divergiria da consulta no primeiro ajuste.
 */
export type GrupoDeCliente<S extends { clientId: string; clienteNome: string }> = {
  clienteId: string;
  clienteNome: string;
  sites: S[];
};

export function agruparSitesPorCliente<S extends { clientId: string; clienteNome: string }>(
  sites: S[],
): GrupoDeCliente<S>[] {
  const grupos: GrupoDeCliente<S>[] = [];
  const porId = new Map<string, GrupoDeCliente<S>>();
  for (const site of sites) {
    let grupo = porId.get(site.clientId);
    if (!grupo) {
      grupo = { clienteId: site.clientId, clienteNome: site.clienteNome, sites: [] };
      porId.set(site.clientId, grupo);
      grupos.push(grupo);
    }
    grupo.sites.push(site);
  }
  return grupos;
}
