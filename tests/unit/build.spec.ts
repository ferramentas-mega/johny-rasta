import { describe, it, expect, afterEach } from 'vitest';
import { buildAtual, descricaoDoBuild } from '@/lib/build';

/**
 * O carimbo de build existe por causa de um incidente real: a produção ficou
 * presa num deployment antigo e não havia como saber disso pela tela. Estes
 * testes fixam o comportamento nas três situações que importam.
 */

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('identificação do build', () => {
  it('encurta o commit para sete dígitos, como o git', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = '4366d4c1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7';
    process.env.VERCEL_ENV = 'production';
    expect(buildAtual()).toEqual({ commit: '4366d4c', ambiente: 'production' });
  });

  it('fora da Vercel não inventa commit, e diz que é local', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    expect(buildAtual()).toEqual({ commit: null, ambiente: 'local' });
  });

  it('distingue preview de produção — a variável salva num não vale no outro', () => {
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
    expect(descricaoDoBuild()).toBe('preview · abcdef1');
  });

  it('sem commit, a descrição não mostra separador solto', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL;
    expect(descricaoDoBuild()).toBe('local');
  });
});
