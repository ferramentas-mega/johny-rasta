import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

/**
 * O commit do build, lido do git NA HORA DO BUILD e embutido como variável.
 *
 * Existe para as hospedagens que não informam o commit por variável (a Vercel
 * informa; Hostinger, VPS e Docker não). É o que deixa `/api/diagnostico` dizer
 * qual código está no ar, e o `pos-deploy.yml` conferir. Sem git no ambiente
 * de build, fica vazio — nunca inventa um valor.
 */
function commitDoGit(): string {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

const config: NextConfig = {
  serverExternalPackages: ['pg'],
  env: {
    BUILD_COMMIT: process.env.BUILD_COMMIT ?? commitDoGit(),
  },
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
