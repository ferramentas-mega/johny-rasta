import { describe, it, expect, afterEach } from 'vitest';
import { buildAtual, descricaoDoBuild } from '@/lib/build';

/**
 * O carimbo de build existe por causa de dois incidentes reais: a produção
 * presa num deployment antigo, e — depois — duas publicações do mesmo commit
 * com comportamentos diferentes. Estes testes fixam as duas lições.
 */

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

function semVercel() {
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_DEPLOYMENT_ID;
}

describe('identificação do build', () => {
  it('encurta o commit para sete dígitos, como o git', () => {
    semVercel();
    process.env.VERCEL_GIT_COMMIT_SHA = '4366d4c1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7';
    process.env.VERCEL_ENV = 'production';
    expect(buildAtual()).toMatchObject({ commit: '4366d4c', ambiente: 'production' });
  });

  it('fora da Vercel não inventa commit nem deployment, e diz que é local', () => {
    semVercel();
    expect(buildAtual()).toEqual({ commit: null, deployment: null, ambiente: 'local' });
  });

  it('distingue preview de produção — a variável salva num não vale no outro', () => {
    semVercel();
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890';
    expect(descricaoDoBuild()).toBe('preview · abcdef1');
  });

  it('sem commit, a descrição não mostra separador solto', () => {
    semVercel();
    expect(descricaoDoBuild()).toBe('local');
  });

  it('DOIS builds do mesmo commit são distinguíveis pelo deployment', () => {
    // Salvar uma variável de ambiente não reconstrói nada: o build anterior
    // continua no ar, com o mesmo commit e sem a variável. Sem o id do
    // deployment, os dois carimbam exatamente a mesma coisa — e foi assim que
    // "as variáveis estão salvas, mas o diagnóstico diz que faltam" ficou sem
    // explicação visível.
    semVercel();
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_GIT_COMMIT_SHA = '067144d0aaaabbbbccccdddd';

    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_antesDaVariavel';
    const antes = descricaoDoBuild();

    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_depoisDaVariavel';
    const depois = descricaoDoBuild();

    expect(antes).not.toBe(depois);
    expect(antes).toContain('067144d');
    expect(depois).toContain('067144d');
  });

  it('descarta o prefixo dpl_, que todo deployment tem', () => {
    semVercel();
    process.env.VERCEL = '1';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_9F3a21C7b04eXXXX';
    expect(buildAtual().deployment).toBe('9F3a21C7');
  });
});
