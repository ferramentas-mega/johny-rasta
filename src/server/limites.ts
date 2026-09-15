import 'server-only';
import type { Queryable } from '@/server/db';

/**
 * Limites de requisição.
 *
 * O estado vive no banco (`rate_limits`), e não em memória do processo. Em
 * serverless, um contador num `Map` é reiniciado a cada invocação fria e não é
 * compartilhado entre instâncias — quem tenta força bruta abre requisições em
 * paralelo e cada uma cai numa instância diferente, então o contador nunca
 * chega ao limite. Um limitador que não limita é pior que nenhum: dá a
 * impressão de proteção.
 *
 * Janela fixa, não deslizante. A deslizante é mais justa na virada da janela;
 * custaria guardar cada carimbo em vez de um contador. Para o que isto protege
 * — força bruta de login e enxurrada de eventos — a fixa basta, e a diferença
 * é no máximo o dobro do limite no instante da virada.
 */

export type Limite = { maximo: number; janelaSegundos: number };

/**
 * Os limites, num lugar só, com o raciocínio de cada número.
 *
 * Nenhum deles deve atrapalhar uso legítimo — o objetivo é cortar automação
 * abusiva, não visitante movimentado.
 */
export const LIMITES = {
  /**
   * Login: 10 tentativas por 5 minutos, por e-mail.
   *
   * Um humano que errou a senha tenta três ou quatro vezes. Dez dá folga para
   * quem tem gerenciador de senhas confuso, e ainda assim inviabiliza varredura
   * de dicionário: 10 por 5 min são 2.880 por dia, contra um espaço de senhas
   * que não se percorre nisso.
   */
  login: { maximo: 10, janelaSegundos: 300 },

  /**
   * Coleta: 600 eventos por minuto, por site.
   *
   * Um site com tráfego alto gera dezenas de eventos por minuto; 600 é dez por
   * segundo, sustentado. Passar disso, num painel desta escala, é script solto
   * ou falsificação — e o identificador público está no HTML de quem instalar,
   * então falsificar é trivial para quem quiser.
   */
  coleta: { maximo: 600, janelaSegundos: 60 },

  /**
   * Formulários: 30 envios por 10 minutos, por site.
   *
   * Envio de formulário é gesto humano. Trinta em dez minutos já é muito para
   * um site só, e continua longe de bloquear uma campanha que converte bem.
   */
  formularios: { maximo: 30, janelaSegundos: 600 },
} as const satisfies Record<string, Limite>;

export type ResultadoLimite = {
  permitido: boolean;
  /** Quantas requisições já entraram nesta janela, incluindo a atual. */
  contagem: number;
  /** Segundos até a janela virar. Vai no cabeçalho `Retry-After`. */
  esperarSegundos: number;
};

/**
 * Consome uma unidade do limite e diz se a requisição pode seguir.
 *
 * O incremento e a leitura acontecem numa chamada só, do lado do banco: entre
 * um `select` e um `update` cabe outra requisição, e é exatamente nessa fresta
 * que um ataque paralelo passa.
 *
 * **Falha ABERTA de propósito.** Se o banco não responder, a requisição segue.
 * O limitador protege contra abuso; derrubar o login de todo mundo porque a
 * tabela de contadores está indisponível troca um problema pequeno por um
 * grande. O erro é registrado para que a indisponibilidade não passe calada.
 */
export async function consumirLimite(
  db: Queryable,
  chave: string,
  limite: Limite,
): Promise<ResultadoLimite> {
  const agora = Math.floor(Date.now() / 1000);
  const esperarSegundos = limite.janelaSegundos - (agora % limite.janelaSegundos);

  try {
    const linha = await db.one<{ consumir_limite: number }>(
      'select app.consumir_limite($1, $2) as consumir_limite',
      [chave.slice(0, 200), limite.janelaSegundos],
    );
    const contagem = linha?.consumir_limite ?? 0;
    return { permitido: contagem <= limite.maximo, contagem, esperarSegundos };
  } catch (erro) {
    console.error('[limites] falha ao consumir limite; requisição liberada:', erro);
    return { permitido: true, contagem: 0, esperarSegundos };
  }
}

/**
 * Zera o contador de uma chave.
 *
 * Chamada no login BEM-SUCEDIDO. O limitador é cobrado a cada tentativa,
 * inclusive as que dão certo — e sem este zerar, quem acerta a senha onze vezes
 * em cinco minutos leva a mesma trava que a varredura de dicionário.
 *
 * Não é hipótese: a suíte de navegador entra pelo `/entrar` em quase todo teste,
 * e a partir do décimo login da execução ela travava em `waitForURL`, com o
 * login recusado por excesso. Um limite que bloqueia quem sabe a senha confunde
 * "muitas tentativas" com "muitos acertos".
 *
 * Força bruta nunca acerta, então o contador dela nunca é zerado — que é
 * exatamente a distinção que o limitador deveria estar fazendo desde o começo.
 *
 * Falha em silêncio (só log): o login já aconteceu, e transformar uma limpeza de
 * contador em erro de autenticação seria trocar o sucesso pelo acessório.
 */
export async function zerarLimite(db: Queryable, chave: string): Promise<void> {
  try {
    await db.query('select app.zerar_limite($1)', [chave.slice(0, 200)]);
  } catch (erro) {
    console.error('[limites] falha ao zerar contador após sucesso:', erro);
  }
}

/**
 * Limpeza oportunista das janelas vencidas.
 *
 * Roda com baixa probabilidade dentro do próprio caminho de requisição: varrer
 * a cada chamada custaria mais do que o limite economiza, e um cron a mais
 * estouraria o teto de dois do plano Hobby.
 */
export async function talvezLimpar(db: Queryable, probabilidade = 0.01): Promise<void> {
  if (Math.random() > probabilidade) return;
  try {
    const corte = new Date(Date.now() - 3_600_000);
    await db.query('select app.limpar_limites($1)', [corte]);
  } catch (erro) {
    console.error('[limites] falha ao limpar janelas vencidas:', erro);
  }
}

/**
 * Corpo grande demais, recusado ANTES de ler.
 *
 * `request.text()` carrega tudo na memória; sem este corte, um POST de dezenas
 * de megabytes é lido inteiro antes de a validação dizer que é inválido.
 *
 * O `Content-Length` pode mentir, e por isso não é a única defesa — mas é a
 * barata, e a plataforma já impõe um teto próprio acima dela.
 */
export function corpoGrandeDemais(request: Request, limiteBytes: number): boolean {
  const declarado = Number(request.headers.get('content-length') ?? '0');
  return Number.isFinite(declarado) && declarado > limiteBytes;
}

/** Tamanhos máximos de corpo, por endpoint. */
export const CORPO_MAXIMO = {
  /** Um evento de analytics tem algumas centenas de bytes. 16 KB é folga larga. */
  coleta: 16 * 1024,
  /** Formulário com mensagem longa. O schema já corta a mensagem em 4.000. */
  formulario: 64 * 1024,
} as const;
