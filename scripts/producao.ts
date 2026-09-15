/**
 * `npm run producao` — o que está no ar, agora.
 *
 * Consulta o `/api/diagnostico` do endereço publicado e imprime o commit, o
 * ambiente e o estado das conexões. Existe para substituir a peregrinação por
 * quatro abas do painel da hospedagem só para responder "o build que eu acabei
 * de enviar está servindo, ou o domínio ficou para trás?".
 *
 * Uso:
 *   npm run producao                          usa APP_URL, ou o padrão abaixo
 *   npm run producao https://outro.dominio    verifica outro endereço
 */

const PADRAO = 'https://johny-rasta.vercel.app';

type Problema = { variavel: string; essencial: boolean; causa: string; oQueFazer: string };
type Resposta = {
  tudoOk?: boolean;
  commit?: string | null;
  ambiente?: string;
  painelFunciona?: boolean;
  coletaFunciona?: boolean;
  faltaSessionSecret?: boolean;
  problemas?: Problema[];
};

function sim(v: boolean | undefined): string {
  return v ? 'sim' : 'NÃO';
}

async function main() {
  const base = (process.argv[2] ?? process.env.APP_URL ?? PADRAO).replace(/\/+$/, '');
  const alvo = `${base}/api/diagnostico`;
  console.log(`Consultando ${alvo}\n`);

  let resposta: Response;
  try {
    resposta = await fetch(alvo, { headers: { accept: 'application/json' } });
  } catch (erro) {
    console.error(`Não foi possível alcançar ${base}.`);
    console.error(erro instanceof Error ? `  ${erro.message}` : String(erro));
    process.exit(1);
  }

  if (resposta.status === 404) {
    console.error('404 — o build no ar NÃO tem a rota /api/diagnostico.');
    console.error('');
    console.error('Isso não é falta de variável de ambiente: é um build antigo.');
    console.error('Na Vercel: Deployments › no mais recente, ⋯ › Promote to Production.');
    console.error('(Redeploy não serve: ela só reconstrói o deployment mais recente.)');
    process.exit(1);
  }

  let corpo: Resposta;
  try {
    corpo = (await resposta.json()) as Resposta;
  } catch {
    console.error(`Resposta não é JSON (HTTP ${resposta.status}). O endereço é mesmo o do painel?`);
    process.exit(1);
  }

  console.log(`  commit no ar   ${corpo.commit ?? '— (build sem informação de commit)'}`);
  console.log(`  ambiente       ${corpo.ambiente ?? '—'}`);
  console.log(`  painel entra   ${sim(corpo.painelFunciona)}`);
  console.log(`  coleta ativa   ${sim(corpo.coletaFunciona)}`);

  for (const p of corpo.problemas ?? []) {
    console.log('');
    console.log(`  ${p.essencial ? '✗' : '·'} ${p.variavel} — ${p.causa}`);
    console.log(`    ${p.oQueFazer}`);
  }

  if (corpo.faltaSessionSecret) {
    console.log('');
    console.log('  ✗ SESSION_SECRET não está definida. Sem ela ninguém entra.');
  }

  console.log('');
  if (corpo.painelFunciona) {
    console.log(`Painel no ar: ${base}/entrar`);
    process.exit(0);
  }
  console.log('O painel NÃO entra com a configuração atual.');
  process.exit(1);
}

main();
