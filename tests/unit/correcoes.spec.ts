import { describe, it, expect } from 'vitest';
import { separarCorrecoes, ordenar, maiorEconomia, type Correcao } from '@/lib/correcoes';

/**
 * Correções elegíveis.
 *
 * `lighthouse_results.auditorias` guardava 153 auditorias por análise desde o
 * esquema inicial e **nada no projeto lia a coluna** — enquanto a lista de
 * Otimizações mandava "abrir Qualidade técnica e ver os diagnósticos" numa tela
 * que não mostrava nenhum.
 *
 * O que estes testes travam não é a existência da lista: é o que ela se recusa
 * a afirmar.
 */

/**
 * Uma auditoria como ela sai de `interpretar` e vai para o `jsonb`.
 *
 * `nota` é lida com `in` e não com `??`: a primeira versão deste helper usava
 * `p.nota ?? 0`, que transformava em zero justamente o `null` que os testes de
 * auditoria informativa existem para exercitar. O helper apagava o caso.
 */
function auditoria(p: Omit<Partial<Correcao>, 'nota'> & { id: string; nota?: number | null }) {
  return {
    id: p.id,
    titulo: p.titulo ?? p.id,
    nota: 'nota' in p ? p.nota : 0,
    economiaMs: p.economiaMs ?? null,
    valorExibido: p.valorExibido ?? null,
  };
}

function gravadas(...itens: ReturnType<typeof auditoria>[]) {
  return Object.fromEntries(itens.map((a) => [a.id, a]));
}

describe('o que é correção e o que é informação', () => {
  it('auditoria com nota é correção', () => {
    const { correcoes } = separarCorrecoes(gravadas(auditoria({ id: 'render-blocking', nota: 0.2 })));
    expect(correcoes).toHaveLength(1);
    expect(correcoes[0]!.id).toBe('render-blocking');
  });

  it('auditoria SEM nota é informativa, e não vira pendência', () => {
    // O Lighthouse devolve a lista de requisições da rede e o tamanho do DOM
    // sem emitir veredito. Tratar isso como correção encheria a tela de itens
    // sobre os quais não existe decisão a tomar — e lista majoritariamente não
    // acionável treina quem olha a ignorar a lista inteira.
    const { correcoes, informativas } = separarCorrecoes(
      gravadas(
        auditoria({ id: 'network-requests', nota: null }),
        auditoria({ id: 'unminified-css', nota: 0.5 }),
      ),
    );
    expect(correcoes.map((c) => c.id)).toEqual(['unminified-css']);
    expect(informativas).toBe(1);
  });

  it('conta as informativas em vez de descartá-las em silêncio', () => {
    // A tela diz quantas ficaram de fora. Sumir com elas sem dizer faria a
    // lista parecer completa quando não é.
    const { informativas } = separarCorrecoes(
      gravadas(
        auditoria({ id: 'a', nota: null }),
        auditoria({ id: 'b', nota: null }),
        auditoria({ id: 'c', nota: null }),
      ),
    );
    expect(informativas).toBe(3);
  });
});

describe('desconfiança do que veio do jsonb', () => {
  /*
   * A coluna é escrita por uma versão do Lighthouse que muda — a medição real
   * veio na 13.4.1. Um campo que mudou de tipo não pode entrar numa ordenação
   * como se fosse número.
   */

  it('economia que não é número é tratada como ausente, nunca como zero', () => {
    const { correcoes } = separarCorrecoes({
      x: { id: 'x', titulo: 'X', nota: 0.4, economiaMs: '1200 ms', valorExibido: null },
    });
    expect(correcoes[0]!.economiaMs).toBeNull();
  });

  it('nota que não é número deixa a auditoria como informativa', () => {
    const { correcoes, informativas } = separarCorrecoes({
      x: { id: 'x', titulo: 'X', nota: 'ruim', economiaMs: 900 },
    });
    expect(correcoes).toHaveLength(0);
    expect(informativas).toBe(1);
  });

  it('entrada que não é objeto devolve lista vazia em vez de quebrar a tela', () => {
    for (const bruto of [null, undefined, 'texto', 42, []]) {
      expect(separarCorrecoes(bruto)).toEqual({ correcoes: [], informativas: 0 });
    }
  });

  it('auditoria sem título cai no id — nunca numa linha em branco', () => {
    const { correcoes } = separarCorrecoes({ 'sem-titulo': { nota: 0.1 } });
    expect(correcoes[0]!.titulo).toBe('sem-titulo');
  });
});

describe('ordem: ausência de estimativa não é estimativa de zero', () => {
  const comEconomia = (id: string, economiaMs: number | null, nota = 0.3): Correcao => ({
    id, titulo: id, nota, economiaMs, valorExibido: null,
  });

  it('quantificadas primeiro, da maior para a menor', () => {
    const ordenadas = ordenar([
      comEconomia('media', 500),
      comEconomia('grande', 3000),
      comEconomia('pequena', 20),
    ]);
    expect(ordenadas.map((c) => c.id)).toEqual(['grande', 'media', 'pequena']);
  });

  it('sem estimativa vai depois de uma estimativa de ZERO', () => {
    /*
     * É o caso que decide, e a primeira versão deste teste não o usava: com
     * `economiaMs ?? 0` na ordenação, uma correção de 20 ms continua na frente
     * de uma sem estimativa, então comparar contra 20 ms passava dos dois
     * jeitos e não provava nada.
     *
     * Contra ZERO os dois comportamentos se separam. Zero é uma estimativa —
     * o Lighthouse mediu e disse que não há ganho; ausência é não ter medido.
     * Tratar as duas como a mesma coisa é exatamente o que o projeto recusa.
     */
    const ordenadas = ordenar([comEconomia('sem', null), comEconomia('zero', 0)]);
    expect(ordenadas.map((c) => c.id)).toEqual(['zero', 'sem']);
  });

  it('e depois de qualquer estimativa positiva', () => {
    const ordenadas = ordenar([comEconomia('sem', null), comEconomia('vinte', 20)]);
    expect(ordenadas.map((c) => c.id)).toEqual(['vinte', 'sem']);
  });

  it('entre as sem estimativa, a nota mais baixa primeiro', () => {
    const ordenadas = ordenar([comEconomia('meia', null, 0.5), comEconomia('zero', null, 0)]);
    expect(ordenadas.map((c) => c.id)).toEqual(['zero', 'meia']);
  });

  it('a ordenação não altera a lista recebida', () => {
    const original = [comEconomia('a', 10), comEconomia('b', 900)];
    ordenar(original);
    expect(original.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('o resumo é a MAIOR economia, nunca a soma', () => {
  /*
   * `overallSavingsMs` é o ganho estimado daquela correção ISOLADA, contra a
   * mesma execução. Corrigir duas coisas não economiza a soma das duas: elas
   * disputam o mesmo caminho crítico. Somar produziria um número grande,
   * convincente e falso — e é o tipo de número que vai parar numa conversa com
   * o cliente.
   */

  const c = (id: string, economiaMs: number | null): Correcao => ({
    id, titulo: id, nota: 0.3, economiaMs, valorExibido: null,
  });

  it('devolve a maior, e não o total', () => {
    const maior = maiorEconomia([c('a', 1200), c('b', 800), c('c', 400)]);
    expect(maior).toBe(1200);
    expect(maior).not.toBe(2400);
  });

  it('ignora as sem estimativa em vez de contá-las como zero', () => {
    expect(maiorEconomia([c('a', null), c('b', 700), c('c', null)])).toBe(700);
  });

  it('sem nenhuma estimativa, devolve null — não zero', () => {
    // Zero afirmaria "medimos e não há ganho". Não houve estimativa nenhuma.
    expect(maiorEconomia([c('a', null), c('b', null)])).toBeNull();
    expect(maiorEconomia([])).toBeNull();
  });
});
