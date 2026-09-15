import { describe, it, expect } from 'vitest';
import {
  diagnosticarInstalacao,
  ehCaminhoDoPainel,
  CAMINHO_EVENTO_DE_TESTE,
  type FatosDaInstalacao,
} from '@/lib/instalacao';

/**
 * O diagnóstico da espera.
 *
 * O que estes testes protegem: que situações com causas DIFERENTES recebam
 * respostas diferentes. A versão anterior da etapa mandava a mesma lista de
 * quatro suspeitas para todo mundo — inclusive para quem tinha o rastreamento
 * funcionando e só não abriu o site pelo link do diagnóstico. Um assistente que
 * responde igual a perguntas diferentes não está ajudando, está preenchendo
 * espaço.
 *
 * E o limite, que também é testado: nada aqui verifica recurso nenhum. O
 * diagnóstico explica a espera; quem confirma instalação continua sendo evento
 * recebido com token.
 */

const base: FatosDaInstalacao = {
  diagnosticoExiste: true,
  diagnosticoVivo: true,
  comToken: 0,
  semTokenNaJanela: 0,
  doSiteNoTotal: 0,
  doPainelNoTotal: 0,
};

const com = (parcial: Partial<FatosDaInstalacao>) => diagnosticarInstalacao({ ...base, ...parcial });

describe('cada causa recebe uma resposta diferente', () => {
  it('evento com token: a instalação está de pé', () => {
    const d = com({ comToken: 3 });
    expect(d.sinal).toBe('recebido');
    expect(d.tom).toBe('ok');
    expect(d.ofereceConsole).toBe(false);
  });

  it('tag funcionando, sem token: o problema é o link, não a instalação', () => {
    // O caso mais cruel do assistente antigo: tudo certo no site, e a tela
    // mandava investigar CSP, cache e bloqueador.
    const d = com({ semTokenNaJanela: 4 });
    expect(d.sinal).toBe('sem_token');
    expect(d.titulo).toMatch(/funcionando/i);
    expect(d.proximaAcao).toMatch(/link do diagn/i);
    // Não faz sentido mandar depurar o que está funcionando.
    expect(d.ofereceConsole).toBe(false);
  });

  it('só eventos do painel: o servidor recebe, o site nunca falou', () => {
    const d = com({ doPainelNoTotal: 2 });
    expect(d.sinal).toBe('so_do_painel');
    expect(d.oQueSabemos).toContain('2');
    expect(d.ofereceConsole).toBe(true);
  });

  it('já coletou antes: cache e publicação recente sobem na lista', () => {
    const d = com({ doSiteNoTotal: 120 });
    expect(d.sinal).toBe('ja_coletou_antes');
    expect(d.causaProvavel).toMatch(/cache|publica/i);
    expect(d.ofereceConsole).toBe(true);
  });

  it('nada, nunca, de lugar nenhum', () => {
    const d = com({});
    expect(d.sinal).toBe('nunca_coletou');
    expect(d.ofereceConsole).toBe(true);
  });

  it('diagnóstico vencido não manda repetir o teste pelo link morto', () => {
    // Mandar "abra pelo link" com o link vencido é mandar a pessoa repetir
    // exatamente o que acabou de não funcionar.
    const d = com({ diagnosticoVivo: false, semTokenNaJanela: 5 });
    expect(d.sinal).toBe('diagnostico_vencido');
    expect(d.proximaAcao).toMatch(/novo/i);
  });

  it('sem sessão nenhuma, a ação é abrir uma', () => {
    const d = com({ diagnosticoExiste: false });
    expect(d.sinal).toBe('sem_diagnostico');
  });

  it('o evento com token vence até o vencimento: o que chegou, chegou', () => {
    const d = com({ diagnosticoVivo: false, comToken: 1 });
    expect(d.sinal).toBe('recebido');
  });
});

describe('todo diagnóstico é acionável', () => {
  const todosOsCasos: Partial<FatosDaInstalacao>[] = [
    { comToken: 1 },
    { semTokenNaJanela: 1 },
    { doPainelNoTotal: 1 },
    { doSiteNoTotal: 1 },
    {},
    { diagnosticoVivo: false },
    { diagnosticoExiste: false },
  ];

  it('nenhum termina sem próximo passo', () => {
    // O defeito que motivou tudo isto era justamente uma tela que terminava em
    // "não dá para afirmar a causa daqui".
    for (const caso of todosOsCasos) {
      const d = com(caso);
      expect(d.titulo.length, JSON.stringify(caso)).toBeGreaterThan(10);
      expect(d.proximaAcao.length, JSON.stringify(caso)).toBeGreaterThan(15);
      expect(d.oQueSabemos.length, JSON.stringify(caso)).toBeGreaterThan(15);
    }
  });

  it('nenhum diz que a causa é desconhecida', () => {
    for (const caso of todosOsCasos) {
      expect(com(caso).proximaAcao).not.toMatch(/não dá para|não sei|talvez/i);
    }
  });
});

describe('o que é página do painel e o que é do site', () => {
  it('reconhece as páginas que o próprio painel gera', () => {
    expect(ehCaminhoDoPainel(CAMINHO_EVENTO_DE_TESTE)).toBe(true);
    expect(ehCaminhoDoPainel('/teste/sit_038a2d476f83')).toBe(true);
  });

  it('não confunde uma página real do cliente com página do painel', () => {
    // Se confundisse, um site que coleta de verdade seria diagnosticado como
    // "nunca falou com o servidor".
    expect(ehCaminhoDoPainel('/')).toBe(false);
    expect(ehCaminhoDoPainel('/contato')).toBe(false);
    expect(ehCaminhoDoPainel('/testemunhos')).toBe(false);
    expect(ehCaminhoDoPainel(null)).toBe(false);
  });
});
