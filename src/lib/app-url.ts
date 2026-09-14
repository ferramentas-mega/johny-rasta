/**
 * URL pública da aplicação.
 *
 * Importa mais do que parece: é o endereço que aparece no snippet de instalação
 * que o cliente vai colar no site dele. Se sair errado, o site do cliente
 * aponta para lugar nenhum e nada é coletado.
 *
 * A ordem de preferência resolve o caso comum de esquecer a variável no primeiro
 * deploy — em vez de cair para `localhost`, usa o domínio que a hospedagem
 * informa.
 */
export function appUrl(): string {
  // Definida à mão: sempre ganha. É o domínio próprio, quando existe — desde
  // que seja absoluta. "painel.megaads.com.br" sem esquema viraria um caminho
  // relativo dentro do site do cliente, e nada seria coletado; pior, o erro só
  // apareceria no site de terceiro, não aqui.
  const definida = process.env.APP_URL?.trim();
  if (definida) {
    if (/^https?:\/\//i.test(definida)) return semBarraFinal(definida);
    console.warn(
      `[app-url] APP_URL="${definida}" não começa com http:// ou https:// e foi ignorada. ` +
        'Defina a URL completa, incluindo o esquema.',
    );
  }

  // Domínio estável de produção na Vercel (não muda a cada deploy).
  const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (producao) return `https://${semBarraFinal(producao)}`;

  // URL do deploy atual: serve para pré-visualizações.
  const deploy = process.env.VERCEL_URL;
  if (deploy) return `https://${semBarraFinal(deploy)}`;

  return 'http://localhost:3000';
}

/** Host da aplicação, para comparar com a origem de uma requisição. */
export function appHost(): string {
  try {
    return new URL(appUrl()).hostname;
  } catch {
    return 'localhost';
  }
}

function semBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, '');
}
