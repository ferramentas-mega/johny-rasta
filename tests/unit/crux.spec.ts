import { describe, it, expect } from 'vitest';
import { interpretar } from '@/server/qualidade/crux';

/**
 * CrUX é dado de CAMPO, e o único lugar de onde INP pode sair. As armadilhas
 * que estes testes fixam são todas de apresentação: confundir origem com
 * página, transformar ausência em zero, e apresentar a janela do CrUX como se
 * fosse o período escolhido no painel.
 */

const comDados = {
  record: {
    key: { url: 'https://exemplo.com/planos', formFactor: 'PHONE' },
    metrics: {
      largest_contentful_paint: { percentiles: { p75: 2216 } },
      interaction_to_next_paint: { percentiles: { p75: 184 } },
      // O CLS já apareceu como STRING em respostas reais, embora a
      // documentação mostre número. Aceitar as duas formas é de propósito.
      cumulative_layout_shift: { percentiles: { p75: '0.05' } },
    },
    collectionPeriod: {
      firstDate: { year: 2026, month: 8, day: 18 },
      lastDate: { year: 2026, month: 9, day: 14 },
    },
  },
};

describe('leitura de uma resposta com dados', () => {
  const r = interpretar(comDados, 'url', 'https://exemplo.com/planos', 'PHONE');

  it('lê os três indicadores de campo', () => {
    expect(r.lcpP75Ms).toBe(2216);
    expect(r.inpP75Ms).toBe(184);
    expect(r.clsP75).toBe(0.05);
  });

  it('aceita o p75 como string, sem perder o valor', () => {
    expect(typeof r.clsP75).toBe('number');
  });

  it('guarda a janela que a API devolveu, não o período do painel', () => {
    // 28 dias. Se o usuário escolher "7 dias" na tela, isto NÃO muda — e a
    // interface precisa mostrar esta janela, não aquela.
    expect(r.janela).toEqual({ inicio: '2026-08-18', fim: '2026-09-14' });
  });

  it('carimba o escopo, para a tela não confundir página com origem', () => {
    expect(r.escopo).toBe('url');
  });
});

describe('ausência de dados', () => {
  it('métrica que não veio é null, nunca zero', () => {
    const r = interpretar({ record: { metrics: {} } }, 'url', 'https://exemplo.com/', 'PHONE');
    expect(r.lcpP75Ms).toBeNull();
    expect(r.inpP75Ms).toBeNull();
    expect(r.clsP75).toBeNull();
    expect(r.lcpP75Ms).not.toBe(0);
  });

  it('resposta vazia não lança e não inventa janela', () => {
    const r = interpretar({}, 'origem', 'https://exemplo.com', 'DESKTOP');
    expect(r.janela).toBeNull();
    expect(r.escopo).toBe('origem');
  });

  it('período incompleto não vira data pela metade', () => {
    const r = interpretar(
      { record: { collectionPeriod: { firstDate: { year: 2026, month: 8 } } } },
      'url', 'https://exemplo.com/', 'PHONE',
    );
    expect(r.janela).toBeNull();
  });
});

describe('escopo de origem não passa por dado de página', () => {
  it('a leitura da origem é rotulada como origem', () => {
    const r = interpretar(
      { record: { key: { origin: 'https://exemplo.com' }, metrics: { largest_contentful_paint: { percentiles: { p75: 1500 } } } } },
      'origem', 'https://exemplo.com', 'PHONE',
    );
    expect(r.escopo).toBe('origem');
    expect(r.alvo).toBe('https://exemplo.com');
    // Uma landing page lenta não pode parecer boa porque a Home é rápida: quem
    // consome esta leitura sabe, pelo escopo, que o número é do site inteiro.
    expect(r.lcpP75Ms).toBe(1500);
  });
});
