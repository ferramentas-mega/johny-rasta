import { describe, it, expect } from 'vitest';
import { eixoDeContagem, escalasDoGrafico, INTERVALOS_PADRAO } from '@/lib/eixo';

/**
 * Marcas do eixo do gráfico.
 *
 * O que estes testes protegem não é "o número bonito aparece". São duas coisas:
 *
 * 1. A régua não mente sobre o próprio espaçamento. As linhas são desenhadas a
 *    distâncias iguais, então os rótulos precisam crescer em passos iguais. A
 *    versão anterior rotulava `topo × [0, .25, .5, .75, 1]` sobre topos que não
 *    dividiam por quatro, e o pior caso caía no site pequeno.
 * 2. Um eixo não se mexe por causa do outro. O gráfico tem duas séries sobre as
 *    mesmas linhas; se a escala dos formulários mudasse ao trocar a métrica
 *    principal, a linha tracejada mudaria de altura sem nenhum formulário ter
 *    entrado — que é a confusão que o eixo próprio existe para eliminar.
 */

const passos = (marcas: number[]) => marcas.slice(1).map((v, i) => v - marcas[i]!);

describe('a régua não mente sobre o espaçamento', () => {
  it('todo rótulo é inteiro, em qualquer máximo plausível', () => {
    for (let maximo = 0; maximo <= 2000; maximo += 1) {
      for (const marca of eixoDeContagem(maximo).marcas) {
        expect(Number.isInteger(marca)).toBe(true);
      }
    }
  });

  it('linhas igualmente espaçadas recebem rótulos igualmente espaçados', () => {
    for (let maximo = 0; maximo <= 2000; maximo += 1) {
      expect(new Set(passos(eixoDeContagem(maximo).marcas)).size).toBe(1);
    }
  });

  it('o topo nunca fica abaixo do maior valor — a linha não sai do desenho', () => {
    for (let maximo = 0; maximo <= 2000; maximo += 1) {
      expect(eixoDeContagem(maximo).topo).toBeGreaterThanOrEqual(maximo);
    }
  });

  it('os casos exatos que estavam errados', () => {
    // Antes: 0, 0, 1, 1, 1 — dois zeros e três uns em cinco linhas.
    expect(eixoDeContagem(1).marcas).toEqual([0, 1, 2, 3, 4, 5]);
    // Antes: 0, 1, 3, 4, 5 — passos de 1, 2, 1, 1.
    expect(eixoDeContagem(4).marcas).toEqual([0, 1, 2, 3, 4, 5]);
    // Antes: 0, 6, 13, 19, 25.
    expect(eixoDeContagem(23).marcas).toEqual([0, 5, 10, 15, 20, 25]);
  });
});

describe('a contagem de linhas é fixa', () => {
  it('sempre o mesmo número de marcas, qualquer que seja o máximo', () => {
    // É o que permite dois eixos sobre as mesmas linhas. Contagem variável
    // apertaria melhor a escala e faria a série da direita pular ao trocar a
    // métrica da esquerda.
    for (let maximo = 0; maximo <= 2000; maximo += 1) {
      expect(eixoDeContagem(maximo).marcas).toHaveLength(INTERVALOS_PADRAO + 1);
    }
  });

  it('cada eixo depende SÓ da própria série', () => {
    const formularios = eixoDeContagem(2);
    expect(eixoDeContagem(2)).toEqual(formularios);
    expect(formularios.topo).toBe(eixoDeContagem(2).topo);
  });
});

describe('a série de formulários não é normalizada contra a principal', () => {
  /*
   * Este é o defeito do protótipo, e o motivo de o gráfico ter dois eixos: a
   * linha de formulários era redimensionada contra o eixo de visitas e sugeria
   * centenas onde o cartão dizia dezenas.
   *
   * A prova mora aqui, e não na tela, porque na tela ela não decide nada com a
   * massa atual: as duas séries do navegador têm máximos 5 e 2, caem no mesmo
   * topo, e aí a implementação certa e a errada desenham a MESMA curva. Medido —
   * reintroduzi a normalização no componente e a prova de navegador continuou
   * passando. Com os números escolhidos aqui, a diferença é gritante.
   */
  const DIAS_DE_FORMULARIO = [0, 1, 3, 2, 1];

  it('centenas de visitas ao lado de três formulários não achatam os formulários', () => {
    const movimentado = escalasDoGrafico([180, 240, 300, 210, 260], DIAS_DE_FORMULARIO);
    const parado = escalasDoGrafico([2, 3, 1, 2, 3], DIAS_DE_FORMULARIO);

    // A MESMA série de formulários, com a principal 100× maior ao lado.
    expect(movimentado.direita).toEqual(parado.direita);
    // E ela ocupa a régua dela, não um canto do eixo da esquerda: topo 5 para
    // um pico de 3 formulários, contra 500 para um pico de 300 visitas.
    expect(movimentado.direita.topo).toBe(5);
    expect(movimentado.esquerda.topo).toBe(500);
  });

  it('trocar a métrica principal não mexe no eixo dos formulários', () => {
    // É a troca que o usuário faz nos botões do gráfico: visitas → cliques.
    const visitas = escalasDoGrafico([40, 55, 30], DIAS_DE_FORMULARIO);
    const cliques = escalasDoGrafico([3, 8, 5], DIAS_DE_FORMULARIO);

    expect(cliques.direita).toEqual(visitas.direita);
    expect(cliques.esquerda).not.toEqual(visitas.esquerda);
  });

  it('série principal vazia não leva a dos formulários junto', () => {
    const semVisitas = escalasDoGrafico([], DIAS_DE_FORMULARIO);
    expect(semVisitas.direita.topo).toBe(5);
    expect(semVisitas.esquerda.topo).toBe(INTERVALOS_PADRAO);
  });
});

describe('série sem valor nenhum', () => {
  it('site sem visita ainda tem régua, e não divide por zero', () => {
    // O gráfico precisa de um topo para desenhar a linha rente ao chão.
    for (const vazio of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const e = eixoDeContagem(vazio);
      expect(e.topo).toBe(INTERVALOS_PADRAO);
      expect(e.passo).toBe(1);
      expect(e.marcas[0]).toBe(0);
    }
  });
});
