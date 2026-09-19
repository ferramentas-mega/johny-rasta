import { describe, it, expect } from 'vitest';
import { fatiasDaOrigem, corDaLinha, ROTULO_OUTRAS } from '@/lib/origens';
import { diasRotulados } from '@/lib/eixo';

/**
 * Fatias do anel de origem e rótulos do eixo X.
 *
 * O que se protege: no máximo cinco fatias, com o resto agrupado; a soma das
 * fatias é o total das linhas (nada some ao agrupar); total zero não vira 0%;
 * e a cor da linha na tabela é a da fatia que a contém.
 */

const linha = (origem: string, sessoes: number) => ({ origem, sessoes });
const ler = (l: { origem: string; sessoes: number }) => ({ rotulo: l.origem, valor: l.sessoes });

describe('fatiasDaOrigem', () => {
  it('até cinco origens viram cinco fatias, sem "Outras"', () => {
    const fatias = fatiasDaOrigem([linha('google', 5), linha('direto', 3), linha('meta', 1)], ler);
    expect(fatias.map((f) => f.rotulo)).toEqual(['google', 'direto', 'meta']);
    expect(fatias.map((f) => f.cor)).toEqual([0, 1, 2]);
  });

  it('acima de cinco, as quatro maiores ficam e o resto vira "Outras" — sem perder sessão', () => {
    const linhas = [linha('a', 10), linha('b', 9), linha('c', 8), linha('d', 7), linha('e', 2), linha('f', 1), linha('g', 1)];
    const fatias = fatiasDaOrigem(linhas, ler);
    expect(fatias).toHaveLength(5);
    expect(fatias[4]!.rotulo).toBe(ROTULO_OUTRAS);
    expect(fatias[4]!.valor).toBe(4);
    expect(fatias[4]!.itens.map((l) => l.origem)).toEqual(['e', 'f', 'g']);
    expect(fatias.reduce((t, f) => t + f.valor, 0)).toBe(38);
  });

  it('ordena por valor mesmo que a lista chegue fora de ordem', () => {
    const fatias = fatiasDaOrigem([linha('pequena', 1), linha('grande', 9)], ler);
    expect(fatias[0]!.rotulo).toBe('grande');
  });

  it('a participação soma 1 e total zero não vira 0%', () => {
    const cheias = fatiasDaOrigem([linha('a', 3), linha('b', 1)], ler);
    expect(cheias.map((f) => f.participacao)).toEqual([0.75, 0.25]);

    const vazias = fatiasDaOrigem([linha('a', 0), linha('b', 0)], ler);
    expect(vazias.every((f) => f.participacao === null)).toBe(true);
  });

  it('a cor da linha é a da fatia que a contém; "Outras" pinta todas as suas linhas com a quinta cor', () => {
    const linhas = [linha('a', 10), linha('b', 9), linha('c', 8), linha('d', 7), linha('e', 2), linha('f', 1)];
    const fatias = fatiasDaOrigem(linhas, ler);
    expect(corDaLinha(fatias, linhas[0]!)).toBe(0);
    expect(corDaLinha(fatias, linhas[4]!)).toBe(4);
    expect(corDaLinha(fatias, linhas[5]!)).toBe(4);
    expect(corDaLinha(fatias, linha('x', 0))).toBeNull();
  });
});

describe('diasRotulados (eixo X do gráfico)', () => {
  it('até 12 dias, todos ganham rótulo', () => {
    expect(diasRotulados(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(diasRotulados(1)).toEqual([0]);
    expect(diasRotulados(0)).toEqual([]);
  });

  it('em 30 dias, um a cada cinco, sempre com o primeiro e o último — e sem penúltimo colado', () => {
    const dias = diasRotulados(30);
    expect(dias[0]).toBe(0);
    expect(dias[dias.length - 1]).toBe(29);
    // 25 estaria a 4 dias do último (passo 5): entra. 28 nunca é candidato.
    expect(dias).toEqual([0, 5, 10, 15, 20, 25, 29]);
  });

  it('o penúltimo candidato some quando ficaria colado no último', () => {
    // 31 dias: passo 5, candidatos 0,5,…,30; 30 é o último, então nada cola.
    expect(diasRotulados(31)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    // 32 dias: passo 5; 30 fica a 1 dia do último (31) — some.
    expect(diasRotulados(32)).toEqual([0, 5, 10, 15, 20, 25, 31]);
  });
});
