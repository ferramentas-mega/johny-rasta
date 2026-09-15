/**
 * Por que a verificação ainda não passou.
 *
 * ── O beco sem saída que isto elimina ────────────────────────────────────────
 *
 * A etapa de verificação dizia "ainda não recebemos nenhum evento" e listava
 * quatro suspeitas genéricas — script não publicado, cache, domínio diferente,
 * bloqueador. A lista era honesta e inútil: vinha igual em toda situação,
 * inclusive naquelas em que o painel sabia perfeitamente descartar três das
 * quatro. Quem estava instalando ficava sem próximo passo, que é o pior lugar
 * para largar alguém num assistente.
 *
 * ── O que NÃO mudou ──────────────────────────────────────────────────────────
 *
 * Verificação continua sendo **um evento recebido**. Nada aqui carimba recurso
 * nenhum, e em particular nada aqui olha o HTML do site: script bloqueado por
 * CSP, consentimento ou bloqueador está lá no HTML e não mede coisa alguma —
 * encontrar a tag provaria só que alguém colou texto numa página.
 *
 * O que muda é o DIAGNÓSTICO da espera. São fatos que o painel já tem no banco,
 * combinados para dizer onde a corrente arrebentou:
 *
 *   1. O site já recebeu algum evento, algum dia, de qualquer origem?
 *   2. Os únicos eventos vieram das páginas do próprio painel?
 *   3. Chegou evento do site real DURANTE a janela, só que sem o token?
 *
 * Cada resposta elimina suspeitas diferentes. "Nunca chegou nada de lugar
 * nenhum" e "chegou agora, mas sem token" têm causas opostas e próximos passos
 * opostos; mandar a mesma lista para os dois é o que fazia o assistente
 * parecer um formulário em vez de um assistente.
 */

/**
 * Caminhos que o PRÓPRIO painel gera.
 *
 * Um evento vindo daqui prova que o servidor recebe — e não prova nada sobre o
 * site do cliente. Separar os dois é o que permite dizer "o caminho de coleta
 * está de pé, o problema está na sua página", que é uma informação e tanto para
 * quem está apanhando da instalação.
 */
export const CAMINHO_EVENTO_DE_TESTE = '/verificacao-de-instalacao';
export const PREFIXO_PAGINA_DE_TESTE = '/teste/';

export function ehCaminhoDoPainel(caminho: string | null | undefined): boolean {
  if (!caminho) return false;
  return caminho === CAMINHO_EVENTO_DE_TESTE || caminho.startsWith(PREFIXO_PAGINA_DE_TESTE);
}

/** O que o banco sabe sobre a instalação deste site. */
export type FatosDaInstalacao = {
  /** Há sessão de diagnóstico para este token? */
  diagnosticoExiste: boolean;
  /** Ela ainda está dentro do prazo? */
  diagnosticoVivo: boolean;
  /** Eventos com o token, dentro da janela. É o que de fato verifica. */
  comToken: number;
  /**
   * Eventos do site REAL dentro da janela, sem token.
   *
   * O caso mais comum por trás disto: a pessoa abriu o site direto, em vez de
   * abrir pelo link do diagnóstico. A tag está funcionando — o que faltou foi o
   * rótulo que liga aquele acesso a este teste.
   */
  semTokenNaJanela: number;
  /** Eventos do site real, em toda a história. */
  doSiteNoTotal: number;
  /** Eventos vindos das páginas do painel, em toda a história. */
  doPainelNoTotal: number;
};

export type SinalDeInstalacao =
  | 'recebido'
  | 'sem_token'
  | 'ja_coletou_antes'
  | 'so_do_painel'
  | 'nunca_coletou'
  | 'diagnostico_vencido'
  | 'sem_diagnostico';

export type Diagnostico = {
  sinal: SinalDeInstalacao;
  /** Uma frase afirmativa sobre o que É, não sobre o que falta. */
  titulo: string;
  /** O que o painel MEDIU. Sem isto o diagnóstico vira palpite com autoridade. */
  oQueSabemos: string;
  /** A causa mais provável, dita como provável — nunca como certeza. */
  causaProvavel: string;
  /** Uma ação concreta, em frase imperativa. */
  proximaAcao: string;
  /** Vale oferecer a conferência pelo console do navegador? */
  ofereceConsole: boolean;
  tom: 'ok' | 'warn' | 'erro';
};

/**
 * A ordem das perguntas é a ordem da corrente, do fim para o começo.
 *
 * Do mais específico para o mais genérico: só chega ao "não sei" quem não casou
 * com nenhum fato — e aí o texto diz que não sabe, em vez de fingir uma causa.
 */
export function diagnosticarInstalacao(f: FatosDaInstalacao): Diagnostico {
  if (!f.diagnosticoExiste) {
    return {
      sinal: 'sem_diagnostico',
      titulo: 'Nenhum diagnóstico aberto.',
      oQueSabemos: 'Sem uma sessão de diagnóstico, não há como separar o seu teste do tráfego real.',
      causaProvavel: 'O diagnóstico anterior foi encerrado, ou ainda não foi aberto nenhum.',
      proximaAcao: 'Abra um diagnóstico e refaça o teste pelo link que ele gera.',
      ofereceConsole: false,
      tom: 'warn',
    };
  }

  if (f.comToken > 0) {
    return {
      sinal: 'recebido',
      titulo: 'A coleta está funcionando neste site.',
      oQueSabemos: `${f.comToken} evento(s) chegaram com o token deste diagnóstico.`,
      causaProvavel: '',
      proximaAcao: 'Faça os gestos que faltam (clique no WhatsApp, envie o formulário) para verificar o resto.',
      ofereceConsole: false,
      tom: 'ok',
    };
  }

  if (!f.diagnosticoVivo) {
    return {
      sinal: 'diagnostico_vencido',
      titulo: 'Este diagnóstico venceu.',
      oQueSabemos: 'O prazo do token passou, e eventos que cheguem por ele não contam mais para a verificação.',
      causaProvavel: 'O teste demorou mais que o prazo, ou o link ficou parado numa aba.',
      proximaAcao: 'Abra um diagnóstico novo — o link anterior não serve mais.',
      ofereceConsole: false,
      tom: 'warn',
    };
  }

  // Tag viva, rótulo ausente. É o engano de percurso mais comum do assistente, e
  // o mais frustrante de diagnosticar sem esta informação: tudo parece quebrado
  // e na verdade está tudo funcionando, menos o link usado para abrir o site.
  if (f.semTokenNaJanela > 0) {
    return {
      sinal: 'sem_token',
      titulo: 'O rastreamento está funcionando — faltou abrir pelo link do diagnóstico.',
      oQueSabemos: `Chegaram ${f.semTokenNaJanela} evento(s) deste site agora há pouco, mas nenhum trazia o token do teste.`,
      causaProvavel:
        'O site foi aberto direto, e não pelo link acima — ou a aba tinha o token de um diagnóstico já vencido.',
      proximaAcao: 'Abra o site PELO link do diagnóstico, nesta mesma aba, e refaça o gesto.',
      ofereceConsole: false,
      tom: 'warn',
    };
  }

  // A tag já funcionou algum dia. Isso derruba "nunca instalou" e coloca cache,
  // publicação recente e bloqueador no topo da lista.
  if (f.doSiteNoTotal > 0) {
    return {
      sinal: 'ja_coletou_antes',
      titulo: 'Este site já coletou antes, mas nada chegou durante este teste.',
      oQueSabemos: `Há ${f.doSiteNoTotal} evento(s) deste site na história, e nenhum nesta janela.`,
      causaProvavel:
        'A tag saiu da página numa publicação recente, o cache do site ou da CDN está servindo a versão antiga, ou um bloqueador impediu o envio agora.',
      proximaAcao: 'Abra o site pelo link do diagnóstico e confira, pelo console, se o coletor está de pé.',
      ofereceConsole: true,
      tom: 'erro',
    };
  }

  // O servidor recebe; o site do cliente é que nunca falou com ele. É o
  // diagnóstico mais útil que o painel consegue dar sem olhar a página — e é
  // muito mais estreito que "pode ser qualquer uma destas quatro coisas".
  if (f.doPainelNoTotal > 0) {
    return {
      sinal: 'so_do_painel',
      titulo: 'O caminho de coleta está de pé. O que nunca chegou foi evento do seu site.',
      oQueSabemos: `O servidor já recebeu ${f.doPainelNoTotal} evento(s) das páginas de teste do próprio painel, e nenhum de uma página do site real.`,
      causaProvavel:
        'A tag não está publicada nas páginas do site, está numa versão que o visitante não recebe, ou é bloqueada antes de rodar.',
      proximaAcao: 'Abra o site pelo link do diagnóstico e cole a conferência abaixo no console do navegador.',
      ofereceConsole: true,
      tom: 'erro',
    };
  }

  return {
    sinal: 'nunca_coletou',
    titulo: 'Nenhum evento chegou deste site, nunca.',
    oQueSabemos: 'Não há um único evento para este site no banco, de nenhuma origem.',
    causaProvavel: 'A tag ainda não foi publicada, ou foi publicada num lugar que o visitante não carrega.',
    proximaAcao: 'Publique o snippet antes de </head> e abra o site pelo link do diagnóstico.',
    ofereceConsole: true,
    tom: 'erro',
  };
}
