import Link from 'next/link';
import { getSessionUser } from '@/server/auth/session';
import { listarAvisos } from '@/server/services/avisos';
import { Icone } from '@/components/icones';

/**
 * O sino do cabeçalho: quantos avisos pedem ação, e a porta para a central.
 *
 * Fica no CABEÇALHO, e não na barra lateral, porque no celular a barra lateral
 * não existe e a navegação de rodapé já está no limite de seis destinos. O
 * cabeçalho é o único lugar presente em toda tela e em toda largura.
 *
 * Server Component de propósito: a contagem é derivada no servidor a cada
 * render, e `router.refresh()` a atualiza junto com o resto. Sem sessão, não
 * renderiza nada — não é este componente que exige login, é a página.
 */
export async function SinoAvisos() {
  const usuario = await getSessionUser();
  if (!usuario) return null;

  const avisos = await listarAvisos(usuario.accountId);
  const total = avisos.length;
  const altas = avisos.filter((a) => a.gravidade === 'alta').length;

  return (
    <Link
      href="/avisos"
      aria-label={total === 0 ? 'Avisos: nenhum' : `Avisos: ${total}${altas ? `, ${altas} de gravidade alta` : ''}`}
      title={total === 0 ? 'Nenhum aviso pendente' : `${total} aviso(s) pedem ação`}
      data-testid="sino-avisos"
      className="sino-avisos"
    >
      <Icone nome="sino" tamanho={16} />
      {total > 0 && (
        <span
          className="mono sino-avisos-contagem"
          data-gravidade={altas > 0 ? 'alta' : 'outra'}
          aria-hidden="true"
        >
          {total > 99 ? '99+' : total}
        </span>
      )}
    </Link>
  );
}
