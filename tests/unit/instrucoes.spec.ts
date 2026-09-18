import { describe, it, expect } from 'vitest';
import { PLATAFORMAS, PLATAFORMA_LABEL } from '@/lib/recursos';
import { instrucaoDaPlataforma } from '@/app/(painel)/sites/[siteId]/configurar/instrucoes';

/**
 * Toda plataforma da lista tem instrução própria e completa.
 *
 * A lista é UMA (`PLATAFORMAS`) e alimenta o seletor, o esquema da Action e a
 * restrição do banco. O que este teste protege é a ponta que nenhum deles
 * confere: acrescentar uma plataforma ao conjunto e esquecer a instrução —
 * o `switch` cairia no `default` genérico de HTML sem nenhum erro, e quem
 * escolhesse "Google Tag Manager" leria "cole antes de </head>".
 */
describe('instrucaoDaPlataforma', () => {
  const generica = instrucaoDaPlataforma('html');

  it.each(PLATAFORMAS.filter((p) => p !== 'html' && p !== 'desconhecida'))(
    '%s tem instrução própria, com onde, passos e como publicar',
    (plataforma) => {
      const i = instrucaoDaPlataforma(plataforma);
      expect(i.onde.length).toBeGreaterThan(10);
      expect(i.passos.length).toBeGreaterThanOrEqual(3);
      expect(i.publicar.length).toBeGreaterThan(10);
      // Própria, e não a genérica reaproveitada.
      expect(i.onde).not.toBe(generica.onde);
    },
  );

  it('"não sei informar" recebe a instrução genérica de HTML, que funciona em qualquer lugar', () => {
    expect(instrucaoDaPlataforma('desconhecida')).toEqual(generica);
  });

  it('toda plataforma tem rótulo', () => {
    for (const p of PLATAFORMAS) expect(PLATAFORMA_LABEL[p].length).toBeGreaterThan(0);
  });

  it('as instruções por GTM e SPA avisam sobre o que quebra ali: instalação dupla e navegação sem recarga', () => {
    expect(instrucaoDaPlataforma('gtm').observacao).toMatch(/duas vezes/);
    expect(instrucaoDaPlataforma('vite_spa').observacao).toMatch(/pushState/);
  });
});
