import { exigirSessao } from '@/server/contexto';
import { listarClientes, listarSites } from '@/server/services/sites';
import { withAccount } from '@/server/db';
import { MenuLateral } from '@/components/MenuLateral';

/**
 * Casca autenticada.
 *
 * O layout só monta o menu; cada página resolve seu próprio contexto de site e
 * período a partir da URL. Assim não existe estado compartilhado que possa
 * ficar fora de sincronia com a rota — a causa do menu "Leads" aceso sobre a
 * tela de Desempenho no protótipo.
 */
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const usuario = await exigirSessao();

  const [clientes, sites, leads] = await Promise.all([
    listarClientes(usuario.accountId),
    listarSites(usuario.accountId),
    withAccount(usuario.accountId, async (db) => {
      const linha = await db.one<{ total: number }>('select count(*)::int as total from leads');
      return linha?.total ?? 0;
    }),
  ]);

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', minHeight: '100vh' }}>
      <MenuLateral
        contagens={{ clientes: clientes.length, sites: sites.length, leads }}
        contaNome={usuario.accountName}
        usuarioNome={usuario.name}
        busca=""
      />
      <main style={{ flex: '999 1 640px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
}
