/**
 * Ordenação de tabela, decidida na URL.
 *
 * O parâmetro tem a forma `coluna:asc` ou `coluna:desc` — e vive na URL, como o
 * período e a busca, pelo mesmo motivo: recarregar, abrir link direto e voltar
 * no navegador precisam devolver a mesma tabela. Um `useState` no cabeçalho
 * perderia a escolha a cada navegação.
 *
 * Clicar na coluna ativa INVERTE a direção; clicar numa coluna nova começa em
 * descendente, porque nas tabelas deste painel a pergunta é sempre "qual é o
 * maior" (mais sessões, mais cliques). Texto começa ascendente pela mesma
 * lógica invertida: A→Z é o que se espera de um nome.
 *
 * Tudo aqui é puro: a tela e o teste chamam a mesma função.
 */

export type Direcao = 'asc' | 'desc';
export type Ordem = { coluna: string; direcao: Direcao };

/**
 * Lê o parâmetro. Coluna desconhecida ou direção inválida caem no padrão —
 * uma URL editada à mão nunca derruba a tela.
 */
export function parseOrdem(bruto: string | string[] | undefined, colunas: readonly string[], padrao: Ordem): Ordem {
  if (typeof bruto !== 'string') return padrao;
  const [coluna, direcao] = bruto.split(':');
  if (!coluna || !colunas.includes(coluna)) return padrao;
  return { coluna, direcao: direcao === 'asc' ? 'asc' : 'desc' };
}

export function serializarOrdem(ordem: Ordem): string {
  return `${ordem.coluna}:${ordem.direcao}`;
}

/** A ordem que um clique no cabeçalho `coluna` produz a partir de `atual`. */
export function proximaOrdem(atual: Ordem, coluna: string, tipo: 'numero' | 'texto' = 'numero'): Ordem {
  if (atual.coluna === coluna) return { coluna, direcao: atual.direcao === 'desc' ? 'asc' : 'desc' };
  return { coluna, direcao: tipo === 'texto' ? 'asc' : 'desc' };
}

/**
 * Ordena uma cópia. Empate mantém a ordem de chegada (a da consulta), e
 * `null` vai sempre para o fim — "indisponível" não é menor que zero.
 */
export function ordenar<T>(linhas: readonly T[], valor: (linha: T) => number | string | null, direcao: Direcao): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return linhas
    .map((linha, i) => ({ linha, i, v: valor(linha) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), 'pt-BR');
      return c === 0 ? a.i - b.i : c * sinal;
    })
    .map((x) => x.linha);
}
