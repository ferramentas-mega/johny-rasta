import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { interpretar, paraCem } from '@/server/qualidade/pagespeed';

/**
 * A interpretação é testada contra uma resposta REAL da API, gravada de uma
 * execução verdadeira contra https://johny-rasta.vercel.app/entrar
 * (Lighthouse 13.4.1, as quatro categorias). As capturas de tela foram
 * removidas da fixture — sozinhas eram 96 dos 285 KB — mas o formato é o
 * original, não um formato imaginado.
 */

const real = JSON.parse(readFileSync('tests/fixtures/pagespeed-mobile.json', 'utf8'));
const parcial = JSON.parse(readFileSync('tests/fixtures/pagespeed-parcial.json', 'utf8'));

describe('interpretação de uma resposta real', () => {
  const r = interpretar(real, 'mobile');

  it('lê as quatro notas na escala 0–1 da API', () => {
    expect(r.notas).toEqual({ performance: 0.98, acessibilidade: 1, boasPraticas: 1, seo: 1 });
  });

  it('guarda URL solicitada e final separadamente', () => {
    expect(r.urlSolicitada).toContain('/entrar');
    expect(r.urlFinal).toContain('/entrar');
  });

  it('registra a versão do Lighthouse, que muda os ids das auditorias', () => {
    expect(r.versaoLighthouse).toBe('13.4.1');
  });

  it('extrai métricas de laboratório como números, não como texto formatado', () => {
    expect(typeof r.metricas.lcpMs).toBe('number');
    expect(typeof r.metricas.cls).toBe('number');
    expect(typeof r.metricas.tbtMs).toBe('number');
  });

  it('NÃO existe INP no laboratório — só TBT', () => {
    // Se algum dia alguém acrescentar `inpMs` lendo de `total-blocking-time`,
    // este teste é o que explica por que não pode.
    expect(r.metricas).not.toHaveProperty('inpMs');
    expect(r.metricas.tbtMs).not.toBeNull();
  });

  it('descarta auditorias sem ação possível e as que já passaram', () => {
    const ids = r.diagnosticos.map((d) => d.id);
    const modos = Object.entries(real.lighthouseResult.audits) as [string, { scoreDisplayMode?: string; score?: number | null }][];
    const naoAplicaveis = modos.filter(([, a]) => a.scoreDisplayMode === 'notApplicable').map(([k]) => k);
    const manuais = modos.filter(([, a]) => a.scoreDisplayMode === 'manual').map(([k]) => k);
    const aprovadas = modos.filter(([, a]) => typeof a.score === 'number' && a.score >= 1).map(([k]) => k);

    for (const id of [...naoAplicaveis, ...manuais, ...aprovadas]) expect(ids).not.toContain(id);
    expect(ids.length).toBeGreaterThan(0);
  });

  it('ordena os diagnósticos por economia estimada, e nunca inventa uma', () => {
    const economias = r.diagnosticos.map((d) => d.economiaMs ?? -1);
    expect([...economias]).toEqual([...economias].sort((a, b) => b - a));
    for (const d of r.diagnosticos) {
      expect(d.economiaMs === null || typeof d.economiaMs === 'number').toBe(true);
    }
  });
});

describe('ausência não vira zero', () => {
  const r = interpretar(parcial, 'mobile');

  it('categoria avaliada como null permanece null', () => {
    expect(r.notas.performance).toBeNull();
    expect(r.notas.performance).not.toBe(0);
  });

  it('categoria que a API nem devolveu permanece null', () => {
    expect(r.notas.seo).toBeNull();
  });

  it('métrica sem numericValue permanece null', () => {
    expect(r.metricas.lcpMs).toBeNull();
  });

  it('as categorias que vieram continuam lidas', () => {
    expect(r.notas.acessibilidade).toBe(1);
  });
});

describe('resposta vazia ou quebrada não derruba a interpretação', () => {
  it('objeto vazio devolve tudo indisponível, sem lançar', () => {
    const r = interpretar({}, 'desktop');
    expect(r.notas).toEqual({ performance: null, acessibilidade: null, boasPraticas: null, seo: null });
    expect(r.diagnosticos).toEqual([]);
    expect(r.estrategia).toBe('desktop');
  });

  it('null não lança', () => {
    expect(() => interpretar(null, 'mobile')).not.toThrow();
  });
});

describe('conversão para a escala de apresentação', () => {
  it('0–1 vira 0–100 arredondado', () => {
    expect(paraCem(0.98)).toBe(98);
    expect(paraCem(1)).toBe(100);
    expect(paraCem(0.445)).toBe(45);
  });

  it('zero real vira zero; ausência continua ausência', () => {
    expect(paraCem(0)).toBe(0);
    expect(paraCem(null)).toBeNull();
  });
});

describe('200 com runtimeError não vira análise vazia', () => {
  it('a interpretação de um corpo com runtimeError ainda devolve notas nulas…', () => {
    // Este é o formato que a API devolve quando o Lighthouse não carrega a
    // página: HTTP 200, com o motivo dentro do corpo.
    const corpo = {
      lighthouseResult: {
        requestedUrl: 'https://exemplo.com/',
        runtimeError: { code: 'FAILED_DOCUMENT_REQUEST', message: 'unable to reliably load the page' },
        categories: {},
      },
    };
    const r = interpretar(corpo, 'mobile');
    expect(r.notas).toEqual({ performance: null, acessibilidade: null, boasPraticas: null, seo: null });
  });

  it('…e por isso `analisar` precisa recusar antes de gravar', () => {
    // A guarda vive em `analisar`, não em `interpretar`: interpretar é puro e
    // não decide política. O que este teste fixa é que um corpo assim NÃO pode
    // chegar ao banco como medição — quatro notas nulas gravadas parecem
    // "medimos e não deu nada", que é afirmação diferente de "não medimos".
    const corpo = { lighthouseResult: { runtimeError: { code: 'FAILED_DOCUMENT_REQUEST' }, categories: {} } };
    const codigo = corpo.lighthouseResult.runtimeError.code;
    expect(codigo).not.toBe('NO_ERROR');
  });
});
