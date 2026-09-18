import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/server/auth/session';
import { withAccount } from '@/server/db';
import {
  chavePublicaVapid,
  pushConfigurado,
  salvarInscricao,
  removerInscricao,
  listarDispositivos,
} from '@/server/services/push';

export const dynamic = 'force-dynamic';

const Inscricao = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(10).max(512), auth: z.string().min(10).max(512) }),
});

/** Chave pública e os dispositivos DESTE usuário. Sem sessão, 401. */
export async function GET() {
  const usuario = await getSessionUser();
  if (!usuario) return NextResponse.json({ erro: 'Sessão necessária.' }, { status: 401 });
  const dispositivos = await withAccount(usuario.accountId, (db) => listarDispositivos(db, usuario.userId));
  return NextResponse.json({
    disponivel: pushConfigurado(),
    chavePublica: chavePublicaVapid(),
    // O endpoint identifica o dispositivo para o próprio navegador saber se
    // "este aqui" já está inscrito; não é segredo — é a URL de entrega.
    dispositivos: dispositivos.map((d) => ({ id: d.id, userAgent: d.userAgent, criadaEm: d.criadaEm, ultimoOk: d.ultimoOk, endpoint: d.endpoint })),
  });
}

/** Grava a inscrição do navegador para o usuário da sessão. */
export async function POST(request: Request) {
  const usuario = await getSessionUser();
  if (!usuario) return NextResponse.json({ erro: 'Sessão necessária.' }, { status: 401 });
  if (!pushConfigurado()) return NextResponse.json({ erro: 'Push não configurado neste servidor.' }, { status: 503 });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }
  const analise = Inscricao.safeParse(corpo);
  if (!analise.success) return NextResponse.json({ erro: 'Inscrição inválida.' }, { status: 400 });

  await withAccount(usuario.accountId, (db) =>
    salvarInscricao(db, usuario.userId, analise.data, request.headers.get('user-agent')?.slice(0, 300) ?? null),
  );
  return NextResponse.json({ ok: true });
}

/** Remove a inscrição deste navegador — só se for do usuário da sessão. */
export async function DELETE(request: Request) {
  const usuario = await getSessionUser();
  if (!usuario) return NextResponse.json({ erro: 'Sessão necessária.' }, { status: 401 });
  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 });
  }
  const analise = z.object({ endpoint: z.string().url().max(2048) }).safeParse(corpo);
  if (!analise.success) return NextResponse.json({ erro: 'Inscrição inválida.' }, { status: 400 });
  const removida = await withAccount(usuario.accountId, (db) => removerInscricao(db, usuario.userId, analise.data.endpoint));
  return NextResponse.json({ ok: removida });
}
