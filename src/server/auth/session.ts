import 'server-only';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { cache } from 'react';
import { withoutAccount } from '@/server/db';

const COOKIE = 'painel_sessao';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SessionUser = {
  userId: string;
  accountId: string;
  email: string;
  name: string;
  accountName: string;
  isDemo: boolean;
};

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET não definido. Veja .env.example.');
  return new TextEncoder().encode(value);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * Usuário da requisição, ou null.
 *
 * O cookie carrega só o id; conta, nome e papel vêm do banco a cada requisição.
 * Assim, revogar um acesso tem efeito imediato, sem esperar o token expirar.
 * `cache` deduplica a consulta entre os vários componentes de um mesmo render.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;

  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== 'string') return null;
    userId = payload.sub;
  } catch {
    return null; // assinatura inválida ou token expirado
  }

  return withoutAccount(async (db) =>
    db.one<SessionUser>(
      `select user_id      as "userId",
              account_id   as "accountId",
              email,
              name,
              account_name as "accountName",
              is_demo      as "isDemo"
         from app.find_user_for_session($1)`,
      [userId],
    ),
  );
});
