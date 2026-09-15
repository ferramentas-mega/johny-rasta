/**
 * Os trechos que o operador copia para o site do cliente.
 *
 * Ficam num módulo só porque o assistente de configuração e a aba de
 * Rastreamento mostram os mesmos códigos — duas cópias divergiriam na primeira
 * correção feita em uma delas.
 *
 * Regra que vale para todos: **nada de `PREENCHER_COM`.** Um exemplo com
 * lacuna não é um exemplo, é lição de casa — e quem cola sem preencher fica com
 * um formulário quebrado e nenhuma pista do motivo. O que o snippet precisar,
 * ele resolve sozinho.
 */

/**
 * A tag do coletor de FORMULÁRIOS. Uma linha, e acabou.
 *
 * Existe porque o modelo pronto (`snippetFormulario`) não colava em site
 * nenhum: quem já tem formulário precisava renomear campos para
 * `nome`/`email`/`telefone`, acrescentar três `input hidden`, trocar o `action`
 * e colar um script que procurava `#painel-form`. Adaptação manual em cada
 * site — e mexendo no formulário que já funciona, que é justamente o que o
 * produto manda não fazer.
 *
 * O `f.js` faz o contrário: escuta o envio do formulário que já existe e manda
 * uma CÓPIA dos campos de contato. Não renomeia nada, não troca destino, não
 * cancela o envio. Funciona em popup e em formulário montado depois, porque
 * escuta no documento.
 */
export function snippetFormularioAutomatico(endpoint: string, publicId: string): string {
  return `<script async src="${endpoint}/f.js"\n        data-site="${publicId}"></script>`;
}

/** A tag do coletor. Uma linha, antes de `</head>`, em todas as páginas. */
export function snippetColetor(endpoint: string, publicId: string): string {
  return `<script async src="${endpoint}/t.js"\n        data-site="${publicId}"></script>`;
}

/**
 * Formulário que funciona de verdade.
 *
 * Três decisões dentro dele, e todas existem por um motivo:
 *
 * 1. **O `<form>` tem `action` e `method` reais.** Com JavaScript desligado,
 *    bloqueado ou quebrado, o envio ainda chega ao servidor — o script abaixo
 *    só melhora a experiência, não é pré-requisito para receber um contato.
 * 2. **O identificador de visitante é opcional.** Ele liga a submissão à sessão
 *    de analytics; quando o coletor não está lá (bloqueador, consentimento
 *    negado, script fora do ar), o campo vai vazio e o servidor aceita. Recusar
 *    um contato legítimo porque o analytics falhou seria o pior resultado
 *    possível.
 * 3. **A chave de idempotência é gerada uma vez por formulário PREENCHIDO**, e
 *    só é renovada depois de um envio confirmado. É isso que faz o segundo
 *    clique no botão (ou um retry de rede) não virar um segundo lead — e faz um
 *    contato novo, de verdade, contar como novo.
 */
/**
 * Escapa um valor que vai DENTRO de um atributo HTML entre aspas duplas.
 *
 * Este arquivo é o único ponto do projeto que monta HTML por concatenação — em
 * todo o resto quem escapa é o React. Aqui não dá: o resultado é texto para o
 * operador copiar, não uma árvore de elementos.
 *
 * Hoje os dois chamadores passam a constante `'Fale conosco'`, então não há
 * ataque em andamento. Escapar mesmo assim é o que impede que o primeiro
 * chamador a passar o nome do site — um campo que o usuário digita — produza um
 * formulário quebrado, ou um `onerror=` colado no site do cliente. A alternativa
 * seria confiar que ninguém vai usar o parâmetro que a própria função oferece.
 */
function atributo(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function snippetFormulario(endpoint: string, publicId: string, nomeDoFormulario = 'Fale conosco'): string {
  return `<form id="painel-form" method="post" action="${atributo(endpoint)}/api/forms/${atributo(publicId)}">
  <input name="nome" placeholder="Seu nome" required>
  <input name="email" type="email" placeholder="Seu e-mail">
  <input name="telefone" placeholder="Seu telefone">
  <textarea name="mensagem" placeholder="Mensagem"></textarea>
  <input type="hidden" name="formulario" value="${atributo(nomeDoFormulario)}">
  <input type="hidden" name="visitante" value="">
  <input type="hidden" name="idempotencia" value="">
  <button type="submit">Enviar</button>
  <p id="painel-form-retorno" role="status"></p>
</form>

<script>
(function () {
  var form = document.getElementById('painel-form');
  var retorno = document.getElementById('painel-form-retorno');
  if (!form) return;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // Uma chave por formulário PREENCHIDO: ela sobrevive a quantas tentativas de
  // envio forem necessárias e só muda depois de um envio confirmado.
  var chave = uuid();

  form.addEventListener('submit', function (evento) {
    evento.preventDefault();

    // O visitante vem do coletor quando ele existe. Quando não existe, o campo
    // vai vazio — e o envio continua valendo.
    form.visitante.value = (window.painel && painel.visitante && painel.visitante()) || '';
    form.idempotencia.value = chave;

    var botao = form.querySelector('button[type=submit]');
    if (botao) botao.disabled = true;
    if (retorno) retorno.textContent = 'Enviando…';

    fetch(form.action, { method: 'POST', body: new FormData(form) })
      .then(function (r) { return r.json().then(function (c) { return { ok: r.ok, corpo: c }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error((r.corpo && r.corpo.erro) || 'Não foi possível enviar.');
        // Só agora o envio está confirmado PELO SERVIDOR. Antes disto, nada
        // foi recebido — o evento de submit do navegador não prova nada.
        if (retorno) retorno.textContent = 'Recebemos sua mensagem.';
        form.reset();
        chave = uuid();
      })
      .catch(function (erro) {
        if (retorno) retorno.textContent = erro.message + ' Tente novamente.';
      })
      .finally(function () {
        if (botao) botao.disabled = false;
      });
  });
})();
</script>`;
}

/** Exemplo de CTA marcado. Opcional: sem ele, o clique ainda é contado. */
export function snippetBotao(): string {
  return `<a href="https://wa.me/5511999999999"
   data-track-id="cta-whatsapp-hero"
   data-track-sub="whatsapp"
   data-track-pos="Hero">Falar no WhatsApp</a>`;
}

/**
 * A instrução para colar noutra sessão de Claude Code, no repositório do site
 * do cliente.
 *
 * Carrega **apenas dado público**: o domínio autorizado, o identificador
 * público do site e o endereço do coletor. Nada de token, segredo ou
 * credencial administrativa — este texto vai ser colado num chat, e pode ser
 * colado no chat errado.
 *
 * O texto manda INSPECIONAR antes de mexer, e diz explicitamente o que não
 * fazer: não substituir o formulário existente, não instalar duas vezes, não
 * remover consentimento.
 */
export function instrucaoParaClaudeCode(opcoes: {
  endpoint: string;
  publicId: string;
  dominio: string;
  plataforma: string;
  comFormulario: boolean;
}): string {
  const { endpoint, publicId, dominio, plataforma, comFormulario } = opcoes;

  const linhas = [
    `Instale o coletor de analytics do Painel de Sites neste repositório.`,
    ``,
    `Dados deste site (todos públicos, nenhum é credencial):`,
    `- Domínio autorizado: ${dominio}`,
    `- Identificador público do site: ${publicId}`,
    `- Endereço do coletor: ${endpoint}/t.js`,
    `- Plataforma informada no painel: ${plataforma}`,
    ``,
    `Antes de editar:`,
    `1. Inspecione o framework e descubra onde fica o HTML compartilhado por TODAS as páginas.`,
    `2. Verifique se o coletor JÁ está instalado (procure por "t.js" e por "${publicId}"). Se`,
    `   estiver, não instale de novo e me diga onde ele está — duas tags em lugares diferentes`,
    `   viram manutenção esquecida.`,
    ``,
    `A instalação:`,
    `3. Acrescente, UMA única vez, no layout raiz (não numa página):`,
    ``,
    `   <script async src="${endpoint}/t.js" data-site="${publicId}"></script>`,
    ``,
    `   Em Next.js App Router, use next/script com strategy="afterInteractive" no app/layout.tsx.`,
    `   Em Pages Router, pages/_document.tsx. Em WordPress, o cabeçalho global do tema ou um`,
    `   plugin de inserção de código. Em HTML puro, antes de </head> de cada página.`,
    ``,
    `4. Navegação entre rotas sem recarregar (SPA) já é tratada pelo próprio coletor — ele observa`,
    `   pushState, replaceState e popstate. Não acrescente contagem manual de página: isso`,
    `   duplicaria as visualizações.`,
    ``,
    `5. Se o site já tem banner de consentimento, PRESERVE o comportamento dele. O coletor respeita`,
    `   window.painelConsentimento = false e data-consentimento="negado". Não remova nem contorne.`,
    ``,
    `6. Para os botões que devem ser medidos por nome, acrescente data-track-id e data-track-pos:`,
    ``,
    `   <a href="https://wa.me/..." data-track-id="cta-whatsapp-hero" data-track-pos="Hero">`,
    ``,
    `   Links de wa.me, tel: e mailto: já são detectados sem marcação alguma. A marcação só troca`,
    `   o rótulo "auto:whatsapp" por um nome legível no relatório.`,
  ];

  if (comFormulario) {
    linhas.push(
      ``,
      `Sobre o formulário — leia com atenção:`,
      `7. NÃO substitua o formulário existente nem mude o destino dele. Se o site hoje envia para um`,
      `   CRM, uma planilha ou um e-mail, isso precisa continuar funcionando.`,
      `8. Para que o painel também receba, o caminho é um envio ADICIONAL para`,
      `   ${endpoint}/api/forms/${publicId} com os campos nome, email, telefone, mensagem e`,
      `   formulario. Os campos visitante e idempotencia são opcionais.`,
      `9. Gere a chave de idempotência UMA vez por formulário preenchido e mantenha a mesma em`,
      `   todas as tentativas de envio; troque só depois de um envio confirmado. É ela que impede`,
      `   que um retry de rede vire um segundo lead.`,
      `10. Não exija o identificador de visitante para enviar: quem bloqueia analytics precisa`,
      `    conseguir mandar a mensagem do mesmo jeito.`,
    );
  }

  linhas.push(
    ``,
    `Ao terminar:`,
    `- Rode o build e os testes do projeto.`,
    `- Me diga em qual arquivo instalou e se encontrou instalação anterior.`,
    `- Não afirme que está funcionando: a confirmação vem do painel, que só considera instalado`,
    `  depois de receber um evento real vindo de ${dominio}.`,
  );

  return linhas.join('\n');
}

/**
 * Conferência de instalação, para colar no console do navegador.
 *
 * ── Por que no console, e não no servidor ────────────────────────────────────
 *
 * A pergunta "a tag está lá?" só tem resposta útil no navegador de quem visita.
 * Buscar o HTML pelo servidor responderia outra pergunta — se o texto está no
 * documento — e é justamente a resposta que engana: script bloqueado por CSP,
 * por consentimento ou por bloqueador está no HTML e não mede nada. Aqui o
 * teste roda no mesmo lugar onde o coletor rodaria, com as mesmas regras, as
 * mesmas extensões e o mesmo cache.
 *
 * E há a razão de segurança: fazer o servidor buscar uma URL que o usuário
 * escolhe criaria um alvo de SSRF que hoje não existe — as únicas saídas do
 * aplicativo vão para dois endereços fixos do Google. Este caminho não abre
 * nenhum.
 *
 * O texto é só leitura: procura a tag, olha a marca que o coletor deixa em
 * `window`, e tenta carregar o `t.js` para distinguir "bloqueado" de "ausente".
 * NÃO envia evento nenhum — uma conferência que sujasse o relatório do cliente
 * seria uma troca ruim.
 */
export function conferenciaNoConsole(endpoint: string, publicId: string): string {
  return `// Cole no console do navegador, com o SITE DO CLIENTE aberto.
(function () {
  var esperado = ${JSON.stringify(publicId)};
  var endpointEsperado = ${JSON.stringify(endpoint)};
  var tags = Array.prototype.slice.call(
    document.querySelectorAll('script[src*="/t.js"]')
  );
  var rodou = !!window.__painelColetor;

  console.log('%cConferência do Painel de Sites', 'font-weight:bold');
  console.log('Tags encontradas na página:', tags.length);

  if (tags.length === 0) {
    console.log('%c✗ A tag NÃO está nesta página.', 'color:#c00');
    console.log('  Publique o snippet antes de </head> — e confirme que a publicação subiu.');
    return;
  }
  if (tags.length > 1) {
    console.log('%c! A tag está instalada ' + tags.length + ' vezes.', 'color:#c80');
    console.log('  Cada cópia dispara a própria visualização: os números dobram.');
  }

  tags.forEach(function (t, i) {
    var site = t.getAttribute('data-site');
    console.log('  [' + i + '] src=' + t.src);
    console.log('       data-site=' + site + (site === esperado ? ' (confere)' : ' (NÃO é o deste site: esperado ' + esperado + ')'));
    if (t.src.indexOf(endpointEsperado) !== 0) {
      console.log('%c       O endereço não é o deste painel. Esperado: ' + endpointEsperado + '/t.js', 'color:#c80');
    }
  });

  if (rodou) {
    console.log('%c✓ O coletor está rodando nesta página.', 'color:#080');
    console.log('  Se mesmo assim o painel não recebe, o envio é que está sendo barrado:');
    console.log('  veja a aba Network por uma chamada a /api/collect.');
    return;
  }

  console.log('%c✗ A tag está na página, mas o coletor NÃO rodou.', 'color:#c00');
  console.log('  Quase sempre é uma destas: bloqueador de anúncios, CSP do site, ou o arquivo não carregou.');

  // Distingue "não carregou" de "carregou e foi impedido de rodar".
  var teste = document.createElement('script');
  teste.src = tags[0].src.split('?')[0] + '?conferencia=1';
  teste.onload = function () {
    console.log('  → O arquivo CARREGA. Então o que barra é a execução ou o envio (CSP/consentimento).');
  };
  teste.onerror = function () {
    console.log('%c  → O arquivo NÃO carrega. É bloqueio de rede, CSP de script-src, ou endereço errado.', 'color:#c00');
    console.log('     Endereço testado: ' + teste.src);
  };
  document.head.appendChild(teste);
})();`;
}
