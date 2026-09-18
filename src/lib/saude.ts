import type { Otimizacao } from '@/lib/otimizacoes';
import type { ResumoDeConfiguracao } from '@/lib/recursos';

/**
 * Saúde de um site, e do cliente — a parte PURA.
 *
 * Um estado só, que responde "está tudo bem?" antes de qualquer leitura. Ele é
 * DERIVADO dos três estados que já existiam, na hora, e nunca gravado:
 *
 *  - os sinais de Otimizações (`SINAIS_SQL`), com a prioridade deles;
 *  - o resumo de configuração (`resumoDeConfiguracao`): erro registrado,
 *    recurso escolhido sem verificação;
 *  - o rastreamento (`derivarEstado` em `sites.ts`): evento recente ou não.
 *
 * Há um quarto valor, e ele é o mais importante: **`sem_medicao`**. Um site
 * que nunca recebeu evento nem análise não está "saudável" — não sabemos nada
 * dele. Chamar de saudável o que não foi medido é a mesma mentira de zero no
 * lugar de "indisponível".
 *
 * A regra de agregação do cliente é a pior página manda: um crítico faz o
 * cliente crítico; senão uma atenção; senão saudável se ALGO foi medido;
 * senão sem medição.
 */
export type Saude = 'critico' | 'atencao' | 'saudavel' | 'sem_medicao';

export const SAUDE_LABEL: Record<Saude, string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  saudavel: 'Saudável',
  sem_medicao: 'Sem medição',
};

export const SAUDE_TOM: Record<Saude, 'neg' | 'warn' | 'ok' | 'soft'> = {
  critico: 'neg',
  atencao: 'warn',
  saudavel: 'ok',
  sem_medicao: 'soft',
};

/** Ordem de gravidade: menor é pior. */
const ORDEM: Record<Saude, number> = { critico: 0, atencao: 1, sem_medicao: 2, saudavel: 3 };

const ABERTOS = new Set(['pendente', 'em_andamento', 'aguardando_nova_analise']);

export type EntradaDeSaude = {
  /** Eventos recebidos desde o cadastro. Zero = nunca mediu comportamento. */
  totalEventos: number;
  /** Estado de rastreamento derivado em `sites.ts`. */
  estado: string;
  resumo: ResumoDeConfiguracao | undefined;
  /** Sinais DESTE site. */
  sinais: Otimizacao[];
};

/** Por que o site está nesse estado — a frase curta que a etiqueta não diz. */
export type Diagnostico = { saude: Saude; motivo: string };

export function saudeDoSite(e: EntradaDeSaude): Diagnostico {
  const abertos = e.sinais.filter((s) => ABERTOS.has(s.status));

  const critico = abertos.find((s) => s.prioridade === 1);
  if (critico) return { saude: 'critico', motivo: critico.titulo };
  if (e.resumo && e.resumo.comErro.length > 0) {
    return { saude: 'critico', motivo: 'Erro registrado na configuração' };
  }

  const medio = abertos.find((s) => s.prioridade !== 1);
  if (medio) return { saude: 'atencao', motivo: medio.titulo };
  if (e.estado === 'sem_eventos_recentes') return { saude: 'atencao', motivo: 'Sem eventos recentes' };
  if (e.resumo && e.resumo.pendentes > 0 && e.totalEventos > 0) {
    return { saude: 'atencao', motivo: 'Recurso escolhido sem verificação' };
  }

  // Alguma medição existe? Evento recebido, ou sinal já derivado de análise
  // (um sinal resolvido manualmente ainda prova que houve análise).
  const houveAnalise = e.sinais.length > 0;
  if (e.totalEventos === 0 && !houveAnalise) {
    return { saude: 'sem_medicao', motivo: 'Nenhum evento nem análise até agora' };
  }
  return { saude: 'saudavel', motivo: 'Nenhum sinal aberto' };
}

/** A pior saúde de um conjunto; vazio = sem medição. */
export function agregarSaude(saudes: Saude[]): Saude {
  if (saudes.length === 0) return 'sem_medicao';
  // "Saudável" só se ALGUM site foi medido e nenhum pede ação. Um cliente
  // cujos sites são todos "sem medição" continua sem medição.
  let pior: Saude = 'saudavel';
  let medido = false;
  for (const s of saudes) {
    if (s !== 'sem_medicao') medido = true;
    if (ORDEM[s] < ORDEM[pior]) pior = s;
  }
  if (!medido) return 'sem_medicao';
  return pior === 'sem_medicao' ? 'saudavel' : pior;
}

export function contarSaude(saudes: Saude[]): Record<Saude, number> {
  const c: Record<Saude, number> = { critico: 0, atencao: 0, saudavel: 0, sem_medicao: 0 };
  for (const s of saudes) c[s] += 1;
  return c;
}

export const FILTROS_SAUDE = ['todos', 'critico', 'atencao', 'saudavel', 'sem_medicao'] as const;
export type FiltroSaude = (typeof FILTROS_SAUDE)[number];

export function ehFiltroSaude(v: string | null | undefined): v is FiltroSaude {
  return (FILTROS_SAUDE as readonly string[]).includes(v ?? '');
}

/**
 * Busca em cliente, nome do site e domínio. Sem acento e sem caixa: quem
 * digita "contato" precisa achar "/Contato" e quem digita "agencia" precisa
 * achar "Agência".
 */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function casaBusca(termo: string, ...campos: string[]): boolean {
  const t = normalizarBusca(termo);
  if (!t) return true;
  return campos.some((c) => normalizarBusca(c).includes(t));
}
