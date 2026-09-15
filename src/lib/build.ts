/**
 * Identificação do build que está sendo servido.
 *
 * Existe por um motivo específico: uma rota nova não diagnostica um build
 * velho. Quando a produção ficou presa num deployment antigo, `/api/diagnostico`
 * respondeu 404 — e um 404 não diz "o build é antigo", diz apenas "não existe".
 * Foram dias interpretando isso como variável de ambiente faltando.
 *
 * O carimbo mora na tela de login, que existe desde o primeiro deploy. Assim a
 * resposta aparece dos dois jeitos: o commit está lá, ou a ausência dele já
 * prova que o build é anterior a esta mudança.
 *
 * O SHA do commit não é segredo: o repositório e o `homepage` do projeto são
 * públicos, e o hash sozinho não dá acesso a nada.
 */

export type Build = {
  /** Os 7 primeiros dígitos do commit, como o git mostra. `null` fora da Vercel. */
  commit: string | null;
  /** `production`, `preview`, `development`, ou `local` fora da Vercel. */
  ambiente: string;
};

export function buildAtual(): Build {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    commit: sha ? sha.slice(0, 7) : null,
    ambiente: process.env.VERCEL_ENV ?? (process.env.VERCEL ? 'desconhecido' : 'local'),
  };
}

/** Uma linha curta para mostrar na interface. */
export function descricaoDoBuild(build: Build = buildAtual()): string {
  return build.commit ? `${build.ambiente} · ${build.commit}` : build.ambiente;
}
