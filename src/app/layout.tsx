import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Analytics } from '@vercel/analytics/next';
import { inter, jetbrainsMono } from '@/fonts';
import '@/styles/theme.css';

export const metadata: Metadata = {
  title: 'Painel de Sites',
  description: 'Análise de desempenho de sites e landing pages',
  // O manifesto é gerado por `src/app/manifest.ts`. Sem este apontamento o
  // Chrome não o procura, e a instalação não é oferecida.
  manifest: '/manifest.webmanifest',
  applicationName: 'Painel de Sites',
  appleWebApp: {
    capable: true,
    title: 'Painel',
    // O iOS não lê o `theme_color` do manifesto; a barra dele vem daqui.
    statusBarStyle: 'black-translucent',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
  // Painel interno: nenhuma página deste aplicativo é feita para busca, nem as
  // públicas. O `noindex` vale para as que um rastreador consegue alcançar —
  // login e página de teste de instalação. As demais estão atrás de sessão, e é
  // a autenticação que as protege; meta tag não protege nada, só desindexa.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Aplica tema, efeitos e estado da barra lateral ANTES da primeira pintura.
 *
 * Sem isto a página nasce escura e pisca para o claro (ou o contrário) quando o
 * React hidrata. O script é minúsculo e roda síncrono de propósito.
 */
const PREFERENCIAS = `
(function () {
  try {
    var tema = localStorage.getItem('painel:tema');
    var fx = localStorage.getItem('painel:fx');
    var menu = localStorage.getItem('painel:menu');
    var reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.tema = tema === 'claro' ? 'claro' : 'escuro';
    // Quem pede movimento reduzido no sistema começa sem efeitos, a menos que
    // tenha ligado explicitamente antes.
    document.documentElement.dataset.fx = (fx === null ? !reduz : fx === 'on') ? 'on' : 'off';
    // Barra lateral recolhida. Entra aqui pelo mesmo motivo do tema: sem isto
    // ela nasce expandida e encolhe na cara de quem já a tinha recolhido.
    document.documentElement.dataset.menu = menu === 'recolhido' ? 'recolhido' : 'aberto';
  } catch (e) {
    document.documentElement.dataset.tema = 'escuro';
    document.documentElement.dataset.fx = 'off';
    document.documentElement.dataset.menu = 'aberto';
  }
})();
`;

/**
 * `viewport` separado do `metadata` porque o Next exige isso desde a 14.
 *
 * `viewportFit: 'cover'` deixa a interface ir até as bordas em telas com
 * recorte; o respiro volta pelas variáveis `env(safe-area-inset-*)` no CSS.
 * `maximumScale` NÃO é limitado: impedir o zoom é tirar do usuário a única
 * saída quando a fonte está pequena demais para ele.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#060b07' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /**
   * O nonce da CSP, gerado pelo middleware a cada requisição.
   *
   * Sem ele no script de preferências, uma CSP com `script-src` estrito
   * bloquearia justamente o script que evita a página piscar entre temas. O
   * Next aplica o mesmo nonce aos scripts que ele próprio injeta.
   */
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    // O script inline ajusta tema e efeitos antes da hidratação, então os
    // atributos do servidor e do cliente divergem por construção.
    <html
      lang="pt-BR"
      data-tema="escuro"
      data-fx="off"
      data-menu="aberto"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: PREFERENCIAS }} />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
