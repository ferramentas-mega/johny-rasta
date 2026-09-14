/**
 * Catálogo de indicadores.
 *
 * Cada indicador é definido AQUI — rótulo, escopo e fórmula — antes de existir
 * qualquer agregação. Os textos de ajuda são os mesmos que aparecem na tela, de
 * modo que o que o usuário lê é a definição que o SQL implementa.
 *
 * A distinção que mais causou confusão no protótipo está nas duas últimas:
 * `sessoesConvertidas` e `enviosPorSessao` NÃO são a mesma conta, e por isso
 * têm rótulos que não se confundem.
 */

export type MetricKey =
  | 'sessoes'
  | 'visitantesUnicos'
  | 'visualizacoes'
  | 'cliquesCta'
  | 'cliquesWhatsapp'
  | 'cliquesContato'
  | 'aberturasFormulario'
  | 'formularios'
  | 'leads'
  | 'sessoesConvertidas'
  | 'enviosPorSessao';

export type MetricDefinition = {
  key: MetricKey;
  label: string;
  /** Unidade do valor: contagem absoluta ou percentual. */
  kind: 'contagem' | 'percentual';
  /** O que entra e o que fica de fora. Aparece no tooltip. */
  help: string;
};

export const METRICS: Record<MetricKey, MetricDefinition> = {
  sessoes: {
    key: 'sessoes',
    label: 'Visitas / sessões',
    kind: 'contagem',
    help: 'Sessões do rastreamento próprio. Uma sessão encerra após 30 minutos de inatividade; a mesma pessoa voltando no dia seguinte gera outra sessão.',
  },
  visitantesUnicos: {
    key: 'visitantesUnicos',
    label: 'Visitantes únicos',
    kind: 'contagem',
    help: 'Identificadores de navegador distintos no período inteiro. Não é somável entre períodos: os únicos de 30 dias são menores que a soma dos únicos diários.',
  },
  visualizacoes: {
    key: 'visualizacoes',
    label: 'Visualizações de página',
    kind: 'contagem',
    help: 'Eventos page_view, incluindo troca de rota em aplicações de página única.',
  },
  cliquesCta: {
    key: 'cliquesCta',
    label: 'Cliques em CTA',
    kind: 'contagem',
    help: 'Todos os cliques em elementos marcados, INCLUINDO abertura de formulário. É o total que aparece nas tabelas por página e por botão.',
  },
  cliquesWhatsapp: {
    key: 'cliquesWhatsapp',
    label: 'Cliques no WhatsApp',
    kind: 'contagem',
    help: 'Cliques em links de WhatsApp. Registra a intenção de contato: não comprova que a conversa foi iniciada, nem gera lead.',
  },
  cliquesContato: {
    key: 'cliquesContato',
    label: 'Cliques em outros contatos',
    kind: 'contagem',
    help: 'Cliques em telefone e e-mail. Exclui WhatsApp e exclui abertura de formulário.',
  },
  aberturasFormulario: {
    key: 'aberturasFormulario',
    label: 'Aberturas de formulário',
    kind: 'contagem',
    help: 'Cliques que abrem um formulário. Abrir não é enviar: este número é sempre maior ou igual aos formulários recebidos.',
  },
  formularios: {
    key: 'formularios',
    label: 'Formulários recebidos',
    kind: 'contagem',
    help: 'Submissões confirmadas pelo backend, atribuídas pela data de recebimento. Reenvios com a mesma chave de idempotência contam uma vez só.',
  },
  leads: {
    key: 'leads',
    label: 'Leads registrados',
    kind: 'contagem',
    help: 'Contatos distintos criados no período, deduplicados por e-mail ou telefone dentro do mesmo site. Duas submissões da mesma pessoa geram um lead.',
  },
  sessoesConvertidas: {
    key: 'sessoesConvertidas',
    label: 'Sessões convertidas',
    kind: 'percentual',
    help: 'Sessões distintas com pelo menos uma submissão confirmada ÷ sessões elegíveis do mesmo período. Nunca passa de 100%.',
  },
  enviosPorSessao: {
    key: 'enviosPorSessao',
    label: 'Envios por sessão',
    kind: 'percentual',
    help: 'Submissões ÷ sessões. PODE passar de 100%, porque uma sessão pode enviar mais de um formulário. Não é a taxa de sessões convertidas.',
  },
};
