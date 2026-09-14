import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tlsPara, classificarFalha, verificarConexao } from '@/server/db';
import { appUrl, appHost } from '@/lib/app-url';

/**
 * Decisões de conexão e de URL pública.
 *
 * Nenhuma delas aparece nos testes de fluxo, porque todos rodam contra um
 * Postgres local — que é justamente o caso em que essas decisões não têm
 * efeito. Foi assim que o defeito de TLS chegou à produção sem ser notado.
 */

describe('TLS por destino', () => {
  const caOriginal = process.env.DATABASE_SSL_CA;
  afterEach(() => {
    if (caOriginal === undefined) delete process.env.DATABASE_SSL_CA;
    else process.env.DATABASE_SSL_CA = caOriginal;
  });

  it('dispensa TLS apenas em hosts locais', () => {
    delete process.env.DATABASE_SSL_CA;
    expect(tlsPara('postgres://u:p@localhost:5432/db')).toBe(false);
    expect(tlsPara('postgres://u:p@127.0.0.1:5432/db')).toBe(false);
    expect(tlsPara('postgres://u:p@host.docker.internal:5432/db')).toBe(false);
  });

  it('exige TLS em qualquer host remoto', () => {
    delete process.env.DATABASE_SSL_CA;
    const r = tlsPara('postgres://u:p@aws-1-us-east-1.pooler.supabase.com:6543/postgres');
    expect(r).not.toBe(false);
    expect(r).toMatchObject({ rejectUnauthorized: false });
  });

  it('verifica o certificado quando há CA definida', () => {
    process.env.DATABASE_SSL_CA = '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----';
    const r = tlsPara('postgres://u:p@banco.exemplo.com:5432/postgres');
    expect(r).toMatchObject({ rejectUnauthorized: true });
  });

  it('falha FECHADO quando não consegue interpretar a string', () => {
    // O `pg` também aceita "host=... user=...", que não é URL. Desligar o TLS
    // por não conseguir ler o destino mandaria a conexão em texto claro.
    delete process.env.DATABASE_SSL_CA;
    expect(tlsPara('host=meubanco.com user=app dbname=postgres')).not.toBe(false);
  });
});

describe('classificação de falhas de conexão', () => {
  const casos: [string, string][] = [
    ['Tenant or user not found', 'usuario_sem_sufixo_do_projeto'],
    ['password authentication failed for user "app_user"', 'senha_incorreta'],
    ['getaddrinfo ENOTFOUND banco.invalido', 'host_nao_resolve'],
    ['connect ECONNREFUSED 127.0.0.1:5499', 'sem_resposta'],
    ['no pg_hba.conf entry for host, SSL off', 'tls_recusado'],
    ['database "errado" does not exist', 'banco_inexistente'],
    ['FATAL: (EAUTHQUERY) unsupported or invalid secret format', 'papel_expirado'],
    ['algo totalmente inesperado', 'desconhecida'],
  ];

  for (const [mensagem, esperado] of casos) {
    it(`reconhece "${mensagem.slice(0, 40)}" como ${esperado}`, () => {
      expect(classificarFalha(new Error(mensagem))).toBe(esperado);
    });
  }
});

describe('verificação de conexão', () => {
  it('reporta variável ausente sem tentar conectar', async () => {
    const r = await verificarConexao('VARIAVEL_QUE_NAO_EXISTE');
    expect(r).toMatchObject({ causa: 'variavel_ausente', conecta: false });
  });

  it('conecta no banco de testes e só devolve detalhe quando pedido', async () => {
    const semDetalhe = await verificarConexao('DATABASE_URL');
    expect(semDetalhe).toMatchObject({ causa: 'ok', conecta: true });
    expect(semDetalhe.detalhe).toBeUndefined();

    const comDetalhe = await verificarConexao('DATABASE_URL', true);
    expect(comDetalhe.detalhe?.papel).toBe('app_user');
    expect(comDetalhe.detalhe?.tabelasVisiveis).toBeGreaterThan(0);
  });
});

describe('URL pública da aplicação', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });
  afterEach(() => {
    process.env.APP_URL = original.APP_URL;
    process.env.VERCEL_URL = original.VERCEL_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = original.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it('usa APP_URL quando é absoluta, sem barra final', () => {
    process.env.APP_URL = 'https://painel.megaads.com.br/';
    expect(appUrl()).toBe('https://painel.megaads.com.br');
    expect(appHost()).toBe('painel.megaads.com.br');
  });

  it('IGNORA APP_URL sem esquema e cai para o domínio da hospedagem', () => {
    // Sem esquema, o snippet viraria caminho relativo no site do cliente.
    process.env.APP_URL = 'painel.megaads.com.br';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'johny-rasta.vercel.app';
    expect(appUrl()).toBe('https://johny-rasta.vercel.app');
  });

  it('prefere o domínio estável de produção ao do deploy', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'johny-rasta.vercel.app';
    process.env.VERCEL_URL = 'johny-rasta-abc123.vercel.app';
    expect(appUrl()).toBe('https://johny-rasta.vercel.app');
  });

  it('cai para localhost fora de hospedagem', () => {
    expect(appUrl()).toBe('http://localhost:3000');
  });
});
