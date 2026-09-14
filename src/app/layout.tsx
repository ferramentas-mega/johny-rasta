import type { Metadata } from 'next';
import { inter, jetbrainsMono } from '@/fonts';
import '@/styles/theme.css';

export const metadata: Metadata = {
  title: 'Painel de Sites',
  description: 'Análise de desempenho de sites e landing pages',
};

/**
 * Aplica tema e efeitos ANTES da primeira pintura.
 *
 * Sem isto a página nasce escura e pisca para o claro (ou o contrário) quando o
 * React hidrata. O script é minúsculo e roda síncrono de propósito.
 */
const PREFERENCIAS = `
(function () {
  try {
    var tema = localStorage.getItem('painel:tema');
    var fx = localStorage.getItem('painel:fx');
    var reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.tema = tema === 'claro' ? 'claro' : 'escuro';
    // Quem pede movimento reduzido no sistema começa sem efeitos, a menos que
    // tenha ligado explicitamente antes.
    document.documentElement.dataset.fx = (fx === null ? !reduz : fx === 'on') ? 'on' : 'off';
  } catch (e) {
    document.documentElement.dataset.tema = 'escuro';
    document.documentElement.dataset.fx = 'off';
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // O script inline ajusta tema e efeitos antes da hidratação, então os
    // atributos do servidor e do cliente divergem por construção.
    <html
      lang="pt-BR"
      data-tema="escuro"
      data-fx="off"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCIAS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
