import { NextResponse } from 'next/server';
import { destroySession } from '@/server/auth/session';

/**
 * Encerra a sessão.
 *
 * Exige que a requisição venha DESTA origem. Sem isso, qualquer página da
 * internet podia submeter um formulário para cá e derrubar a sessão de quem
 * estivesse logado — o cookie viaja sozinho num POST de formulário entre sites,
 * que é o mecanismo do CSRF.
 *
 * O dano é pequeno (o usuário entra de novo), e é justamente por isso que esta
 * porta costuma ficar aberta. Mas "pequeno" não é "nenhum": um script que
 * desloga a cada carregamento torna o painel inutilizável enquanto a aba do
 * atacante estiver aberta, e o custo de fechar é esta função.
 *
 * `Origin` é enviado pelo navegador em todo POST, inclusive entre sites, e não é
 * forjável por JavaScript de página. `Sec-Fetch-Site` cobre o mesmo caso e é o
 * cabeçalho moderno; aceitar qualquer um dos dois evita recusar navegador
 * legítimo antigo. Requisição sem nenhum dos dois é recusada: o formulário de
 * sair do painel é uma página normal e sempre manda pelo menos um.
 */
function daPropriaOrigem(request: Request): boolean {
  const destino = request.headers.get('sec-fetch-site');
  if (destino) return destino === 'same-origin' || destino === 'same-site' || destino === 'none';

  const origem = request.headers.get('origin');
  if (!origem) return false;
  try {
    return new URL(origem).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!daPropriaOrigem(request)) {
    return NextResponse.json({ erro: 'Origem não autorizada.' }, { status: 403 });
  }
  await destroySession();
  return NextResponse.redirect(new URL('/entrar', request.url), { status: 303 });
}
