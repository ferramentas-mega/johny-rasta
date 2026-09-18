import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { withAccount } from '@/server/db';
import { appUrl } from '@/lib/app-url';
import { pluginWordpress } from '@/lib/pluginWordpress';

export const dynamic = 'force-dynamic';

/**
 * Baixa o plugin WordPress gerado para um site DA CONTA.
 *
 * Exige sessão, embora o conteúdo seja só dado público (Site ID e endpoint,
 * os mesmos do snippet): a porta de download é do painel, não do mundo, e a
 * RLS decide se o site é desta conta — id de outra conta é 404, não vazamento.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const usuario = await getSessionUser();
  if (!usuario) return NextResponse.json({ erro: 'Sessão necessária.' }, { status: 401 });

  const { publicId } = await params;
  if (!/^sit_[a-z0-9_]{4,64}$/.test(publicId)) return NextResponse.json({ erro: 'Site inválido.' }, { status: 400 });

  const site = await withAccount(usuario.accountId, (db) =>
    db.one<{ domain: string }>('select domain from sites where public_id = $1 and archived_at is null', [publicId]),
  );
  if (!site) return NextResponse.json({ erro: 'Site não encontrado nesta conta.' }, { status: 404 });

  const php = pluginWordpress({ endpoint: appUrl(), publicId, dominio: site.domain });
  return new NextResponse(php, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-php; charset=utf-8',
      'Content-Disposition': 'attachment; filename="painel-sites-rastreamento.php"',
      'Cache-Control': 'no-store',
    },
  });
}
