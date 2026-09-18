import { describe, it, expect } from 'vitest';
import { saudeDoSite, agregarSaude, contarSaude, casaBusca } from '@/lib/saude';
import type { Otimizacao } from '@/lib/otimizacoes';
import type { ResumoDeConfiguracao } from '@/lib/recursos';

const sinal = (p: Partial<Otimizacao> = {}): Otimizacao => ({
  id: null, siteId: 'a', site: 'a', cliente: 'c', url: 'https://a.teste/', dispositivo: 'mobile',
  tipo: 'tecnico', titulo: 'Desempenho baixo', evidencia: '', prioridade: 1, status: 'pendente',
  proximaAcao: '', detectadoEm: new Date(), ...p,
});
const resumo = (p: Partial<ResumoDeConfiguracao> = {}): ResumoDeConfiguracao => ({
  siteId: 'a', pendentes: 0, verificados: 1, naoIniciado: false, faltando: [], comErro: [], ...p,
});
const base = { totalEventos: 100, estado: 'coletando', resumo: resumo(), sinais: [] as Otimizacao[] };

describe('saudeDoSite', () => {
  it('sinal de prioridade alta é crítico, com o título como motivo', () => {
    expect(saudeDoSite({ ...base, sinais: [sinal()] })).toEqual({ saude: 'critico', motivo: 'Desempenho baixo' });
  });
  it('erro de configuração é crítico', () => {
    expect(saudeDoSite({ ...base, resumo: resumo({ comErro: ['qualidade'] }) }).saude).toBe('critico');
  });
  it('sinal médio, coleta parada ou verificação pendente é atenção', () => {
    expect(saudeDoSite({ ...base, sinais: [sinal({ prioridade: 2, titulo: 'Análise desatualizada' })] })).toEqual({ saude: 'atencao', motivo: 'Análise desatualizada' });
    expect(saudeDoSite({ ...base, estado: 'sem_eventos_recentes' }).saude).toBe('atencao');
    expect(saudeDoSite({ ...base, resumo: resumo({ pendentes: 1 }) }).saude).toBe('atencao');
  });
  it('sinal resolvido manualmente não pesa — mas prova que houve análise', () => {
    const r = saudeDoSite({ ...base, totalEventos: 0, sinais: [sinal({ status: 'resolvida_manual' })] });
    expect(r.saude).toBe('saudavel');
  });
  it('sem evento e sem análise é SEM MEDIÇÃO, nunca saudável', () => {
    expect(saudeDoSite({ ...base, totalEventos: 0, estado: 'aguardando_instalacao' }).saude).toBe('sem_medicao');
    // E a pendência de configuração não vira atenção antes de existir medição:
    // seriam dois avisos para o mesmo momento.
    expect(saudeDoSite({ ...base, totalEventos: 0, estado: 'aguardando_instalacao', resumo: resumo({ pendentes: 2 }) }).saude).toBe('sem_medicao');
  });
  it('crítico vence atenção, que vence o resto', () => {
    expect(saudeDoSite({ ...base, estado: 'sem_eventos_recentes', sinais: [sinal()] }).saude).toBe('critico');
  });
});

describe('agregarSaude', () => {
  it('a pior página manda', () => {
    expect(agregarSaude(['saudavel', 'atencao', 'saudavel'])).toBe('atencao');
    expect(agregarSaude(['atencao', 'critico'])).toBe('critico');
  });
  it('só sem medição continua sem medição; um medido e saudável faz o conjunto saudável', () => {
    expect(agregarSaude(['sem_medicao', 'sem_medicao'])).toBe('sem_medicao');
    expect(agregarSaude(['sem_medicao', 'saudavel'])).toBe('saudavel');
    expect(agregarSaude([])).toBe('sem_medicao');
  });
  it('conta por estado', () => {
    expect(contarSaude(['critico', 'atencao', 'atencao'])).toEqual({ critico: 1, atencao: 2, saudavel: 0, sem_medicao: 0 });
  });
});

describe('casaBusca', () => {
  it('ignora acento e caixa, e termo vazio casa tudo', () => {
    expect(casaBusca('agencia', 'Agência Teste')).toBe(true);
    expect(casaBusca('/CONTATO', 'site', 'a.teste/contato')).toBe(true);
    expect(casaBusca('', 'x')).toBe(true);
    expect(casaBusca('zzz', 'x', 'y')).toBe(false);
  });
});
