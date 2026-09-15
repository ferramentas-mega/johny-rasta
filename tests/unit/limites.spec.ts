import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withoutAccount } from '@/server/db';
import { LIMITES, consumirLimite, zerarLimite, corpoGrandeDemais } from '@/server/limites';
import { prepararBancoDeTeste } from '../../scripts/test-db';

/**
 * Limites de requisição.
 *
 * O que estes testes protegem, além de "o contador conta": que o limite
 * distingue TENTATIVA de ACERTO. Um limitador de login que bloqueia quem sabe a
 * senha não está contendo força bruta, está punindo o usuário — e foi assim que
 * o defeito apareceu, com a suíte de navegador travando a partir do décimo login
 * de uma execução.
 */

/** Chave única por teste, para um não herdar o contador do outro. */
let semente = 0;
const chave = (nome: string) => `teste:${nome}:${(semente += 1)}`;

beforeAll(async () => {
  await prepararBancoDeTeste();
});

describe('contagem', () => {
  it('conta cada chamada e bloqueia depois do máximo', async () => {
    const k = chave('conta');
    const limite = { maximo: 3, janelaSegundos: 60 };

    const resultados = [];
    for (let i = 0; i < 5; i += 1) {
      resultados.push(await withoutAccount((db) => consumirLimite(db, k, limite)));
    }

    expect(resultados.map((r) => r.contagem)).toEqual([1, 2, 3, 4, 5]);
    expect(resultados.map((r) => r.permitido)).toEqual([true, true, true, false, false]);
  });

  it('chaves diferentes têm contadores independentes', async () => {
    const a = chave('independente-a');
    const b = chave('independente-b');
    const limite = { maximo: 2, janelaSegundos: 60 };

    await withoutAccount((db) => consumirLimite(db, a, limite));
    await withoutAccount((db) => consumirLimite(db, a, limite));
    const terceiraDeA = await withoutAccount((db) => consumirLimite(db, a, limite));
    const primeiraDeB = await withoutAccount((db) => consumirLimite(db, b, limite));

    expect(terceiraDeA.permitido).toBe(false);
    // Se o contador fosse global, bloquear uma chave bloquearia todas — e um
    // site movimentado derrubaria a coleta de todos os outros.
    expect(primeiraDeB.permitido).toBe(true);
    expect(primeiraDeB.contagem).toBe(1);
  });

  it('diz quantos segundos faltam para a janela virar', async () => {
    const r = await withoutAccount((db) =>
      consumirLimite(db, chave('espera'), { maximo: 1, janelaSegundos: 300 }),
    );
    expect(r.esperarSegundos).toBeGreaterThan(0);
    expect(r.esperarSegundos).toBeLessThanOrEqual(300);
  });
});

describe('acerto zera o contador', () => {
  it('quem passa do limite volta a entrar depois de um sucesso', async () => {
    const k = chave('zera');
    const limite = { maximo: 2, janelaSegundos: 300 };

    await withoutAccount((db) => consumirLimite(db, k, limite));
    await withoutAccount((db) => consumirLimite(db, k, limite));
    const bloqueada = await withoutAccount((db) => consumirLimite(db, k, limite));
    expect(bloqueada.permitido).toBe(false);

    // É o que o login faz ao confirmar a senha.
    await withoutAccount((db) => zerarLimite(db, k));

    const depois = await withoutAccount((db) => consumirLimite(db, k, limite));
    expect(depois.contagem).toBe(1);
    expect(depois.permitido).toBe(true);
  });

  it('zerar uma chave não zera as outras', async () => {
    const a = chave('zera-a');
    const b = chave('zera-b');
    const limite = { maximo: 5, janelaSegundos: 300 };

    await withoutAccount((db) => consumirLimite(db, a, limite));
    await withoutAccount((db) => consumirLimite(db, b, limite));
    await withoutAccount((db) => zerarLimite(db, a));

    const proximaDeA = await withoutAccount((db) => consumirLimite(db, a, limite));
    const proximaDeB = await withoutAccount((db) => consumirLimite(db, b, limite));

    expect(proximaDeA.contagem).toBe(1);
    // Um `delete from rate_limits` sem `where` passaria no teste anterior e
    // falharia aqui — que é o ponto.
    expect(proximaDeB.contagem).toBe(2);
  });

  it('zerar uma chave que não existe não é erro', async () => {
    await expect(
      withoutAccount((db) => zerarLimite(db, chave('inexistente'))),
    ).resolves.toBeUndefined();
  });
});

describe('os limites configurados', () => {
  it('nenhum deles atrapalha uso legítimo', () => {
    // Números escritos à mão, para que mudá-los seja uma decisão e não um
    // deslize. Um humano que errou a senha tenta três ou quatro vezes.
    expect(LIMITES.login).toEqual({ maximo: 10, janelaSegundos: 300 });
    // Dez eventos por segundo, sustentado.
    expect(LIMITES.coleta).toEqual({ maximo: 600, janelaSegundos: 60 });
    // Envio de formulário é gesto humano.
    expect(LIMITES.formularios).toEqual({ maximo: 30, janelaSegundos: 600 });
  });
});

describe('corpo grande demais', () => {
  const requisicao = (tamanho: string | null) =>
    new Request('https://exemplo.teste/', {
      method: 'POST',
      headers: tamanho === null ? {} : { 'content-length': tamanho },
      body: '{}',
    });

  it('recusa o que se declara maior que o teto', () => {
    expect(corpoGrandeDemais(requisicao('20000'), 16 * 1024)).toBe(true);
  });

  it('aceita o que cabe', () => {
    expect(corpoGrandeDemais(requisicao('500'), 16 * 1024)).toBe(false);
  });

  it('aceita quando o tamanho não é declarado', () => {
    // O `Content-Length` pode mentir ou faltar, e por isso esta não é a única
    // defesa — é a barata, cobrada antes de carregar o corpo na memória.
    expect(corpoGrandeDemais(requisicao(null), 16 * 1024)).toBe(false);
  });
});

describe('isolamento: o contador não expõe dado de ninguém', () => {
  it('os papéis públicos não conseguem LER a tabela de contadores', async () => {
    // O GRANT dá insert e update, nunca select: sem isso, o endpoint de coleta
    // de um site poderia contar as requisições de outro.
    for (const variavel of ['DATABASE_URL_INGEST', 'DATABASE_URL_FORMS']) {
      const url = new URL(process.env[variavel]!);
      url.pathname = `/${process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test'}`;
      const cliente = new Client({ connectionString: url.toString() });
      await cliente.connect();
      await expect(cliente.query('select * from rate_limits')).rejects.toThrow(/permission denied/i);
      await cliente.end();
    }
  });
});
