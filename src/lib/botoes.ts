/**
 * Inventário de tags e botões — a parte PURA.
 *
 * ── O que este inventário pode e não pode afirmar ────────────────────────────
 *
 * Ele é construído a partir do que o coletor RECEBEU. Isso tem um limite duro, e
 * a tela precisa dizê-lo: **não dá para listar o que existe no site e nunca foi
 * clicado.** Um botão instalado ontem, num rodapé que ninguém rola até lá,
 * simplesmente não aparece aqui — e afirmar "seu site tem 7 botões" seria
 * inventar um número sobre um conjunto que este painel não enxerga.
 *
 * O que ele afirma com segurança é o outro lado: de tudo o que JÁ foi clicado,
 * o que está bem marcado, o que está sendo agrupado como automático, e o que
 * parou de aparecer.
 *
 * ── Por que "parou de aparecer" é a parte delicada ───────────────────────────
 *
 * É o sinal mais útil (um botão removido num deploy, ou um `data-track-id`
 * perdido numa refatoração, some sem erro nenhum) e o mais fácil de transformar
 * em alarme falso. Duas salvaguardas, ambas herdadas da regra que o projeto já
 * aplica a "site sem eventos":
 *
 *  1. **Só afirma sumiço de botão que tinha regularidade.** Um botão clicado
 *     duas vezes na vida não "sumiu" — ele nunca teve volume para se afirmar
 *     nada sobre ele.
 *  2. **Só afirma sumiço quando o SITE continua ativo.** Se a coleta inteira
 *     parou, todos os botões parecem sumidos, e a lista apontaria para sete
 *     problemas quando existe um só — no lugar errado.
 */

export type EstadoDoBotao =
  /** Detectado sozinho (wa.me, tel:, mailto:) e sem `data-track-id`. */
  | 'sem_nome'
  /** Tem nome, mas nenhuma posição declarada. */
  | 'sem_posicao'
  /** Tinha volume e parou de aparecer, num site que continua coletando. */
  | 'sumiu'
  /** Apareceu pela primeira vez há pouco tempo. */
  | 'novo'
  /** Nomeado, posicionado e ainda recebendo cliques. */
  | 'medindo';

export const ESTADO_BOTAO_LABEL: Record<EstadoDoBotao, string> = {
  sem_nome: 'Sem nome',
  sem_posicao: 'Sem posição',
  sumiu: 'Parou de aparecer',
  novo: 'Novo',
  medindo: 'Medindo',
};

export const ESTADO_BOTAO_TOM: Record<EstadoDoBotao, 'ok' | 'warn' | 'soft' | 'neg'> = {
  sem_nome: 'warn',
  sem_posicao: 'soft',
  sumiu: 'neg',
  novo: 'soft',
  medindo: 'ok',
};

/** O que fazer a respeito. Estado sem próxima ação é só um rótulo bonito. */
export const ESTADO_BOTAO_ACAO: Record<EstadoDoBotao, string> = {
  sem_nome:
    'Acrescente data-track-id e data-track-pos ao elemento. O clique já é contado — o que falta é o nome legível no relatório.',
  sem_posicao:
    'Acrescente data-track-pos para separar o mesmo botão em lugares diferentes da página (Hero, Conteúdo, Rodapé).',
  sumiu:
    'Confira se o botão ainda existe na página e se o data-track-id sobreviveu ao último deploy. O site continua recebendo outros eventos.',
  novo: 'Nada a fazer. Apareceu pela primeira vez há pouco tempo.',
  medindo: 'Nada a fazer.',
};

/** Dias sem nenhum clique para um botão com volume ser dado como sumido. */
export const DIAS_PARA_SUMICO = 14;

/** Dias desde o primeiro clique para o botão ainda contar como novo. */
export const DIAS_PARA_NOVIDADE = 7;

/**
 * Cliques históricos mínimos para se afirmar que um botão "parou de aparecer".
 *
 * Abaixo disso não há regularidade: o botão nunca teve volume que permita
 * distinguir "sumiu" de "ninguém clicou nesta quinzena".
 */
export const CLIQUES_PARA_AFIRMAR_SUMICO = 10;

export type BotaoInventariado = {
  buttonId: string;
  /** `false` quando o id começa com `auto:` — detectado, porém sem nome. */
  identificado: boolean;
  subtipo: string;
  texto: string;
  posicao: string | null;
  /** Em quantas páginas distintas este botão já foi clicado. */
  paginas: number;
  exemploPagina: string | null;
  cliques: number;
  primeiroEm: Date;
  ultimoEm: Date;
};

export type BotaoComEstado = BotaoInventariado & { estado: EstadoDoBotao };

const DIA_MS = 86_400_000;

/**
 * Deriva o estado de um botão.
 *
 * A ORDEM das perguntas é a ordem de urgência, e ela é decisão de produto: um
 * botão que sumiu precisa de atenção antes de um que só está mal nomeado, e um
 * que está mal nomeado precisa de atenção antes de a tela comemorar que ele é
 * novo. Um botão pode satisfazer várias condições ao mesmo tempo; a primeira que
 * casar é a que a tela mostra.
 */
export function estadoDoBotao(
  b: BotaoInventariado,
  contexto: {
    agora: Date;
    /**
     * O site continua recebendo eventos?
     *
     * Sem isto, uma coleta que parou por inteiro faria TODOS os botões
     * aparecerem como sumidos — sete problemas na lista onde existe um só, e
     * apontando para o lugar errado.
     */
    siteAtivo: boolean;
  },
): EstadoDoBotao {
  const diasSemClique = (contexto.agora.getTime() - b.ultimoEm.getTime()) / DIA_MS;
  const diasDeVida = (contexto.agora.getTime() - b.primeiroEm.getTime()) / DIA_MS;

  if (
    contexto.siteAtivo &&
    b.cliques >= CLIQUES_PARA_AFIRMAR_SUMICO &&
    diasSemClique > DIAS_PARA_SUMICO
  ) {
    return 'sumiu';
  }

  if (!b.identificado) return 'sem_nome';
  if (!b.posicao) return 'sem_posicao';
  if (diasDeVida <= DIAS_PARA_NOVIDADE) return 'novo';
  return 'medindo';
}

/**
 * Resumo do inventário, para o cabeçalho do painel.
 *
 * Conta o que EXIGE ação, separado do que está bem. Um total sozinho ("12
 * botões") não diz se há trabalho a fazer.
 */
export type ResumoDoInventario = {
  total: number;
  semNome: number;
  sumiram: number;
  medindo: number;
};

export function resumirInventario(botoes: BotaoComEstado[]): ResumoDoInventario {
  return {
    total: botoes.length,
    semNome: botoes.filter((b) => b.estado === 'sem_nome').length,
    sumiram: botoes.filter((b) => b.estado === 'sumiu').length,
    medindo: botoes.filter((b) => b.estado === 'medindo').length,
  };
}

/**
 * Ordena por urgência, e depois por volume.
 *
 * Volume sozinho põe o botão mais clicado no topo — que é justamente o que está
 * funcionando. Quem abre esta tela quer ver primeiro o que está errado.
 */
const PESO: Record<EstadoDoBotao, number> = {
  sumiu: 0,
  sem_nome: 1,
  sem_posicao: 2,
  novo: 3,
  medindo: 4,
};

export function ordenarInventario(botoes: BotaoComEstado[]): BotaoComEstado[] {
  return [...botoes].sort(
    (a, b) => PESO[a.estado] - PESO[b.estado] || b.cliques - a.cliques,
  );
}

// ───────────────────────── tags duplicadas ─────────────────────────

/**
 * Página que registrou visualizações duplicadas.
 *
 * O sintoma de um coletor instalado DUAS vezes — o `t.js` no layout e de novo
 * num plugin, por exemplo. Cada instância dispara a própria visualização, com
 * `event_uid` diferente, então a deduplicação por idempotência não pega: são
 * dois eventos legítimos e distintos do ponto de vista do banco.
 *
 * O efeito é silencioso e caro: as visualizações dobram, "páginas por sessão"
 * dobra, e a taxa de conversão cai pela metade sem que nada tenha piorado no
 * site. Ninguém desconfia de um número que só subiu.
 */
export type PaginaComTagDuplicada = {
  caminho: string;
  /** Pares de visualizações da MESMA sessão separados por menos de 2 segundos. */
  ocorrencias: number;
  ultimaEm: Date;
};
