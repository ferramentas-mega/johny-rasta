import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['pg'],
  /**
   * Nada de `X-Powered-By: Next.js`.
   *
   * Não fecha porta nenhuma — quem quiser descobrir o framework descobre pelo
   * formato das rotas em dois minutos. O que ele faz é entregar de graça, em
   * toda resposta, a informação que orienta a primeira tentativa de quem varre
   * a internet procurando versão vulnerável. Custa uma linha não entregar.
   */
  poweredByHeader: false,
  async headers() {
    return [
      {
        // O coletor é servido para domínios de terceiros (os sites dos clientes).
        source: '/t.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=300, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};

export default config;
