
/**
 * Configuração de mensuração, recurso a recurso — a parte PURA.
 *
 * A regra central desta parte do sistema: **não existe `configurado: true` para
 * o site inteiro.** Um site que mede visitas e cliques no WhatsApp, e não tem
 * formulário nenhum, está completamente configurado — tratá-lo como pendente
 * para sempre treinaria o operador a ignorar a lista de pendências.
 *
 * O que fica gravado é só o que não dá para derivar:
 *
 *  - `selecionado` — a escolha do operador sobre o que quer acompanhar;
 *  - `verificado_em` + `evidencia` — o fato histórico de uma verificação ter
 *    passado, com a prova.
 *
 * Todo o resto é calculado na hora, a partir dos dados reais. Em particular, o
 * PROGRESSO do assistente é derivado dos requisitos escolhidos e das
 * verificações — nunca de um contador que avança ao clicar em "Próximo". Um
 * contador diria "etapa 5 de 7" para quem voltou e desmarcou tudo.
 *
 * Duas coisas que se parecem e não são a mesma:
 *
 *  - **Instalação verificada** (`verificado_em`): funcionou durante o teste. É
 *    passado, e não expira.
 *  - **Último evento recebido** (`ultimoEvento`, em `sites.ts`): atividade
 *    recente. Um site de pouco tráfego pode passar dias sem visita — e isso
 *    não o torna quebrado.
 */
export const RECURSOS = ['visitas', 'whatsapp', 'contatos', 'formularios', 'qualidade'] as const;
export type Recurso = (typeof RECURSOS)[number];

export const RECURSO_LABEL: Record<Recurso, string> = {
  visitas: 'Visitas e páginas acessadas',
  whatsapp: 'Cliques no WhatsApp',
  contatos: 'Cliques em telefone e e-mail',
  formularios: 'Formulários e leads',
  qualidade: 'Qualidade técnica (PageSpeed)',
};

/** O que cada recurso mede, o que exige e como a verificação acontece. */
export const RECURSO_EXPLICACAO: Record<
  Recurso,
  { mede: string; exige: string; verificacao: string }
> = {
  visitas: {
    mede: 'Sessões, visitantes únicos e quais páginas foram abertas.',
    exige: 'Instalar o script de coleta em todas as páginas do site.',
    verificacao: 'Abrindo o site com o modo de diagnóstico e conferindo a visualização que chega ao servidor.',
  },
  whatsapp: {
    mede: 'Cliques em links de WhatsApp. Registra intenção de contato, não conversa iniciada.',
    exige: 'O mesmo script de coleta. Links de wa.me são detectados sozinhos.',
    verificacao: 'Clicando no botão durante o diagnóstico e conferindo o clique recebido.',
  },
  contatos: {
    mede: 'Cliques em links de telefone e de e-mail.',
    exige: 'O mesmo script de coleta. Links tel: e mailto: são detectados sozinhos.',
    verificacao: 'Clicando no link durante o diagnóstico.',
  },
  formularios: {
    mede: 'Envios de formulário confirmados pelo servidor, e os leads deduplicados.',
    exige: 'Apontar o formulário para o endpoint do painel, ou um envio a partir do serviço externo.',
    verificacao: 'Um envio que o servidor grave de verdade — não o evento de submit do navegador.',
  },
  qualidade: {
    mede: 'Notas do Lighthouse por URL e por dispositivo, mais a experiência real do CrUX.',
    exige: 'Uma URL pública e a chave do PageSpeed configurada no servidor. Não exige o script.',
    verificacao: 'Uma análise concluída com nota registrada.',
  },
};

/**
 * Recursos que dependem do script de coleta.
 *
 * `qualidade` fica de fora de propósito: analisar a qualidade técnica é um
 * caminho INDEPENDENTE, que funciona num site onde ninguém instalou nada.
 * Misturar os dois faria o operador achar que precisa do script para ver a nota
 * — e faria o PageSpeed parecer fonte de visitas, que ele não é.
 */
export const RECURSOS_DO_COLETOR: Recurso[] = ['visitas', 'whatsapp', 'contatos', 'formularios'];

export type EstadoRecurso =
  | 'nao_selecionado'
  | 'pendente_configuracao'
  | 'aguardando_instalacao'
  | 'aguardando_verificacao'
  | 'verificado'
  | 'erro';

export const ESTADO_RECURSO_LABEL: Record<EstadoRecurso, string> = {
  nao_selecionado: 'Não se aplica',
  pendente_configuracao: 'Configuração pendente',
  aguardando_instalacao: 'Aguardando instalação',
  aguardando_verificacao: 'Aguardando verificação',
  verificado: 'Verificado',
  erro: 'Erro identificado',
};

export const ESTADO_RECURSO_TOM: Record<EstadoRecurso, 'ok' | 'warn' | 'soft' | 'neg'> = {
  nao_selecionado: 'soft',
  pendente_configuracao: 'warn',
  aguardando_instalacao: 'warn',
  aguardando_verificacao: 'warn',
  verificado: 'ok',
  erro: 'neg',
};

export type Plataforma = 'wordpress' | 'react_next' | 'html' | 'desconhecida';

export const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  wordpress: 'WordPress',
  react_next: 'React / Next.js',
  html: 'HTML ou outra plataforma',
  desconhecida: 'Não sei informar',
};

export type ModoFormulario = 'proprio' | 'externo' | 'sem';

export const MODO_FORMULARIO_LABEL: Record<ModoFormulario, string> = {
  proprio: 'Formulário integrado ao próprio site',
  externo: 'Plugin ou serviço externo',
  sem: 'Sem formulário',
};

export type Feature = {
  recurso: Recurso;
  selecionado: boolean;
  verificadoEm: Date | null;
  evidencia: Record<string, unknown> | null;
  erro: string | null;
  estado: EstadoRecurso;
};

export type ConfiguracaoDoSite = {
  siteId: string;
  plataforma: Plataforma;
  urlPrincipal: string | null;
  modoFormulario: ModoFormulario | null;
  recursosEscolhidosEm: Date | null;
  /** Quantas URLs o site tem em monitoramento. Pré-requisito de `qualidade`. */
  urlsMonitoradas: number;
  /** Se o servidor tem a chave do PageSpeed. Pendência de servidor, não do site. */
  pagespeedConfigurado: boolean;
  features: Feature[];
};

export type LinhaFeature = {
  feature: Recurso;
  selecionado: boolean;
  verificado_em: Date | null;
  evidencia: Record<string, unknown> | null;
  erro: string | null;
};

/**
 * Deriva o estado de um recurso.
 *
 * A ordem das perguntas é a ordem em que elas param de valer: um recurso que
 * não foi escolhido não tem pendência; um erro registrado vence a espera; e a
 * verificação, uma vez feita, não é desfeita por falta de tráfego recente.
 */
export function derivarEstado(
  linha: LinhaFeature,
  contexto: { urlsMonitoradas: number; pagespeedConfigurado: boolean; modoFormulario: ModoFormulario | null },
): EstadoRecurso {
  if (!linha.selecionado) return 'nao_selecionado';
  if (linha.verificado_em) return 'verificado';
  if (linha.erro) return 'erro';

  if (linha.feature === 'qualidade') {
    // Falta algo que o operador ainda precisa fazer, ou algo que o servidor
    // precisa ter. Os dois são "pendente de configuração", e a tela diz qual.
    if (!contexto.pagespeedConfigurado || contexto.urlsMonitoradas === 0) return 'pendente_configuracao';
    return 'aguardando_verificacao';
  }

  if (linha.feature === 'formularios') {
    if (!contexto.modoFormulario) return 'pendente_configuracao';
    if (contexto.modoFormulario === 'sem') return 'nao_selecionado';
    return 'aguardando_verificacao';
  }

  return 'aguardando_verificacao';
}

// ───────────────────────── etapas do assistente ─────────────────────────

export const ETAPAS = [
  { numero: 1, slug: 'identificacao', titulo: 'Identificar o site' },
  { numero: 2, slug: 'recursos', titulo: 'Escolher o que acompanhar' },
  { numero: 3, slug: 'instalacao', titulo: 'Instalar o rastreamento' },
  { numero: 4, slug: 'verificacao', titulo: 'Verificar visitas e cliques' },
  { numero: 5, slug: 'formularios', titulo: 'Configurar formulários' },
  { numero: 6, slug: 'qualidade', titulo: 'Configurar a análise técnica' },
  { numero: 7, slug: 'resumo', titulo: 'Resumo' },
] as const;

export type EtapaSlug = (typeof ETAPAS)[number]['slug'];

export type SituacaoEtapa = 'concluida' | 'pendente' | 'nao_se_aplica';

/**
 * Situação de cada etapa, DERIVADA.
 *
 * Nenhuma etapa é marcada como concluída por ter sido visitada. Em particular,
 * a etapa 3 (instalar) não conclui por o operador ter copiado o código: copiar
 * confirma a cópia e nada mais. Ela conclui quando a etapa 4 verifica — que é a
 * única evidência de que o script está mesmo na página.
 */
export function situacaoDasEtapas(config: ConfiguracaoDoSite): Record<EtapaSlug, SituacaoEtapa> {
  const de = (r: Recurso) => config.features.find((f) => f.recurso === r)!;
  const selecionados = config.features.filter((f) => f.selecionado);
  const doColetor = selecionados.filter((f) => RECURSOS_DO_COLETOR.includes(f.recurso));

  const identificacao: SituacaoEtapa =
    config.plataforma !== 'desconhecida' || config.urlPrincipal ? 'concluida' : 'pendente';

  const recursos: SituacaoEtapa = config.recursosEscolhidosEm ? 'concluida' : 'pendente';

  // Instalar e verificar só existem se algum recurso do coletor foi escolhido.
  const instalacao: SituacaoEtapa =
    doColetor.length === 0 ? 'nao_se_aplica'
    : doColetor.some((f) => f.estado === 'verificado') ? 'concluida'
    : 'pendente';

  // A etapa 4 cobre visitas e cliques — formulários têm etapa própria.
  const verificaveis = doColetor.filter((f) => f.recurso !== 'formularios');
  const verificacao: SituacaoEtapa =
    verificaveis.length === 0 ? 'nao_se_aplica'
    : verificaveis.every((f) => f.estado === 'verificado') ? 'concluida'
    : 'pendente';

  const formularios: SituacaoEtapa =
    !de('formularios').selecionado ? 'nao_se_aplica'
    : config.modoFormulario === 'sem' ? 'concluida'
    : de('formularios').estado === 'verificado' ? 'concluida'
    : 'pendente';

  const qualidade: SituacaoEtapa =
    !de('qualidade').selecionado ? 'nao_se_aplica'
    : de('qualidade').estado === 'verificado' ? 'concluida'
    : 'pendente';

  const anteriores = [identificacao, recursos, instalacao, verificacao, formularios, qualidade];
  const resumo: SituacaoEtapa = anteriores.every((s) => s !== 'pendente') ? 'concluida' : 'pendente';

  return { identificacao, recursos, instalacao, verificacao, formularios, qualidade, resumo };
}

/** A etapa onde o operador retoma: a primeira pendente, ou o resumo. */
export function proximaEtapa(config: ConfiguracaoDoSite): EtapaSlug {
  const situacao = situacaoDasEtapas(config);
  return ETAPAS.find((e) => situacao[e.slug] === 'pendente')?.slug ?? 'resumo';
}

/** `true` só quando todo recurso escolhido está verificado. */
export function configuracaoCompleta(config: ConfiguracaoDoSite): boolean {
  return situacaoDasEtapas(config).resumo === 'concluida';
}

/** Quantos recursos escolhidos ainda não estão verificados. Zero = nada a fazer. */
export function pendencias(config: ConfiguracaoDoSite): number {
  const situacao = situacaoDasEtapas(config);
  return ETAPAS.filter((e) => e.slug !== 'resumo' && situacao[e.slug] === 'pendente').length;
}

// ───────────────────────── verificação ─────────────────────────

export type EventoDiagnostico = {
  tipo: string;
  subtipo: string | null;
  caminho: string | null;
  quando: Date;
  botao: string | null;
};

export type ResultadoVerificacao = {
  eventos: EventoDiagnostico[];
  /** Recursos que passaram a verificar nesta conferência. */
  verificados: Recurso[];
  /** Envios de formulário gravados nesta sessão de diagnóstico. */
  formularios: number;
};

/**
 * Confere o que chegou ao servidor nesta sessão de diagnóstico e carimba o que
 * passou.
 *
 * Duas coisas que esta função NÃO faz, e são o motivo dela existir:
 *
 *  1. Não confirma nada por temporizador, nem por o snippet aparecer no HTML.
 *     Só conta o que o banco recebeu.
 *  2. Não confunde o teste com tráfego de terceiros: filtra pelo token da
 *     sessão de diagnóstico, então um visitante que clicou no WhatsApp no mesmo
 *     minuto não verifica a instalação de ninguém.
 */
export type ResumoDeConfiguracao = {
  siteId: string;
  /** Recursos escolhidos que ainda não estão verificados. */
  pendentes: number;
  /** Recursos escolhidos e verificados. */
  verificados: number;
  /** Nenhum recurso escolhido ainda: o assistente nem começou. */
  naoIniciado: boolean;
};

export type SessaoDiagnostico = { id: string; token: string; abertaEm: Date };

export type SiteExistente = { id: string; name: string; domain: string; clienteNome: string };
