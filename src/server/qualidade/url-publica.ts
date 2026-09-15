/**
 * Só URLs públicas podem ser auditadas.
 *
 * Duas razões, e as duas importam:
 *
 * 1. **SSRF.** O servidor é quem faz a requisição. Sem validação, `url` vira um
 *    pedido para o backend alcançar `169.254.169.254` (metadados da nuvem),
 *    `127.0.0.1` (serviços internos) ou `10.0.0.0/8`. O Google buscaria a
 *    página, mas o dano é a própria existência de um endpoint que aponta o
 *    servidor para onde o chamador quiser.
 * 2. **Quota.** São 25.000 análises por dia por chave. Um endpoint irrestrito é
 *    um jeito barato de alguém esgotar isso.
 *
 * A validação de formato mora aqui; a de autorização (a URL estar cadastrada
 * naquele site, e o site pertencer à conta da sessão) mora no serviço, porque
 * depende do banco. As duas são obrigatórias — filtro de tela não é nenhuma
 * das duas.
 */

export type UrlRecusada =
  | 'esquema_invalido'
  | 'host_ausente'
  | 'host_local'
  | 'ip_privado'
  | 'credenciais_na_url'
  | 'porta_incomum';

/** Só NOMES. Endereços numéricos são tratados por `ehIpPrivado`. */
const HOSTS_LOCAIS = new Set(['localhost', 'ip6-localhost', 'ip6-loopback']);

/**
 * `new URL('http://[::1]/').hostname` devolve `[::1]`, COM os colchetes.
 * Comparar contra `::1` sem normalizar deixava o loopback IPv6 passar — foi um
 * furo real, pego pelo teste.
 */
function normalizarHost(host: string): string {
  return host.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Faixas que nunca estão na internet pública. */
function ehIpPrivado(host: string): boolean {
  const semColchetes = normalizarHost(host);

  // IPv6: loopback, não-especificado, link-local (fe80::/10), unique local (fc00::/7).
  if (semColchetes === '::1' || semColchetes === '::') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(semColchetes)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(semColchetes)) return true;

  // IPv4 mapeado em IPv6 é o mesmo endereço por outro nome, e precisa decidir
  // igual. Duas formas: a pontuada (`::ffff:127.0.0.1`) e a hexadecimal
  // (`::ffff:7f00:1`), que é para a qual o `URL` do Node normaliza a primeira.
  const pontuado = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(semColchetes);
  if (pontuado) return ehIpPrivado(pontuado[1]!);

  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(semColchetes);
  if (hex) {
    const alto = parseInt(hex[1]!, 16);
    const baixo = parseInt(hex[2]!, 16);
    const octetos = [alto >> 8, alto & 0xff, baixo >> 8, baixo & 0xff];
    return ehIpPrivado(octetos.join('.'));
  }

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(semColchetes);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true; // malformado: recusa

  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 127) return true;                       // loopback
  if (a === 0) return true;                         // "este host"
  if (a === 169 && b === 254) return true;          // link-local E metadados de nuvem
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

export function validarUrlPublica(bruta: string): { ok: true; url: string } | { ok: false; motivo: UrlRecusada } {
  let u: URL;
  try {
    u = new URL(bruta);
  } catch {
    return { ok: false, motivo: 'host_ausente' };
  }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, motivo: 'esquema_invalido' };
  if (!u.hostname) return { ok: false, motivo: 'host_ausente' };
  // `https://usuario:senha@host` vaza credencial para o log e para a API.
  if (u.username || u.password) return { ok: false, motivo: 'credenciais_na_url' };

  const host = normalizarHost(u.hostname);
  if (HOSTS_LOCAIS.has(host) || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return { ok: false, motivo: 'host_local' };
  }
  // Endereço numérico é decidido pelas faixas, não pela presença de ponto.
  if (ehIpPrivado(host)) return { ok: false, motivo: 'ip_privado' };
  // Um nome sem ponto não é resolvível na internet pública (`intranet`, `db`).
  if (!host.includes('.') && !host.includes(':')) return { ok: false, motivo: 'host_local' };

  if (u.port && u.port !== '80' && u.port !== '443') return { ok: false, motivo: 'porta_incomum' };

  // Fragmento não chega ao servidor e só polui a chave de deduplicação.
  u.hash = '';
  return { ok: true, url: u.toString() };
}

export const MOTIVO_LABEL: Record<UrlRecusada, string> = {
  esquema_invalido: 'Só http e https são aceitos.',
  host_ausente: 'Endereço inválido.',
  host_local: 'Endereços locais não podem ser auditados.',
  ip_privado: 'Endereços de rede privada não podem ser auditados.',
  credenciais_na_url: 'Remova usuário e senha do endereço.',
  porta_incomum: 'Só as portas 80 e 443 são aceitas.',
};
