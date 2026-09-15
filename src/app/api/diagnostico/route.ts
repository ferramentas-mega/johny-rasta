import { NextResponse } from 'next/server';
import { verificarConexao, type CausaDeFalha } from '@/server/db';
import { getSessionUser } from '@/server/auth/session';
import { buildAtual } from '@/lib/build';
import { verificarEsquema, comoResolverEsquema } from '@/server/esquema';

/**
 * Diagnóstico da conexão com o banco, para quando a aplicação já está publicada
 * e o log da hospedagem não está à mão.
 *
 * O endereço é público por necessidade: quando o banco não conecta, ninguém
 * consegue entrar para ver um diagnóstico protegido por login. Então a resposta
 * pública é deliberadamente pobre — só o que a própria tela de login já revela
 * ("não foi possível falar com o banco"), organizado de forma acionável:
 *
 *   - se cada uma das três variáveis esperadas existe e conecta;
 *   - a categoria do problema e o que fazer a respeito.
 *
 * NÃO sai daqui, sem autorização: host, usuário, senha, o nome do papel do
 * Postgres, contagem de tabelas, URL do deploy, nem a lista de variáveis de
 * ambiente existentes (que revelaria integrações não relacionadas).
 *
 * Esse detalhe extra aparece para quem está autenticado, ou para quem apresenta
 * `?token=` igual a `DIAGNOSTIC_TOKEN`. A verificação usa os MESMOS pools e a
 * MESMA configuração de TLS da aplicação: um diagnóstico que testa outra coisa
 * mente justamente quando mais importa.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Nem toda variável tem o mesmo peso.
 *
 * Sem `DATABASE_URL` ninguém entra — é a credencial de leitura do painel.
 * As outras duas servem só aos endpoints públicos de coleta e de formulários:
 * faltando, aqueles dois endpoints param, e o painel segue funcionando.
 *
 * A distinção importa para quem está configurando: são duas variáveis para
 * entrar, não quatro.
 */
const ESSENCIAIS = ['DATABASE_URL'] as const;
const OPCIONAIS = ['DATABASE_URL_INGEST', 'DATABASE_URL_FORMS'] as const;
const VARIAVEIS = [...ESSENCIAIS, ...OPCIONAIS] as const;

const COMO_RESOLVER: Record<CausaDeFalha, string> = {
  ok: 'Conexão estabelecida.',
  variavel_ausente:
    'A variável não existe no ambiente. Defina-a nas configurações da hospedagem e publique de novo — variáveis só valem a partir do próximo build.',
  host_nao_resolve:
    'O endereço do banco não resolve. Confira a digitação do host — e, se for Supabase, use o host do pooler (Connect › Transaction pooler), não o da conexão direta.',
  host_direto_do_supabase:
    'Esta é a connection string DIRETA do Supabase (db.<projeto>.supabase.co), que só existe em IPv6 — a Vercel não alcança. Troque pelo host do pooler em Connect › Transaction pooler (aws-…pooler.supabase.com, porta 6543) e acrescente o sufixo do projeto ao papel: app_user.SEU_PROJECT_REF',
  sem_resposta:
    'O host não respondeu. A causa mais comum é usar a conexão direta, que em muitos provedores só atende em IPv6. Use o host do pooler (transaction mode, porta 6543).',
  senha_incorreta:
    'Usuário ou senha não conferem. Num pooler gerenciado o usuário precisa do sufixo do projeto: app_user.SEU_PROJECT_REF, e não apenas app_user.',
  usuario_sem_sufixo_do_projeto:
    'O pooler não reconheceu a combinação de host e usuário. O papel precisa do sufixo do projeto (app_user.SEU_PROJECT_REF) e o host precisa ser o do SEU projeto — copie-o em Connect › Transaction pooler, não monte a partir da região. Este erro NÃO é senha errada.',
  papel_expirado:
    "O papel tem prazo de validade vencido. Rode no SQL do provedor: alter role app_user valid until 'infinity';",
  tls_recusado:
    'O servidor recusou a negociação de TLS. Se DATABASE_SSL_CA estiver definida, confira se o certificado é o do provedor.',
  banco_inexistente: 'O banco indicado no fim da URL não existe. No Supabase o nome é postgres.',
  desconhecida: 'Causa não reconhecida. Consulte o log do servidor para a mensagem completa.',
};

/** Comparação em tempo constante, para o token não vazar por tempo de resposta. */
function tokenConfere(recebido: string | null): boolean {
  const esperado = process.env.DIAGNOSTIC_TOKEN;
  if (!esperado || !recebido) return false;
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  }
  return diferenca === 0;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  // Quem já está autenticado tem acesso legítimo ao detalhe; quem não está
  // precisa do token. Sem nenhum dos dois, a resposta é a versão pobre.
  const autorizado = tokenConfere(token) || (await getSessionUser().catch(() => null)) !== null;

  const conexoes = [];
  for (const v of VARIAVEIS) conexoes.push(await verificarConexao(v, autorizado));

  const conectaTudo = conexoes.every((c) => c.conecta);

  /**
   * O ESQUEMA, e não só a conexão.
   *
   * Este endpoint já respondeu `tudoOk: true` durante um incidente em que TODAS
   * as rotas devolviam 500, inclusive a coleta — o código tinha subido antes da
   * migração. A conexão abria; a tabela é que não existia. Um diagnóstico que
   * declara saúde sem olhar o que o código usa desvia a investigação para os
   * lugares errados, e nesse caso custou a janela inteira de eventos.
   */
  const esquema = await verificarEsquema();
  const esquemaCompleto = esquema.verificado && esquema.completo;

  // `tudoOk` só é verdadeiro quando as duas coisas foram CONFERIDAS e estão bem.
  // Esquema não verificado não vira "ok" por omissão.
  const tudoOk = conectaTudo && esquemaCompleto;

  const painelFunciona =
    conexoes.filter((c) => (ESSENCIAIS as readonly string[]).includes(c.variavel)).every((c) => c.conecta) &&
    !!process.env.SESSION_SECRET &&
    esquemaCompleto;

  const build = buildAtual();

  const publico = {
    tudoOk,
    /**
     * Os nomes dos objetos que faltam são públicos: estão nos arquivos de
     * migração de um repositório público. O que eles revelam é que o deploy
     * passou na frente do banco — a informação de que quem está depurando
     * precisa, e a única que resolve o problema.
     */
    esquema: esquema.verificado
      ? {
          verificado: true,
          completo: esquema.completo,
          faltando: esquema.faltando,
          oQueFazer: esquema.completo ? undefined : comoResolverEsquema(esquema.faltando),
        }
      : { verificado: false, motivo: esquema.motivo },
    // O commit é público (o repositório é público) e é o que permite conferir,
    // de fora, se o domínio está servindo o build que acabou de subir. Sem ele,
    // um deployment que ficou para trás é indistinguível de um atualizado.
    commit: build.commit,
    // Muda a cada build. Duas publicações do mesmo commit — uma antes e outra
    // depois de salvar uma variável — têm o mesmo commit e comportamentos
    // diferentes; só este campo as separa.
    deployment: build.deployment,
    ambiente: build.ambiente,
    // O que realmente responde "consigo entrar?".
    painelFunciona,
    coletaFunciona: conexoes
      .filter((c) => (OPCIONAIS as readonly string[]).includes(c.variavel))
      .every((c) => c.conecta),
    // Os nomes das três variáveis esperadas estão no .env.example do projeto:
    // dizer qual delas falta não revela nada que já não esteja documentado.
    problemas: conexoes
      .filter((c) => !c.conecta)
      .map((c) => ({
        variavel: c.variavel,
        essencial: (ESSENCIAIS as readonly string[]).includes(c.variavel),
        causa: c.causa,
        oQueFazer: COMO_RESOLVER[c.causa],
      })),
    faltaSessionSecret: !process.env.SESSION_SECRET,
    observacao: autorizado
      ? undefined
      : 'Resposta reduzida. Para o detalhe, entre no painel ou informe ?token= com o valor de DIAGNOSTIC_TOKEN.',
  };

  if (!autorizado) {
    return NextResponse.json(publico, { status: tudoOk ? 200 : 503 });
  }

  return NextResponse.json(
    {
      ...publico,
      sessaoConfigurada: !!process.env.SESSION_SECRET,
      // Só os NOMES, e só para quem está autorizado: revela nome digitado
      // errado, que produz exatamente o mesmo "ausente" de quem não criou nada.
      variaveisEncontradas: Object.keys(process.env)
        .filter((k) => /^(DATABASE|SESSION|APP_URL|DIAGNOSTIC)/i.test(k))
        .sort(),
      conexoes,
    },
    { status: tudoOk ? 200 : 503 },
  );
}
