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

/**
 * Tamanho mínimo do segredo de sessão.
 *
 * HS256 assina com HMAC-SHA256: um segredo curto é quebrável por força bruta
 * offline, e quem o quebrar **fabrica sessões de qualquer usuário** sem precisar
 * de senha nenhuma. Não é um risco teórico — listas de segredos comuns
 * ("secret", "changeme", o nome do projeto) são a primeira coisa que se tenta.
 *
 * 32 caracteres é o piso, e o `.env.example` manda gerar com
 * `openssl rand -base64 32`. Aceitar qualquer tamanho deixava o sistema inteiro
 * valer o que vale a string mais preguiçosa que alguém colar em produção.
 */
const TAMANHO_MINIMO_DO_SEGREDO = 32;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error('SESSION_SECRET não definido. Veja .env.example.');
  if (value.length < TAMANHO_MINIMO_DO_SEGREDO) {
    // A mensagem diz o tamanho exigido e NUNCA o valor recebido: um erro que
    // imprime o segredo o escreve no log de quem estiver lendo.
    throw new Error(
      `SESSION_SECRET curto demais: precisa de ao menos ${TAMANHO_MINIMO_DO_SEGREDO} caracteres. ` +
        'Gere com: openssl rand -base64 32',
    );
  }
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
