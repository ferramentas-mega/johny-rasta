import { describe, it, expect } from 'vitest';
import {
  faixaDaSerie,
  resumirSerie,
  segmentosDaSerie,
  somaDaSerie,
  variacaoDaSerie,
  variacaoEntre,
  type Ponto,
} from '@/lib/evidencias';

/**
 * Evidências de desempenho.
 *
 * `lighthouse_results` e `crux_snapshots` gravam uma linha nova a cada coleta,
 * de propósito — os comentários no código dizem por quê. E **toda** consulta do
 * projeto lia `distinct on (…)`: o histórico era guardado para uma comparação
 * que nenhuma tela fazia.
 *
 * O que estes testes travam é o que a série se recusa a desenhar.
 */

const EM = (dias: number) => new Date(2026, 8, dias);
const p = (valor: number | null, dia: number): Ponto => ({ valor, em: EM(dia) });

describe('ausência de medição não é medição de zero', () => {
  it('sem valor anterior não existe variação — nem "0"', () => {
    expect(variacaoEntre(null, 80, true)).toBeNull();
    expect(variacaoEntre(80, null, true)).toBeNull();
  });

  it('delta zero é diferente de ausência: ali medimos as duas e não mudou', () => {
    expect(variacaoEntre(80, 80, true)).toEqual({ delta: 0, direcao: 'igual' });
  });

  it('uma medição só não tem base comparável', () => {
    expect(variacaoDaSerie([p(80, 1)], true)).toBeNull();
    expect(variacaoDaSerie([], true)).toBeNull();
  });

  it('série que TERMINA sem medição não perdeu desempenho', () => {
    // O último ponto é um buraco. Comparar contra ele afirmaria uma queda que
    // ninguém mediu — a comparação é entre a primeira e a última COM valor.
    const v = variacaoDaSerie([p(40, 1), p(70, 2), p(null, 3)], true);
    expect(v).toEqual({ delta: 30, direcao: 'melhora' });
  });

  it('série que COMEÇA sem medição compara a partir do primeiro valor', () => {
    const v = variacaoDaSerie([p(null, 1), p(90, 2), p(60, 3)], true);
    expect(v).toEqual({ delta: -30, direcao: 'piora' });
  });

  it('faixa ignora os buracos, e é nula quando não há valor nenhum', () => {
    expect(faixaDaSerie([p(null, 1), p(34, 2), p(null, 3), p(91, 4)])).toEqual({
      minimo: 34,
      maximo: 91,
    });
    expect(faixaDaSerie([p(null, 1), p(null, 2)])).toBeNull();
  });
});

describe('a direção depende da métrica, e quem chama informa qual é', () => {
  /*
   * Nota subindo é melhora; LCP subindo é piora. Inferir pelo nome da coluna
   * seria o tipo de esperteza que erra em silêncio no dia em que a coluna
   * mudar — e o erro apareceria como uma cor verde num gráfico que piorou.
   */

  it('nota: subir é melhora', () => {
    expect(variacaoEntre(34, 91, true)!.direcao).toBe('melhora');
    expect(variacaoEntre(91, 34, true)!.direcao).toBe('piora');
  });

  it('LCP: subir é PIORA', () => {
    expect(variacaoEntre(3200, 12000, false)!.direcao).toBe('piora');
    expect(variacaoEntre(12000, 3200, false)!.direcao).toBe('melhora');
  });

  it('o delta mantém o sinal bruto, independente da direção', () => {
    // A magnitude é do dado; a leitura ("melhorou") é da métrica. Guardar as
    // duas separadas deixa a tela escolher como mostrar sem reinterpretar.
    expect(variacaoEntre(12000, 3200, false)).toEqual({ delta: -8800, direcao: 'melhora' });
  });
});

describe('o desenho: buraco interrompe a linha, nunca desce até o chão', () => {
  /*
   * É a regra central do arquivo. Um gráfico é lido pela FORMA: uma linha que
   * cai até a base e volta conta a história de um colapso momentâneo que não
   * aconteceu — o que houve foi uma análise que falhou.
   */

  it('série sem buracos é um segmento só', () => {
    const { segmentos, pontosIsolados } = segmentosDaSerie(
      [p(10, 1), p(20, 2), p(30, 3)],
      100,
      40,
    );
    expect(segmentos).toHaveLength(1);
    expect(pontosIsolados).toHaveLength(0);
  });

  it('um buraco no meio parte a linha em DOIS segmentos', () => {
    const { segmentos } = segmentosDaSerie([p(10, 1), p(20, 2), p(null, 3), p(30, 4), p(40, 5)], 100, 40);
    expect(segmentos).toHaveLength(2);
    // E nenhum dos dois passa pelo chão por causa do buraco: o menor valor da
    // série é 10, e é ele que fica na base.
    expect(segmentos.join(' ')).not.toMatch(/\b3 40\b/);
  });

  it('ponto cercado de buracos vira um círculo, não some da tela', () => {
    // Sem isto, a medição existiria no banco e não na tela: não há segmento
    // para desenhar com um ponto só.
    const { segmentos, pontosIsolados } = segmentosDaSerie(
      [p(null, 1), p(50, 2), p(null, 3)],
      100,
      40,
    );
    expect(segmentos).toHaveLength(0);
    expect(pontosIsolados).toHaveLength(1);
  });

  it('série sem valor nenhum não desenha nada', () => {
    expect(segmentosDaSerie([p(null, 1), p(null, 2)], 100, 40)).toEqual({
      segmentos: [],
      pontosIsolados: [],
    });
  });
});

describe('a régua é a faixa da própria série', () => {
  it('o menor valor fica na base e o maior no topo', () => {
    // Contra uma régua fixa de 0–100, a diferença entre 34 e 38 seria quatro
    // pixels de 44 — invisível, e é justamente ela que a evidência existe para
    // mostrar.
    const { segmentos } = segmentosDaSerie([p(34, 1), p(38, 2)], 100, 40);
    expect(segmentos[0]).toBe('M 0.0 40.0 L 100.0 0.0');
  });

  it('série de valor constante fica no MEIO, não colada no topo', () => {
    // Com amplitude zero, dividir pela amplitude daria NaN; escolher o topo ou
    // o chão afirmaria que o valor é alto ou baixo, e uma série constante não
    // diz nada sobre isso.
    const { segmentos } = segmentosDaSerie([p(70, 1), p(70, 2)], 100, 40);
    expect(segmentos[0]).toBe('M 0.0 20.0 L 100.0 20.0');
  });

  it('um ponto só vai ao centro horizontal, em vez da borda esquerda', () => {
    const { pontosIsolados } = segmentosDaSerie([p(70, 1)], 100, 40);
    expect(pontosIsolados[0]).toEqual({ x: 50, y: 20 });
  });
});

describe('resumo da série', () => {
  const p = (valor: number | null, dia: number): Ponto => ({ valor, em: new Date(2026, 0, dia) });

  it('pico, mínimo e média de uma série cheia', () => {
    const r = resumirSerie([p(10, 1), p(30, 2), p(20, 3)]);
    expect(r).toEqual({ pico: 30, minimo: 10, media: 20, medidos: 3 });
  });

  it('buraco NÃO entra como zero na média', () => {
    // Com o buraco contando como zero, a média seria 20/3 = 6,67 — e a tela
    // afirmaria que houve zero num dia em que ninguém mediu.
    const r = resumirSerie([p(10, 1), p(null, 2), p(30, 3)]);
    expect(r?.media).toBe(20);
    expect(r?.medidos).toBe(2);
    expect(r?.minimo).toBe(10);
  });

  it('série só de buracos devolve null, não zero', () => {
    expect(resumirSerie([p(null, 1), p(null, 2)])).toBeNull();
    expect(somaDaSerie([p(null, 1)])).toBeNull();
  });

  it('um ponto só tem pico igual ao mínimo, e isso não é defeito', () => {
    expect(resumirSerie([p(7, 1)])).toEqual({ pico: 7, minimo: 7, media: 7, medidos: 1 });
  });

  it('a soma ignora buraco', () => {
    expect(somaDaSerie([p(10, 1), p(null, 2), p(5, 3)])).toBe(15);
  });

  it('zero medido é diferente de ausência', () => {
    // Zero afirma "medimos e não houve": entra na conta.
    expect(resumirSerie([p(0, 1), p(10, 2)])).toEqual({ pico: 10, minimo: 0, media: 5, medidos: 2 });
  });
});
