'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withoutAccount } from '@/server/db';
import { verifyPassword } from '@/server/auth/password';
import { createSession } from '@/server/auth/session';

const Credenciais = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export type EstadoLogin = { erro?: string };

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const analise = Credenciais.safeParse({
    email: dados.get('email'),
    senha: dados.get('senha'),
  });
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  let usuario: { user_id: string; password_hash: string } | null;
  try {
    usuario = await withoutAccount((db) =>
      db.one<{ user_id: string; password_hash: string }>(
        'select user_id, password_hash from app.find_user_for_login($1)',
        [analise.data.email],
      ),
    );
  } catch (erro) {
    console.error('[entrar] falha ao consultar o usuário:', erro);

    // Quando a causa é configuração ausente, dizer QUAL falta poupa uma
    // investigação inteira. Nomes de variáveis não são segredo — estão no
    // .env.example do projeto. O valor delas, esse nunca sai daqui.
    const faltando = ['DATABASE_URL', 'SESSION_SECRET'].filter((v) => !process.env[v]);
    if (faltando.length > 0) {
      return {
        erro: `Faltam variáveis de ambiente no servidor: ${faltando.join(' e ')}. Defina no painel da hospedagem e publique de novo.`,
      };
    }

    return {
      erro: 'O banco de dados recusou a conexão. Abra /api/diagnostico para ver a causa.',
    };
  }

  // Mesma mensagem para e-mail inexistente e senha errada: responder de forma
  // diferente revelaria quais endereços existem na base.
  const ok = usuario ? await verifyPassword(analise.data.senha, usuario.password_hash) : false;
  if (!usuario || !ok) {
    return { erro: 'E-mail ou senha incorretos.' };
  }

  await createSession(usuario.user_id);
  redirect('/visao-geral');
}
