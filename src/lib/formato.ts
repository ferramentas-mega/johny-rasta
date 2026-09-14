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
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

export function dataHora(valor: Date | string): string {
  const d = typeof valor === 'string' ? new Date(valor) : valor;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Mascara contato nas listagens. O valor completo fica na ficha do lead. */
export function mascararEmail(email: string | null): string {
  if (!email) return '—';
  const [usuario, dominio] = email.split('@');
  if (!dominio || !usuario) return '—';
  const visivel = usuario.slice(0, 2);
  return `${visivel}${'*'.repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}
