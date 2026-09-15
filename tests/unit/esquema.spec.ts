import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import { verificarEsquema, comoResolverEsquema } from '@/server/esquema';
import { prepararBancoDeTeste } from '../../scripts/test-db';

/**
 * Conferência do esquema.
 *
 * Este módulo nasceu de um estrago: o código subiu para produção antes da
 * migração, todas as rotas passaram a responder 500 — inclusive a coleta, então
 * a janela de eventos daquele período se perdeu — e o `/api/diagnostico`
 * respondeu `tudoOk: true` durante o incidente inteiro, porque conferia se a
 * conexão abria e mais nada.
 *
 * Por isso o teste que importa não é "diz que está completo". É **detecta a
 * falta**: abaixo, um objeto é removido de verdade do banco de testes e a
 * conferência tem de apontá-lo pelo nome. Um teste que só exercitasse o caminho
 * feliz passaria com o defeito original de volta.
 */

let admin: Client;

beforeAll(async () => {
  await prepararBancoDeTeste();
  const url = new URL(process.env.DATABASE_URL_ADMIN!);
  url.pathname = `/${process.env.TEST_DATABASE_NAME ?? 'painel_matrix_test'}`;
  admin = new Client({ connectionString: url.toString() });
  await admin.connect();
});

afterAll(async () => {
  await admin.end();
});

describe('banco em dia', () => {
  it('não aponta nada faltando', async () => {
    const estado = await verificarEsquema();
    expect(estado.verificado).toBe(true);
    if (!estado.verificado) return;

    expect(estado.faltando, `faltando: ${JSON.stringify(estado.faltando)}`).toEqual([]);
    expect(estado.completo).toBe(true);
  });
});

describe('banco atrás do código', () => {
  it('detecta uma FUNÇÃO que não existe, e a nomeia', async () => {
    await admin.query('drop function app.zerar_limite(text)');
    try {
      const estado = await verificarEsquema();
      expect(estado.verificado).toBe(true);
      if (!estado.verificado) return;

      expect(estado.completo).toBe(false);
      expect(estado.faltando).toContainEqual({
        tipo: 'funcao',
        nome: 'app.zerar_limite(text)',
      });
    } finally {
      await admin.query(`
        create or replace function app.zerar_limite(p_chave text)
        returns void language sql security definer
        set search_path = app, public, pg_temp
        as $$ delete from rate_limits where chave = p_chave; $$;
        revoke all on function app.zerar_limite(text) from public;
        grant execute on function app.zerar_limite(text) to app_user, app_ingest, app_forms;
      `);
    }
  });

  it('detecta uma COLUNA que não existe, mesmo com a tabela presente', async () => {
    // O caso perigoso: `to_regclass` responde que a tabela está lá, e a consulta
    // quebra assim mesmo. Conferir só tabelas deixaria isto passar.
    await admin.query('alter table sites drop column form_mode');
    try {
      const estado = await verificarEsquema();
      expect(estado.verificado).toBe(true);
      if (!estado.verificado) return;

      expect(estado.completo).toBe(false);
      expect(estado.faltando).toContainEqual({ tipo: 'coluna', nome: 'sites.form_mode' });
      // A tabela continua existindo — o relatório não pode confundir as duas coisas.
      expect(estado.faltando.some((f) => f.tipo === 'tabela' && f.nome === 'sites')).toBe(false);
    } finally {
      await admin.query(
        `alter table sites add column form_mode text
           check (form_mode in ('proprio','externo','sem'))`,
      );
    }
  });

  it('detecta uma TABELA que não existe', async () => {
    await admin.query('drop table rate_limits');
    try {
      const estado = await verificarEsquema();
      expect(estado.verificado).toBe(true);
      if (!estado.verificado) return;

      expect(estado.faltando).toContainEqual({ tipo: 'tabela', nome: 'rate_limits' });
    } finally {
      await admin.query(`
        create table rate_limits (
          chave    text        not null,
          janela   timestamptz not null,
          contagem integer     not null default 0,
          primary key (chave, janela)
        );
        grant select, insert, update on rate_limits to app_user;
        grant insert, update on rate_limits to app_ingest, app_forms;
      `);
    }
  });
});

describe('a mensagem serve para agir', () => {
  it('diz quantos objetos faltam e manda aplicar a migração ANTES de publicar', () => {
    const texto = comoResolverEsquema([
      { tipo: 'tabela', nome: 'rate_limits' },
      { tipo: 'funcao', nome: 'app.zerar_limite(text)' },
    ]);
    expect(texto).toContain('2 objeto(s)');
    expect(texto).toContain('supabase/migrations/');
    // A ordem é o que evita repetir o incidente: migração primeiro, deploy
    // depois. Uma mensagem que só diga "faltam objetos" não ensina isso.
    expect(texto).toMatch(/ANTES de publicar/);
  });
});
