import type { MetadataRoute } from 'next';

/**
 * Painel administrativo: nada aqui é feito para busca.
 *
 * `robots.txt` **não é mecanismo de segurança** — quem ignora o arquivo entra
 * igual. A proteção real é a autenticação, e ela já existe: toda rota de
 * `(painel)` exige sessão. Este arquivo apenas declara a intenção a rastreador
 * que a respeita, e evita o 404 que aparecia no lugar.
 *
 * Detalhe que costuma passar batido: bloquear o rastreamento de uma página e
 * ao mesmo tempo esperar que o buscador leia o `noindex` dela é contraditório —
 * ele precisa buscar a página para ver a meta tag. Por isso `/entrar` e
 * `/teste/` NÃO são bloqueados aqui; eles carregam `noindex` no próprio HTML,
 * que é o mecanismo correto para tirar da indexação.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // As telas autenticadas não devem sequer ser tentadas.
        disallow: ['/visao-geral', '/clientes', '/sites', '/leads', '/configuracoes', '/api/'],
      },
    ],
  };
}
