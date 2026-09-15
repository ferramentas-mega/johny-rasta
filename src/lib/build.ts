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
 * **Commit não basta.** Variável de ambiente é injetada no momento do build, e
 * salvar uma variável não reconstrói nada. Dois builds do MESMO commit — um
 * anterior e outro posterior à gravação — se comportam de formas diferentes e
 * carimbam o mesmo SHA. Foi exatamente o que aconteceu: as três variáveis já
 * estavam salvas, o carimbo dizia o commit certo, e o diagnóstico continuava
 * reportando-as como ausentes. Por isso o identificador do deployment entra
 * junto: ele é o que muda a cada build.
 *
 * Nem o SHA nem o id do deployment são segredo: o repositório é público, e
 * nenhum dos dois dá acesso a coisa alguma.
 */

export type Build = {
  /** Os 7 primeiros dígitos do commit, como o git mostra. `null` fora da Vercel. */
  commit: string | null;
  /** Identificador do deployment. Muda a cada build, mesmo no mesmo commit. */
  deployment: string | null;
  /** `production`, `preview`, `development`, ou `local` fora da Vercel. */
  ambiente: string;
};

/** O prefixo `dpl_` é ruído: todo deployment da Vercel tem. */
function encurtarDeployment(id: string | undefined): string | null {
  if (!id) return null;
  const sem = id.replace(/^dpl_/, '');
  return sem.slice(0, 8);
}

export function buildAtual(): Build {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return {
    commit: sha ? sha.slice(0, 7) : null,
    deployment: encurtarDeployment(process.env.VERCEL_DEPLOYMENT_ID),
    ambiente: process.env.VERCEL_ENV ?? (process.env.VERCEL ? 'desconhecido' : 'local'),
  };
}

/**
 * Uma linha curta para mostrar na interface.
 *
 * O deployment aparece depois do commit porque a pergunta usual é "que código
 * está no ar?", e só quando a resposta não explica o comportamento é que a
 * segunda parte importa — aí ela já está ali.
 */
export function descricaoDoBuild(build: Build = buildAtual()): string {
  const partes = [build.ambiente];
  if (build.commit) partes.push(build.commit);
  if (build.deployment) partes.push(build.deployment);
  return partes.join(' · ');
}
