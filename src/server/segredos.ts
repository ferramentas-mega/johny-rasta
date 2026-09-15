import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/**
 * Compara dois segredos sem vazar onde eles diferem.
 *
 * `a === b` em JavaScript para no primeiro byte diferente. A diferença de tempo
 * é de nanossegundos e, numa única requisição pela internet, some no ruído da
 * rede — por isso isto não é urgente. Mas com milhares de tentativas e média
 * estatística, um atacante paciente descobre o segredo byte a byte, e o custo de
 * fechar essa porta é uma função de seis linhas.
 *
 * O projeto já fazia certo em um lugar (o token de diagnóstico) e errado em
 * dois: o `CRON_SECRET` era comparado com `===` no agendador e no processador.
 * Ter as duas formas no mesmo repositório é pior que ter só a insegura — sugere
 * que alguém pensou no assunto e decidiu que ali não valia.
 *
 * O comprimento vaza de propósito: `timingSafeEqual` exige buffers do mesmo
 * tamanho, e o tamanho de um segredo não é o segredo.
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido) return false;

  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
