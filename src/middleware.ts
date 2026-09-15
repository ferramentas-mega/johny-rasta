import { NextResponse, type NextRequest } from 'next/server';

/**
 * Cabeçalhos de segurança, com nonce por requisição.
 *
 * Vive em middleware, e não em `next.config.ts`, por um motivo só: a CSP
 * precisa de um nonce diferente a cada resposta, e a configuração estática não
 * tem como gerar um.
 *
 * ── O que esta política precisa aceitar, e por quê ────────────────────────────
 *
 * **Estilo inline.** O projeto inteiro é construído com `style={{...}}` — não há
 * Tailwind nem classes utilitárias. `style-src 'unsafe-inline'` não é descuido
 * aqui, é a consequência da arquitetura visual. Removê-lo exigiria reescrever
 * todos os componentes.
 *
 * **Um script inline.** O layout raiz aplica tema e efeitos antes da primeira
 * pintura, para a página não piscar. Ele recebe o nonce; o Next aplica o mesmo
 * nonce aos scripts que ele próprio injeta quando enxerga um na CSP.
 *
 * **`connect-src` para o próprio domínio.** As Server Actions e o `fetch` do
 * painel falam só com a própria origem.
 *
 * ── O que ela NÃO governa ────────────────────────────────────────────────────
 *
 * O coletor `/t.js` roda no site do CLIENTE, sob a CSP daquele site. Nada aqui
 * afeta o que ele consegue fazer lá — e uma política daqui nunca deve tentar,
 * porque não alcança.
 */

/** Rotas que não recebem CSP: são consumidas por máquina, não por navegador. */
const SEM_CSP = ['/api/', '/t.js'];

function nonceAleatorio(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  const nonce = nonceAleatorio();

  const cabecalhos = new Headers(request.headers);
  // O layout raiz lê isto para carimbar o nonce no script inline.
  cabecalhos.set('x-nonce', nonce);

  const resposta = NextResponse.next({ request: { headers: cabecalhos } });

  // ── Cabeçalhos que não têm efeito colateral e valem para tudo ──────────────

  // Impede que o painel seja embutido em iframe de terceiro — o caminho clássico
  // de clickjacking, em que um clique numa página do atacante vira um clique
  // aqui dentro. `DENY` e não `SAMEORIGIN`: o painel não se embute em lugar
  // nenhum, nem em si mesmo.
  resposta.headers.set('X-Frame-Options', 'DENY');
  // Um arquivo servido como texto não pode ser reinterpretado como script.
  resposta.headers.set('X-Content-Type-Options', 'nosniff');
  // O endereço completo de uma tela do painel (com ids de cliente e site) não
  // vaza para sites externos no `Referer`. Mesma origem continua recebendo.
  resposta.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Nada aqui usa câmera, microfone, geolocalização ou pagamento. Declarar isso
  // fecha a porta para um script de terceiro que entre por outro caminho.
  resposta.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  );

  if (process.env.NODE_ENV === 'production') {
    // Dois anos, com subdomínios. Só em produção: em desenvolvimento o painel
    // roda em HTTP, e o HSTS deixaria o navegador insistir em HTTPS para
    // `localhost` — o tipo de coisa que dá um dia de depuração.
    resposta.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  }

  if (SEM_CSP.some((p) => caminho.startsWith(p))) return resposta;

  const csp = [
    `default-src 'self'`,
    // `strict-dynamic` deixa um script já autorizado carregar outros, o que o
    // Next precisa para os próprios chunks. Os `http:`/`https:` no fim são
    // ignorados por navegadores que entendem `strict-dynamic` e servem de
    // reserva para os que não entendem.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: http:`,
    // Consequência da arquitetura visual, explicada acima.
    `style-src 'self' 'unsafe-inline'`,
    // `data:` cobre os ícones e imagens embutidas; `blob:` cobre o canvas.
    `img-src 'self' data: blob:`,
    // As fontes são auto-hospedadas — nenhum domínio externo.
    `font-src 'self'`,
    `connect-src 'self'`,
    // Nada de Flash, applet ou plugin.
    `object-src 'none'`,
    // Impede que um `<base>` injetado reescreva o destino de todo link relativo.
    `base-uri 'self'`,
    // Um formulário desta origem só posta para esta origem.
    `form-action 'self'`,
    // O equivalente moderno do X-Frame-Options, para quem já o ignora.
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');

  /**
   * BLOQUEIA, e só existe no pacote publicado.
   *
   * `Content-Security-Policy-Report-Only` **não bloqueia nada** — só faz o
   * navegador reclamar no console. Uma política em modo relatório chamada de
   * proteção é uma defesa afirmada e inexistente, então esta bloqueia.
   *
   * **Em desenvolvimento não há política alguma**, e isso é decisão, não
   * esquecimento. O `next dev` compila com `eval` — é assim que o recarregamento
   * a quente funciona — então uma política sem `'unsafe-eval'` ou quebra o
   * servidor de desenvolvimento, ou (em modo relatório) despeja milhares de
   * recusas no console. Medido: **4.536 violações** no `next dev` contra
   * **nenhuma recusa** no `next start`, e todas as 4.536 eram `eval`. Um console
   * com quatro mil linhas de ruído não avisa ninguém de nada — some com o erro
   * real e, pior, convence quem mede ali que a política precisa afrouxar. Quem
   * verifica a política é o CI, que roda a suíte contra `next start`.
   *
   * `CSP_RELATORIO=1` rebaixa a produção a modo relatório sem mexer em código —
   * a saída de emergência para o dia em que uma tela nova violar a política e
   * não der para corrigi-la na hora. A saída existe; o padrão é bloquear.
   */
  if (process.env.NODE_ENV !== 'production') return resposta;

  const relatar = process.env.CSP_RELATORIO === '1';
  resposta.headers.set(
    relatar ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    csp,
  );

  return resposta;
}

export const config = {
  // Exclui os arquivos estáticos do Next: eles não precisam de nonce, e passar
  // por middleware a cada um deles custaria latência sem ganho.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
