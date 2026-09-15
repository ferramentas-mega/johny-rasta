/** Formatação pt-BR. Centralizada para que nenhuma tela invente seu próprio formato. */

const NUMERO = new Intl.NumberFormat('pt-BR');

export function num(valor: number): string {
  return NUMERO.format(valor);
}

/**
 * Percentual a partir de uma razão já calculada.
 * `null` significa "não há base de cálculo" — e a tela diz isso, em vez de 0%.
 */
export function pct(razao: number | null, casas = 1): string {
  if (razao === null || !Number.isFinite(razao)) return 'Sem base de cálculo';
  return `${(razao * 100).toFixed(casas).replace('.', ',')}%`;
}

export type Variacao = { texto: string; tom: 'alta' | 'baixa' | 'neutro' };

/**
 * Comparação com o período anterior.
 * Sem base anterior não existe variação: devolver "0%" seria inventar um fato.
 */
export function variacao(atual: number, anterior: number): Variacao {
  if (anterior === 0) {
    return { texto: 'Sem base comparável neste período', tom: 'neutro' };
  }
  const delta = ((atual - anterior) / anterior) * 100;
  const sinal = delta >= 0 ? '+' : '−';
  return {
    texto: `${sinal}${Math.abs(delta).toFixed(1).replace('.', ',')}% vs. período anterior`,
    tom: delta >= 0 ? 'alta' : 'baixa',
  };
}

export function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/**
 * Fuso usado quando a tela não sabe de qual site é a data.
 *
 * `/leads`, `/otimizacoes` e o cartão de site misturam registros de sites que
 * podem ter fusos diferentes; ali não existe uma resposta certa por linha, e o
 * operador é um só. Todo site cadastrado hoje usa este fuso, e ele é o mesmo
 * padrão do formulário de cadastro.
 */
export const FUSO_PADRAO = 'America/Sao_Paulo';

/**
 * Data e hora, no fuso do SITE — nunca no do servidor.
 *
 * Isto era um defeito visível em toda tela com data: `toLocaleString` sem
 * `timeZone` formata no fuso de quem executa, e quem executa é o servidor. Na
 * Vercel isso é UTC, então um evento gerado às 20h34 em São Paulo aparecia como
 * 23h34 — três horas no futuro, num painel cujo assunto é justamente QUANDO as
 * coisas aconteceram. Quem testasse a instalação não reconhecia o próprio
 * clique.
 *
 * O projeto já tinha a regra do lado das consultas ("hora local do site, não do
 * servidor", em `porHora`); ela só nunca tinha chegado à formatação. O fuso é
 * parâmetro porque a data pertence ao site, não a quem está olhando: dois sites
 * da mesma conta podem estar em fusos diferentes, e a data de cada um precisa
 * ser lida no fuso dele.
 */
export function dataHora(valor: Date | string, fuso: string = FUSO_PADRAO): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: fuso,
  });
}

/** Mascara contato nas listagens. O valor completo fica na ficha do lead. */
export function mascararEmail(email: string | null): string {
  if (!email) return '—';
  const [usuario, dominio] = email.split('@');
  if (!dominio || !usuario) return '—';
  const visivel = usuario.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}
