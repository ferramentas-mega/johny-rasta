import { describe, it, expect } from 'vitest';
import { agruparSitesPorCliente } from '@/lib/clientes';

/**
 * Agrupamento de sites por cliente.
 *
 * A função não ordena: a ordem dos grupos é a ordem em que os sites chegam.
 * Isso é afirmado aqui de propósito — se alguém acrescentar um `sort`, a tela
 * passa a ter uma regra de ordenação diferente da consulta.
 */
describe('agruparSitesPorCliente', () => {
  const site = (clientId: string, clienteNome: string, name: string) => ({ clientId, clienteNome, name });

  it('um grupo por cliente, na ordem de chegada, com os sites na ordem de chegada', () => {
    const grupos = agruparSitesPorCliente([
      site('b', 'Beta', 'b1'),
      site('a', 'Alfa', 'a1'),
      site('b', 'Beta', 'b2'),
    ]);
    expect(grupos.map((g) => g.clienteNome)).toEqual(['Beta', 'Alfa']);
    expect(grupos[0]!.sites.map((s) => s.name)).toEqual(['b1', 'b2']);
    expect(grupos[1]!.sites.map((s) => s.name)).toEqual(['a1']);
  });

  it('lista vazia devolve nenhum grupo — não um grupo vazio', () => {
    expect(agruparSitesPorCliente([])).toEqual([]);
  });

  it('agrupa pelo id, não pelo nome: dois clientes homônimos são dois grupos', () => {
    const grupos = agruparSitesPorCliente([site('1', 'Loja', 'x'), site('2', 'Loja', 'y')]);
    expect(grupos).toHaveLength(2);
  });
});
