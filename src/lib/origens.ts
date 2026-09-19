/**
 * Fatias do gráfico de origem.
 *
 * O donut mostra no máximo CINCO fatias: as quatro maiores origens e "Outras",
 * que junta o resto. Mais que isso vira confete — fatias de 2% sem nome legível
 * — e a tabela ao lado continua listando todas, com o mesmo número.
 *
 * A participação é uma RAZÃO sobre o total que a própria consulta devolveu;
 * nenhuma contagem nasce aqui. Total zero não tem fatia: `participacao` vai a
 * `null`, e a tela diz "sem base" em vez de desenhar um anel vazio como se fosse
 * 0%.
 */

export type Fatia<T> = {
  rotulo: string;
  valor: number;
  /** Fração do total, ou `null` quando não há base. */
  participacao: number | null;
  /** Índice da cor na paleta de dados (0 → `--c1` … 4 → `--c5`). */
  cor: number;
  /** As linhas de origem que a fatia representa (várias, no caso de "Outras"). */
  itens: T[];
};

export const MAXIMO_DE_FATIAS = 5;
export const ROTULO_OUTRAS = 'Outras';

export function fatiasDaOrigem<T>(
  linhas: readonly T[],
  ler: (linha: T) => { rotulo: string; valor: number },
  maximo = MAXIMO_DE_FATIAS,
): Fatia<T>[] {
  const lidas = linhas.map((l) => ({ ...ler(l), linha: l }));
  const total = lidas.reduce((t, l) => t + l.valor, 0);
  const participacao = (v: number) => (total > 0 ? v / total : null);

  // A consulta já vem ordenada por sessões, mas a regra não pode depender disso.
  const ordenadas = [...lidas].sort((a, b) => b.valor - a.valor);
  const cabem = ordenadas.length <= maximo ? ordenadas : ordenadas.slice(0, maximo - 1);
  const resto = ordenadas.slice(cabem.length);

  const fatias: Fatia<T>[] = cabem.map((l, i) => ({
    rotulo: l.rotulo,
    valor: l.valor,
    participacao: participacao(l.valor),
    cor: i,
    itens: [l.linha],
  }));

  if (resto.length > 0) {
    const valor = resto.reduce((t, l) => t + l.valor, 0);
    fatias.push({ rotulo: ROTULO_OUTRAS, valor, participacao: participacao(valor), cor: fatias.length, itens: resto.map((l) => l.linha) });
  }
  return fatias;
}

/**
 * A cor de uma linha da tabela: a da fatia que a contém. "Outras" pinta todas
 * as suas linhas com a quinta cor — a tabela e o anel falam a mesma língua.
 */
export function corDaLinha<T>(fatias: readonly Fatia<T>[], linha: T): number | null {
  const fatia = fatias.find((f) => f.itens.includes(linha));
  return fatia ? fatia.cor : null;
}
