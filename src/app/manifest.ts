import type { MetadataRoute } from 'next';

/**
 * Manifesto do aplicativo.
 *
 * Existe para que o painel possa ser instalado pelo Chrome — no computador e no
 * celular — e abrir em janela própria, sem a barra de endereço comendo altura
 * numa tela pequena.
 *
 * Duas decisões que não são padrão:
 *
 * **`start_url` é `/visao-geral`, não `/`.** A raiz só redireciona; começar
 * nela custa um salto a cada abertura. Quem não tem sessão cai no login pelo
 * caminho normal.
 *
 * **Não há service worker, e não deve haver um que guarde dados.** Um painel
 * que serve número em cache é um painel que mente sobre quando aquele número
 * foi medido — e este projeto inteiro é construído sobre não fazer isso. Se o
 * Chrome exigir um service worker para oferecer a instalação, o certo é um que
 * só repasse a requisição, nunca um que responda do cache.
 *
 * Nota de honestidade: não consegui conferir os critérios atuais de
 * instalabilidade do Chrome a partir deste ambiente (o proxy bloqueia
 * developer.chrome.com e o MDN). O que está aqui são os campos que o manifesto
 * precisa ter de qualquer forma; se o convite de instalação não aparecer, o
 * próximo passo é o service worker de repasse descrito acima.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Painel de Sites',
    short_name: 'Painel',
    description: 'Análise de desempenho de sites e landing pages de clientes',
    start_url: '/visao-geral',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#000000',
    // O mesmo `--side` do menu: a barra do sistema combina com a interface em
    // vez de recortar um retângulo branco no topo.
    theme_color: '#060b07',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O Android recorta o ícone em formas diferentes conforme o fabricante.
      // A versão `maskable` tem o glifo na zona segura e o fundo sangrando até
      // a borda — sem ela, o recorte come parte do desenho.
      { src: '/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Visão geral', url: '/visao-geral' },
      { name: 'Sites', url: '/sites' },
      { name: 'Leads', url: '/leads' },
    ],
  };
}
