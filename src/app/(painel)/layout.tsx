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
    // No celular esta casca vira uma coluna, e o menu deixa de ser uma barra
    // lateral para virar uma faixa horizontal no topo. Ver `.casca-painel` em
    // theme.css: com `flex-wrap`, o menu ocupava a tela inteira antes do
    // conteúdo, e era preciso rolar um aside inteiro para chegar a qualquer
    // número.
    <div className="casca-painel">
      <MenuLateral
        contagens={{ clientes: clientes.length, sites: sites.length, leads }}
        contaNome={usuario.accountName}
        usuarioNome={usuario.name}
        busca=""
      />
      <main className="conteudo-painel">{children}</main>
    </div>
  );
}
