import { describe, it, expect } from 'vitest';
import { dataHora, FUSO_PADRAO } from '@/lib/formato';

/**
 * Formatação de data e hora.
 *
 * O defeito que estes testes travam: `toLocaleString` sem `timeZone` formata no
 * fuso de QUEM EXECUTA, e quem executa é o servidor. Na Vercel isso é UTC —
 * então um clique dado às 20h34 em São Paulo aparecia no painel como 23h34.
 * Três horas no futuro, num produto cujo assunto é justamente quando as coisas
 * aconteceram: quem testava a instalação não reconhecia o próprio clique e
 * concluía que os eventos eram de outra pessoa.
 *
 * O projeto já tinha a regra do lado das consultas ("hora local do site, não do
 * servidor", em `porHora`). Ela nunca tinha chegado à formatação, e não havia
 * teste nenhum sobre este módulo.
 */

/** 15/09/2026, 23:34 em UTC — a hora que o painel mostrava. */
const INSTANTE = new Date('2026-09-15T23:34:00.000Z');

describe('a hora é a do site, não a do servidor', () => {
  it('UTC vira horário de São Paulo', () => {
    // O caso real: o evento das 23h34 UTC é o clique das 20h34 em São Paulo.
    expect(dataHora(INSTANTE, 'America/Sao_Paulo')).toBe('15/09/2026, 20:34');
  });

  it('o padrão já é São Paulo — nenhuma tela mostra UTC por omissão', () => {
    // Importa porque as telas que misturam sites (leads, otimizações, cartão)
    // chamam sem fuso. Se o padrão fosse o do servidor, o defeito continuaria
    // exatamente onde estava.
    expect(dataHora(INSTANTE)).toBe(dataHora(INSTANTE, FUSO_PADRAO));
    expect(FUSO_PADRAO).toBe('America/Sao_Paulo');
  });

  it('fusos diferentes dão horas diferentes para o MESMO instante', () => {
    // Dois sites da mesma conta podem estar em fusos diferentes, e a data de
    // cada um precisa ser lida no fuso dele.
    const sp = dataHora(INSTANTE, 'America/Sao_Paulo');
    const manaus = dataHora(INSTANTE, 'America/Manaus');
    expect(sp).not.toBe(manaus);
    expect(manaus).toBe('15/09/2026, 19:34');
  });

  it('a virada do dia acompanha o fuso, não o relógio do servidor', () => {
    // 02:00 UTC do dia 16 ainda é dia 15 em São Paulo. Errar isto joga um
    // evento para o dia seguinte no relatório.
    const madrugada = new Date('2026-09-16T02:00:00.000Z');
    expect(dataHora(madrugada, 'America/Sao_Paulo')).toBe('15/09/2026, 23:00');
  });

  it('aceita ISO em texto, como vem do banco', () => {
    expect(dataHora('2026-09-15T23:34:00.000Z', 'America/Sao_Paulo')).toBe('15/09/2026, 20:34');
  });

  it('não devolve a hora do servidor quando o fuso é passado', () => {
    // Prova direta contra a regressão: seja qual for o fuso do processo, o
    // resultado é o mesmo. Antes, este teste falharia em qualquer máquina que
    // não estivesse em São Paulo.
    const semFuso = INSTANTE.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const comFuso = dataHora(INSTANTE, 'America/Sao_Paulo');
    // Num servidor em UTC (CI e Vercel) os dois diferem — que é o defeito.
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'UTC') {
      expect(comFuso).not.toBe(semFuso);
    }
    expect(comFuso).toBe('15/09/2026, 20:34');
  });
});
