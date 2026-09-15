'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { withoutAccount } from '@/server/db';
import { verifyPassword } from '@/server/auth/password';
import { createSession } from '@/server/auth/session';
import { LIMITES, consumirLimite, talvezLimpar, zerarLimite } from '@/server/limites';

const Credenciais = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});

export type EstadoLogin = { erro?: string };

/**
 * Hash descartável, usado só quando o e-mail não existe.
 *
 * Sem ele, "e-mail não cadastrado" responde na hora e "senha errada" demora o
 * scrypt inteiro (~100 ms). Essa diferença é medível de fora e vira um
 * enumerador de e-mails — a mensagem seria igual, e o relógio entregaria a
 * resposta. Verificar contra este hash faz os dois caminhos custarem o mesmo.
 *
 * O valor NÃO é uma senha de ninguém: é o hash de uma string aleatória gerada
 * uma vez, e nenhuma senha real produz este resultado.
 */
const HASH_DE_COMPARACAO =
  'scrypt$Y2FycmVnYWRvcmRldGVtcG8x$' +
  'KG2Sc0vJ7cIVSBWqgFHGkC1V4rF5o0oyO7GXTQMPOvHNoWvDZ8xKO1l3pQvHqbDkPLq0R0DjdNpjO3nkvKwJHw==';

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const analise = Credenciais.safeParse({
    email: dados.get('email'),
    senha: dados.get('senha'),
  });
  if (!analise.success) {
    return { erro: analise.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const email = analise.data.email.toLowerCase();

  let usuario: { user_id: string; password_hash: string } | null;
  let excedido = false;
  try {
    const resultado = await withoutAccount(async (db) => {
      // Cobrado ANTES de consultar o usuário: contar só as tentativas que
      // chegam a comparar senha deixaria a varredura de e-mails livre.
      //
      // A chave é o e-mail normalizado, e não o IP. Limitar por IP puniria uma
      // empresa inteira atrás do mesmo NAT, e não atrapalharia quem distribui a
      // varredura por vários endereços — que é como ela é feita.
      const limite = await consumirLimite(db, `login:${email}`, LIMITES.login);
      if (!limite.permitido) return { excedido: true as const, esperar: limite.esperarSegundos };

      await talvezLimpar(db);
      const linha = await db.one<{ user_id: string; password_hash: string }>(
        'select user_id, password_hash from app.find_user_for_login($1)',
        [analise.data.email],
      );
      return { excedido: false as const, linha };
    });

    if (resultado.excedido) {
      excedido = true;
      usuario = null;
    } else {
      usuario = resultado.linha;
    }
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

  if (excedido) {
    // Mensagem própria, e de propósito: dizer "e-mail ou senha incorretos" aqui
    // faria o usuário legítimo trocar a senha achando que errou, quando o que
    // houve foi excesso de tentativas. E a mensagem não revela se o e-mail
    // existe — ela é a mesma para qualquer endereço.
    return {
      erro: 'Muitas tentativas para este e-mail. Aguarde alguns minutos e tente de novo.',
    };
  }

  // Mesma mensagem para e-mail inexistente e senha errada: responder de forma
  // diferente revelaria quais endereços existem na base.
  //
  // O tempo de resposta também não pode denunciar: sem usuário, ainda assim
  // gastamos o custo de uma verificação de senha contra um hash descartável.
  // Sem isso, "e-mail não existe" volta na hora e "senha errada" demora o
  // scrypt inteiro — e a diferença é medível.
  const ok = usuario
    ? await verifyPassword(analise.data.senha, usuario.password_hash)
    : await verifyPassword(analise.data.senha, HASH_DE_COMPARACAO);
  if (!usuario || !ok) {
    return { erro: 'E-mail ou senha incorretos.' };
  }

  // Acertou: o contador volta a zero.
  //
  // O limite é cobrado em TODA tentativa, inclusive esta. Sem zerar, quem entra
  // onze vezes em cinco minutos — várias abas, dois aparelhos, uma suíte de
  // testes — leva a mesma trava da varredura de dicionário. Foi assim que o
  // defeito apareceu: a partir do décimo login da execução, a suíte de navegador
  // travava esperando a navegação que o limitador tinha impedido.
  //
  // Quem acerta a senha não é a ameaça que o limite existe para conter. Força
  // bruta não acerta, então o contador dela nunca chega aqui.
  await withoutAccount((db) => zerarLimite(db, `login:${email}`));

  await createSession(usuario.user_id);
  redirect('/visao-geral');
}
