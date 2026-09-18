import { describe, it, expect } from 'vitest';
import { derivarAvisos, contarPorGravidade } from '@/lib/avisos';
import type { Otimizacao } from '@/lib/otimizacoes';
import type { ResumoDeConfiguracao } from '@/lib/recursos';

/**
 * Derivação dos avisos, sem banco.
 *
 * O que se protege: aviso é FATO derivado, com porta para agir; sinal
 * resolvido não vira aviso; site sem evento não recebe dois avisos pelo mesmo
 * momento; e a ordem é gravidade primeiro.
 */
const site = (id: string, totalEventos: number, clienteNome = 'Cliente') => ({
  id, name: `site-${id}`, clienteNome, totalEventos,
});

const resumo = (siteId: string, p: Partial<ResumoDeConfiguracao> = {}): ResumoDeConfiguracao => ({
  siteId, pendentes: 0, verificados: 1, naoIniciado: false, faltando: [], comErro: [], ...p,
});

const sinal = (siteId: string, p: Partial<Otimizacao> = {}): Otimizacao => ({
  id: null, siteId, site: `site-${siteId}`, cliente: 'Cliente', url: 'https://x.teste/', dispositivo: 'mobile',
  tipo: 'tecnico', titulo: 'Desempenho ruim', evidencia: 'nota 34', prioridade: 1, status: 'pendente',
  proximaAcao: 'corrigir', detectadoEm: new Date('2026-09-01T12:00:00Z'), ...p,
});

describe('derivarAvisos', () => {
  it('sinal aberto vira aviso com a gravidade da prioridade, e aponta para a qualidade do site', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 100)],
      resumos: new Map([['a', resumo('a')]]),
      sinais: [sinal('a'), sinal('a', { prioridade: 2, titulo: 'Análise vencida', dispositivo: 'desktop' })],
    });
    expect(avisos.map((a) => [a.gravidade, a.titulo, a.href])).toEqual([
      ['alta', 'Desempenho ruim', '/sites/a/qualidade'],
      ['media', 'Análise vencida', '/sites/a/qualidade'],
    ]);
  });

  it('sinal resolvido manualmente NÃO é aviso; em andamento e aguardando nova análise continuam sendo', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 100)],
      resumos: new Map(),
      sinais: [
        sinal('a', { status: 'resolvida_manual', titulo: 'r' }),
        sinal('a', { status: 'em_andamento', titulo: 'e' }),
        sinal('a', { status: 'aguardando_nova_analise', titulo: 'n', dispositivo: 'desktop' }),
      ],
    });
    expect(avisos.map((a) => a.titulo).sort()).toEqual(['e', 'n']);
  });

  it('site sem evento recebe UM aviso de instalação — não também o de configuração pendente', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 0)],
      resumos: new Map([['a', resumo('a', { pendentes: 2, faltando: ['visitas', 'whatsapp'] })]]),
      sinais: [],
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.origem).toBe('instalacao');
    expect(avisos[0]!.href).toBe('/sites/a/configurar');
  });

  it('site que já coleta com recurso sem verificação recebe aviso baixo, e com erro registrado, aviso alto', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 50), site('b', 50)],
      resumos: new Map([
        ['a', resumo('a', { pendentes: 1, faltando: ['formularios'] })],
        ['b', resumo('b', { pendentes: 1, faltando: ['qualidade'], comErro: ['qualidade'] })],
      ]),
      sinais: [],
    });
    expect(avisos.map((a) => [a.siteId, a.gravidade])).toEqual([['b', 'alta'], ['a', 'baixa']]);
    expect(avisos[0]!.detalhe).toContain('Qualidade técnica');
  });

  it('sinal de site fora da lista (arquivado) não vira aviso sem porta', () => {
    const avisos = derivarAvisos({ sites: [], resumos: new Map(), sinais: [sinal('sumiu')] });
    expect(avisos).toEqual([]);
  });

  it('ordena por gravidade e, dentro dela, o mais recente primeiro; sem data vai por último', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 0), site('b', 10)],
      resumos: new Map(),
      sinais: [
        sinal('b', { prioridade: 2, titulo: 'velho', detectadoEm: new Date('2026-01-01') }),
        sinal('b', { prioridade: 2, titulo: 'novo', detectadoEm: new Date('2026-09-01'), dispositivo: 'desktop' }),
        sinal('b', { prioridade: 1, titulo: 'grave', url: null, dispositivo: null }),
      ],
    });
    expect(avisos.map((a) => a.titulo)).toEqual(['grave', 'novo', 'velho', 'Nenhum evento recebido até agora']);
    expect(contarPorGravidade(avisos)).toEqual({ alta: 1, media: 2, baixa: 1 });
  });

  it('a chave distingue o dispositivo: celular e computador da mesma página são dois avisos', () => {
    const avisos = derivarAvisos({
      sites: [site('a', 10)],
      resumos: new Map(),
      sinais: [sinal('a'), sinal('a', { dispositivo: 'desktop' })],
    });
    expect(new Set(avisos.map((a) => a.chave)).size).toBe(2);
  });
});
