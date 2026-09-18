import type { Aviso } from '@/lib/avisos';

/**
 * Web Push — a parte PURA: o que enviar, e como agrupar.
 *
 * Deduplicação por MUDANÇA DE ESTADO. Guarda-se a chave de cada aviso já
 * enviado; só o que é novo dispara, e o que deixou de existir sai do registro
 * — se o mesmo fato voltar, avisa de novo. Tempo não entra: "de novo amanhã"
 * é spam, e "nunca mais" esconde a regressão.
 */
export function novosParaEnviar(
  chavesAtuais: string[],
  jaEnviadas: string[],
): { enviar: string[]; limpar: string[] } {
  const atuais = new Set(chavesAtuais);
  const enviadas = new Set(jaEnviadas);
  return {
    enviar: chavesAtuais.filter((c) => !enviadas.has(c)),
    limpar: jaEnviadas.filter((c) => !atuais.has(c)),
  };
}

export type Mensagem = { titulo: string; corpo: string; url: string; chave: string };

/**
 * Agrupa por cliente: cinco avisos novos do mesmo cliente viram UMA
 * notificação ("Cliente A: 5 avisos em 2 sites"), com deep link para o
 * painel do cliente. Um aviso só vai com o próprio título e a própria porta.
 */
export function mensagensParaPush(novos: Aviso[], clienteIdDe: (a: Aviso) => string): Mensagem[] {
  const porCliente = new Map<string, Aviso[]>();
  for (const a of novos) porCliente.set(a.cliente, [...(porCliente.get(a.cliente) ?? []), a]);

  const saida: Mensagem[] = [];
  for (const [cliente, avisos] of porCliente) {
    if (avisos.length === 1) {
      const a = avisos[0]!;
      saida.push({
        titulo: `${cliente} · ${a.site}`,
        corpo: `${a.titulo}${a.detalhe ? ` — ${a.detalhe}` : ''}`,
        url: a.href,
        chave: a.chave,
      });
    } else {
      const sites = new Set(avisos.map((a) => a.siteId)).size;
      saida.push({
        titulo: cliente,
        corpo: `${avisos.length} avisos de gravidade alta em ${sites} site(s).`,
        url: `/clientes/${clienteIdDe(avisos[0]!)}`,
        chave: avisos.map((a) => a.chave).join('|'),
      });
    }
  }
  return saida;
}
