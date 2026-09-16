/**
 * Tipos e rótulos da lista de otimizações.
 *
 * Vive em `src/lib` — e não junto da consulta — porque o controle de situação é
 * um componente CLIENTE, e o módulo do servidor leva `server-only`. Importar de
 * lá quebra o build, com um erro de webpack que não diz qual é a causa. É a
 * mesma separação que existe entre `recursos.ts` e `onboarding.ts`, pelo mesmo
 * motivo, e está registrada no CLAUDE.md.
 *
 * O efeito colateral bom é o de sempre: a parte pura fica testável sem subir
 * banco.
 */

export type TipoOtimizacao = 'tecnico' | 'comercial' | 'coleta' | 'atualizacao';

/**
 * O dispositivo do sinal, quando ele tem um.
 *
 * Nulo não é "ainda não sabemos": é "esta pergunta não se aplica". Uma URL
 * prioritária nunca analisada não tem nota em dispositivo nenhum, e um site que
 * parou de coletar vale inteiro. Preencher com 'mobile' por comodidade
 * afirmaria uma medição que não existe.
 */
export type Dispositivo = 'mobile' | 'desktop';

export const DISPOSITIVO_LABEL: Record<Dispositivo, string> = {
  mobile: 'celular',
  desktop: 'computador',
};

export type Otimizacao = {
  id: string | null;
  siteId: string;
  site: string;
  cliente: string;
  url: string | null;
  dispositivo: Dispositivo | null;
  tipo: TipoOtimizacao;
  titulo: string;
  evidencia: string;
  prioridade: number;
  status: string;
  proximaAcao: string;
  detectadoEm: Date;
};

export const TIPO_LABEL: Record<TipoOtimizacao, string> = {
  tecnico: 'Técnico',
  comercial: 'Comercial',
  coleta: 'Coleta',
  atualizacao: 'Atualização',
};

export const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  aguardando_nova_analise: 'Aguardando nova análise',
  resolvida_manual: 'Resolvida manualmente',
  resolvida_por_verificacao: 'Resolvida por verificação',
};

/**
 * Os status que o operador pode escolher.
 *
 * `resolvida_por_verificacao` fica de fora de propósito: ela não é escolha de
 * ninguém. É o que acontece quando o sinal para de ser detectado — e aí o item
 * sai da lista sozinho, porque a lista mostra sinais. Oferecê-la num seletor
 * seria deixar alguém declarar uma verificação que não houve.
 */
export const STATUS_MANUAIS = [
  'pendente',
  'em_andamento',
  'aguardando_nova_analise',
  'resolvida_manual',
] as const;

export type StatusManual = (typeof STATUS_MANUAIS)[number];

export function ehStatusManual(valor: string): valor is StatusManual {
  return (STATUS_MANUAIS as readonly string[]).includes(valor);
}

/**
 * O sinal que está sendo acompanhado.
 *
 * Um sinal derivado não tem id próprio: ele é recalculado a cada consulta. A
 * identidade dele é o que o descreve — por isso a chave é composta, e por isso
 * o índice único do banco é sobre essas mesmas cinco colunas.
 *
 * `dispositivo` entrou depois, e a falta dele custava caro: o título do sinal
 * técnico é igual nos dois dispositivos, então celular e computador da mesma
 * página casavam com UMA linha de acompanhamento — marcar um mudava o outro, e
 * o fechamento podia creditar a um a melhora medida no outro.
 */
export type ChaveDoSinal = {
  siteId: string;
  tipo: TipoOtimizacao;
  url: string | null;
  dispositivo: Dispositivo | null;
  titulo: string;
};

export function ehDispositivo(valor: string): valor is Dispositivo {
  return valor === 'mobile' || valor === 'desktop';
}
