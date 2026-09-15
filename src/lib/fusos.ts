/**
 * Fusos horários oferecidos, e a validação de quem chega por outro caminho.
 *
 * Módulo puro (sem `server-only`) porque os dois lados precisam dele: os
 * componentes cliente montam o seletor, e o servidor valida o que recebe.
 *
 * **Por que validar, se o campo é um `<select>`.** Porque `<select>` é uma
 * conveniência do navegador, não uma garantia: uma Server Action recebe o que
 * mandarem no corpo. O valor vai direto para `at time zone <fuso>` nas consultas
 * de período, e um nome que o Postgres não conhece **lança** — derrubando não só
 * as telas daquele site, mas a visão geral da conta, que percorre todos eles.
 * Um campo de texto livre virava, na prática, um botão de desligar o painel.
 *
 * A lista é curta de propósito: cobre o Brasil real sem virar um seletor de 400
 * itens. Quem precisar de outro fuso acrescenta aqui — e o teste que confere que
 * o Postgres aceita todos eles falha se o nome estiver errado.
 */
export const FUSOS = [
  'America/Sao_Paulo',
  'America/Bahia',
  'America/Fortaleza',
  'America/Recife',
  'America/Belem',
  'America/Manaus',
  'America/Cuiaba',
  'America/Campo_Grande',
  'America/Porto_Velho',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC',
] as const;

export type Fuso = (typeof FUSOS)[number];

export const FUSO_PADRAO: Fuso = 'America/Sao_Paulo';

export function fusoValido(valor: string): valor is Fuso {
  return (FUSOS as readonly string[]).includes(valor);
}

export const MENSAGEM_FUSO_INVALIDO =
  'Fuso horário desconhecido. Escolha um da lista.';
