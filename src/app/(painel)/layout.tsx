import { exigirSessao } from '@/server/contexto';
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

  // Uma transação só, em vez de três simultâneas. Cada `withAccount` toma uma
  // conexão do pool, e em serverless o pool é pequeno de propósito: três
  // chamadas concorrentes ficariam disputando conexão e tempo limite entre si.
  const { clientes, sites, leads } = await withAccount(usuario.accountId, async (db) => ({
    clientes: await db.query<{ id: string }>(
      'select id from clients where archived_at is null',
    ),
    sites: await db.query<{ id: string }>(
      'select id from sites where archived_at is null',
    ),
    leads: (await db.one<{ total: number }>('select count(*)::int as total from leads'))?.total ?? 0,
  }));

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
