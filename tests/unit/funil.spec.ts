import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from 'pg';
import { withAccount } from '@/server/db';
import { getFunilDeLeads, resolvePeriod } from '@/server/metrics/queries';
import {
  prepararBancoDeTeste,
  MASSA,
  CONTAS,
  ESPERADO_FUNIL_ALFA_7D,
  ESPERADO_FUNIL_BETA_7D,
} from '../../scripts/test-db';

/**
 * Funil de qualidade dos leads.
 *
 * A propriedade que estes testes protegem não é um número: é o encaixe das
 * etapas. Um funil cuja segunda etapa pode ser menor que a terceira desenha uma
 * perda que não existe, e quem olha conclui que o formulário está afastando
 * gente. Por isso há um caso na massa (Beta, sessão b3) que envia sem clicar em
 * nada — sem ele, a definição errada passaria despercebida.
 */

let accountId: string;

async function siteDe(publicId: string) {
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const s = await admin.query<{ id: string; timezone: string }>(
    'select id, timezone from sites where public_id = $1',
    [publicId],
  );
  await admin.end();
  return s.rows[0]!;
}

async function funilDe(publicId: string) {
  const site = await siteDe(publicId);
  return withAccount(accountId, async (db) => {
    const p = await resolvePeriod(db, site.timezone, { key: '7d' });
    return getFunilDeLeads(db, site, { ...p, label: '' });
  });
}

beforeAll(async () => {
  await prepararBancoDeTeste();
  const admin = new Client({ connectionString: process.env.DATABASE_URL_ADMIN });
  await admin.connect();
  const conta = await admin.query<{ id: string }>('select id from accounts where name = $1', [
    CONTAS.agencia.nome,
  ]);
  await admin.end();
  accountId = conta.rows[0]!.id;
});

describe('funil do site Alfa em 7 dias', () => {
  it('produz exatamente as etapas derivadas da massa', async () => {
    const funil = await funilDe(MASSA.siteAlfa);
    const porChave = Object.fromEntries(funil.etapas.map((e) => [e.chave, e.sessoes]));

    expect(porChave.sessoes).toBe(ESPERADO_FUNIL_ALFA_7D.sessoes);
    expect(porChave.interagiram).toBe(ESPERADO_FUNIL_ALFA_7D.interagiram);
    expect(porChave.enviaram).toBe(ESPERADO_FUNIL_ALFA_7D.enviaram);
    expect(porChave.contatoNovo).toBe(ESPERADO_FUNIL_ALFA_7D.contatoNovo);

    expect(funil.leadsDistintos).toBe(ESPERADO_FUNIL_ALFA_7D.leadsDistintos);
    expect(funil.enviosSemSessao).toBe(ESPERADO_FUNIL_ALFA_7D.enviosSemSessao);
    expect(funil.enviosDeContatoConhecido).toBe(ESPERADO_FUNIL_ALFA_7D.enviosDeContatoConhecido);
    expect(funil.leadsComOsDoisContatos).toBe(ESPERADO_FUNIL_ALFA_7D.leadsComOsDoisContatos);
  });

  it('cada etapa está contida na anterior', async () => {
    const funil = await funilDe(MASSA.siteAlfa);
    for (let i = 1; i < funil.etapas.length; i += 1) {
      const anterior = funil.etapas[i - 1]!;
      const atual = funil.etapas[i]!;
      expect(
        atual.sessoes,
        `"${atual.rotulo}" (${atual.sessoes}) passou de "${anterior.rotulo}" (${anterior.sessoes})`,
      ).toBeLessThanOrEqual(anterior.sessoes);
    }
  });

  it('cada etapa declara o que conta, em texto', async () => {
    const funil = await funilDe(MASSA.siteAlfa);
    // Uma barra sem definição faz quem olha inventar a dela. As definições vão
    // para a tela, então não podem ser rótulos repetidos nem cadeias vazias.
    for (const etapa of funil.etapas) {
      expect(etapa.definicao.length).toBeGreaterThan(30);
      expect(etapa.definicao).not.toBe(etapa.rotulo);
    }
  });
});

describe('funil do site Beta: quem envia sem clicar', () => {
  it('a etapa de interesse contém quem enviou sem clicar em nada', async () => {
    const funil = await funilDe(MASSA.siteBeta);
    const porChave = Object.fromEntries(funil.etapas.map((e) => [e.chave, e.sessoes]));

    expect(porChave.sessoes).toBe(ESPERADO_FUNIL_BETA_7D.sessoes);
    expect(porChave.enviaram).toBe(ESPERADO_FUNIL_BETA_7D.enviaram);

    // O ponto do teste. Com "interagiram" definida só por clique em CTA, b3
    // ficaria de fora e este número seria 1 — menor que os 2 que enviaram.
    expect(porChave.interagiram).toBe(ESPERADO_FUNIL_BETA_7D.interagiram);
    expect(porChave.interagiram).toBeGreaterThanOrEqual(porChave.enviaram!);
  });

  it('conta o contato com e-mail e telefone separado dos demais', async () => {
    const funil = await funilDe(MASSA.siteBeta);
    expect(funil.leadsDistintos).toBe(ESPERADO_FUNIL_BETA_7D.leadsDistintos);
    expect(funil.leadsComOsDoisContatos).toBe(ESPERADO_FUNIL_BETA_7D.leadsComOsDoisContatos);
    // Se este indicador contasse "tem e-mail OU telefone" ele seria igual ao
    // total, e não diria nada sobre a qualidade do dado.
    expect(funil.leadsComOsDoisContatos).toBeLessThan(funil.leadsDistintos);
  });
});

describe('funil de um site sem coleta', () => {
  it('devolve zeros sem inventar proporção, e não quebra', async () => {
    const funil = await funilDe(MASSA.siteSemColeta);

    for (const etapa of funil.etapas) expect(etapa.sessoes).toBe(0);
    expect(funil.leadsDistintos).toBe(0);
    // Zero aqui é uma afirmação legítima: o site existe, foi consultado e não
    // houve sessão. Quem decide entre "zero" e "sem base de cálculo" é a tela,
    // que não desenha funil sem a primeira etapa.
    expect(funil.enviosSemSessao).toBe(0);
  });
});
