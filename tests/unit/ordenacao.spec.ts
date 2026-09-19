import { describe, it, expect } from 'vitest';
import { parseOrdem, proximaOrdem, ordenar, serializarOrdem } from '@/lib/ordenacao';

/**
 * Ordenação de tabela pela URL.
 *
 * O que se protege: uma URL editada à mão nunca derruba a tela; o clique na
 * coluna ativa INVERTE; empate mantém a ordem da consulta; e `null`
 * ("indisponível") nunca é tratado como o menor número.
 */

const COLUNAS = ['path', 'sessoes', 'cliques'] as const;
const PADRAO = { coluna: 'sessoes', direcao: 'desc' } as const;

describe('parseOrdem', () => {
  it('lê coluna e direção', () => {
    expect(parseOrdem('cliques:asc', COLUNAS, PADRAO)).toEqual({ coluna: 'cliques', direcao: 'asc' });
  });

  it('coluna desconhecida, direção inválida ou parâmetro repetido caem no padrão', () => {
    expect(parseOrdem('inventada:asc', COLUNAS, PADRAO)).toEqual(PADRAO);
    expect(parseOrdem('cliques:lateral', COLUNAS, PADRAO)).toEqual({ coluna: 'cliques', direcao: 'desc' });
    expect(parseOrdem(['cliques:asc', 'path:asc'], COLUNAS, PADRAO)).toEqual(PADRAO);
    expect(parseOrdem(undefined, COLUNAS, PADRAO)).toEqual(PADRAO);
  });

  it('serializa o que lê', () => {
    const ordem = { coluna: 'path', direcao: 'asc' } as const;
    expect(parseOrdem(serializarOrdem(ordem), COLUNAS, PADRAO)).toEqual(ordem);
  });
});

describe('proximaOrdem', () => {
  it('a coluna ativa inverte; uma nova começa em decrescente (número) ou crescente (texto)', () => {
    expect(proximaOrdem({ coluna: 'sessoes', direcao: 'desc' }, 'sessoes')).toEqual({ coluna: 'sessoes', direcao: 'asc' });
    expect(proximaOrdem({ coluna: 'sessoes', direcao: 'asc' }, 'sessoes')).toEqual({ coluna: 'sessoes', direcao: 'desc' });
    expect(proximaOrdem({ coluna: 'sessoes', direcao: 'asc' }, 'cliques')).toEqual({ coluna: 'cliques', direcao: 'desc' });
    expect(proximaOrdem({ coluna: 'sessoes', direcao: 'asc' }, 'path', 'texto')).toEqual({ coluna: 'path', direcao: 'asc' });
  });
});

describe('ordenar', () => {
  const linhas = [
    { path: '/b', sessoes: 3 },
    { path: '/a', sessoes: 7 },
    { path: '/c', sessoes: 3 },
    { path: '/d', sessoes: null },
  ];

  it('ordena números nas duas direções e mantém a ordem de chegada no empate', () => {
    expect(ordenar(linhas, (l) => l.sessoes, 'desc').map((l) => l.path)).toEqual(['/a', '/b', '/c', '/d']);
    expect(ordenar(linhas, (l) => l.sessoes, 'asc').map((l) => l.path)).toEqual(['/b', '/c', '/a', '/d']);
  });

  it('`null` vai para o fim nas duas direções: indisponível não é menor que zero', () => {
    const asc = ordenar(linhas, (l) => l.sessoes, 'asc');
    const desc = ordenar(linhas, (l) => l.sessoes, 'desc');
    expect(asc[asc.length - 1]!.path).toBe('/d');
    expect(desc[desc.length - 1]!.path).toBe('/d');
  });

  it('ordena texto com a colação pt-BR', () => {
    const nomes = [{ n: 'Ébano' }, { n: 'abacate' }, { n: 'Zebra' }];
    expect(ordenar(nomes, (l) => l.n, 'asc').map((l) => l.n)).toEqual(['abacate', 'Ébano', 'Zebra']);
  });

  it('não muda a lista original', () => {
    const copia = [...linhas];
    ordenar(linhas, (l) => l.sessoes, 'asc');
    expect(linhas).toEqual(copia);
  });
});
