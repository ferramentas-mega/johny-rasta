/*!
 * Coletor de formulários do Painel de Sites.
 *
 * Instalação — uma linha, e acabou:
 *   <script async src="https://SEU-PAINEL/f.js" data-site="sit_xxxxxxxx"></script>
 *
 * ── Por que este arquivo existe ──────────────────────────────────────────────
 *
 * O painel entregava um FORMULÁRIO PRONTO para colar. Em site nenhum isso cola:
 * quem já tem formulário precisava renomear os campos para `nome`/`email`/
 * `telefone`, acrescentar três `input hidden`, trocar o `action` e ainda colar
 * um script que procurava `#painel-form`. Ou seja, adaptação manual em cada
 * site — e mexer no formulário que já funciona, que é exatamente o que o
 * produto manda não fazer.
 *
 * Aqui é o contrário: o script se acopla ao formulário que já existe. Não
 * renomeia campo, não troca destino, não cancela o envio. Ele ESCUTA o envio e
 * manda uma cópia dos campos de contato para o painel.
 *
 * ── Princípios, na ordem em que importam ─────────────────────────────────────
 *
 *  1. NUNCA atrapalhar o site. Nada de `preventDefault`. O formulário segue o
 *     caminho dele — CRM, planilha, e-mail, o que for. Se este script falhar, o
 *     envio original acontece igual.
 *  2. LISTA BRANCA de campos. Só saem daqui nome, e-mail, telefone e mensagem,
 *     reconhecidos por tipo e por nome. Nenhum campo desconhecido é enviado.
 *     O contrário — mandar o formulário inteiro — vazaria cupom, CPF, valor de
 *     pedido e o que mais estivesse ali.
 *  3. FORMULÁRIO COM SENHA NÃO É LEAD. Qualquer formulário que tenha um campo
 *     de senha é ignorado por inteiro, sem exceção. Login e cadastro não são
 *     contato, e um acidente aqui mandaria credencial para o servidor.
 *  4. SOBREVIVER À NAVEGAÇÃO. O envio sai por `sendBeacon`: o formulário do
 *     site normalmente navega logo em seguida, e um `fetch` comum seria
 *     cancelado no meio — perdendo o lead justo depois de a pessoa digitar.
 */
(function () {
  'use strict';

  if (window.__painelFormularios) return;
  window.__painelFormularios = true;

  var script =
    document.currentScript ||
    (function () {
      var todos = document.getElementsByTagName('script');
      for (var i = todos.length - 1; i >= 0; i--) {
        if (todos[i].src && todos[i].src.indexOf('f.js') !== -1) return todos[i];
      }
      return null;
    })();
  if (!script) return;

  var SITE = script.getAttribute('data-site');
  if (!SITE) {
    console.warn('[painel] data-site ausente: o coletor de formulários não foi iniciado.');
    return;
  }

  var ENDPOINT =
    (script.getAttribute('data-endpoint') || new URL(script.src).origin) + '/api/forms/' + SITE;

  /**
   * Quais formulários observar.
   *
   * O padrão é todos, porque o objetivo é não precisar marcar nada. Quem quiser
   * restringir passa `data-formularios="#contato, .form-orcamento"`; quem
   * quiser excluir um põe `data-painel-ignorar` nele.
   */
  var SELETOR = script.getAttribute('data-formularios') || '';

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ─── reconhecimento de campos ──────────────────────────────────────────────
  //
  // Olha tipo, `autocomplete`, `name`, `id`, `placeholder` e `aria-label`. São
  // os cinco lugares onde um formulário de verdade diz o que o campo é; exigir
  // um `name` específico seria voltar a pedir adaptação.

  var PADROES = {
    email: /e-?mail/i,
    telefone: /(telefone|phone|tel\b|celular|whats|mobile|fone)/i,
    nome: /(nome|name|contato(?!s)|responsavel|respons[áa]vel)/i,
    mensagem: /(mensagem|message|assunto|coment|d[uú]vida|descri|observa)/i,
  };

  function pistas(campo) {
    return [
      campo.getAttribute('autocomplete') || '',
      campo.getAttribute('name') || '',
      campo.getAttribute('id') || '',
      campo.getAttribute('placeholder') || '',
      campo.getAttribute('aria-label') || '',
    ].join(' ');
  }

  function classificar(campo) {
    var tipo = (campo.getAttribute('type') || campo.tagName).toLowerCase();
    // O tipo declarado ganha de qualquer heurística de texto.
    if (tipo === 'email') return 'email';
    if (tipo === 'tel') return 'telefone';
    if (tipo === 'textarea') return 'mensagem';

    var t = pistas(campo);
    // E-mail antes de nome: "email" costuma conter "mail", e "nome" casaria
    // com "nome_completo" e também com "nome_da_empresa" — a ordem evita que um
    // campo de e-mail seja lido como nome por causa de um `placeholder`.
    if (PADROES.email.test(t)) return 'email';
    if (PADROES.telefone.test(t)) return 'telefone';
    if (PADROES.mensagem.test(t)) return 'mensagem';
    if (PADROES.nome.test(t)) return 'nome';
    return null;
  }

  /** O nome que o relatório vai mostrar para este formulário. */
  function nomeDoFormulario(form) {
    var explicito =
      form.getAttribute('data-painel-nome') ||
      form.getAttribute('name') ||
      form.getAttribute('aria-label') ||
      form.getAttribute('id');
    if (explicito) return String(explicito).slice(0, 120);

    // Sem identificação própria, o título mais próximo costuma ser o rótulo que
    // a pessoa usaria para falar daquele formulário ("Peça um orçamento").
    var titulo = form.querySelector('h1, h2, h3, legend');
    if (titulo && titulo.textContent) {
      var texto = titulo.textContent.trim().replace(/\s+/g, ' ');
      if (texto) return texto.slice(0, 120);
    }
    return 'Formulário';
  }

  // ─── elegibilidade ─────────────────────────────────────────────────────────

  function elegivel(form) {
    if (!form || form.tagName !== 'FORM') return false;
    if (form.hasAttribute('data-painel-ignorar')) return false;
    if (SELETOR && !form.matches(SELETOR)) return false;

    // Senha em qualquer lugar do formulário o desqualifica inteiro. Login e
    // cadastro não são contato, e aqui o erro custaria caro.
    if (form.querySelector('input[type=password]')) return false;

    // Busca não é lead. `role=search`, campo de busca, ou GET — os três sinais.
    if (form.getAttribute('role') === 'search') return false;
    if (form.querySelector('input[type=search]')) return false;

    return true;
  }

  function coletar(form) {
    var campos = form.querySelectorAll('input, textarea');
    var dados = {};

    for (var i = 0; i < campos.length; i++) {
      var campo = campos[i];
      var tipo = (campo.getAttribute('type') || '').toLowerCase();
      // Nada de senha, arquivo, botão ou campo oculto: oculto costuma carregar
      // token de CSRF e identificador interno, que não são contato.
      if (tipo === 'password' || tipo === 'file' || tipo === 'hidden') continue;
      if (tipo === 'submit' || tipo === 'button' || tipo === 'search') continue;
      if (campo.disabled) continue;

      var valor = campo.value;
      if (!valor || !String(valor).trim()) continue;

      var qual = classificar(campo);
      // Primeiro que casar vence: um formulário com dois campos de telefone
      // manda o primeiro preenchido, em vez de sobrescrever com o último.
      if (qual && !dados[qual]) dados[qual] = String(valor).trim().slice(0, 4000);
    }
    return dados;
  }

  // ─── idempotência ──────────────────────────────────────────────────────────
  //
  // Uma chave por CONTEÚDO preenchido, guardada por formulário. Duas tentativas
  // do mesmo envio (rede ruim, clique duplo, voltar e reenviar) chegam com a
  // mesma chave e o servidor grava UM lead. Mudou o que está escrito, é contato
  // novo e a chave muda junto.
  //
  // Sem confirmação do servidor, esta é a única forma honesta de deduplicar: o
  // envio sai por beacon justamente porque a página vai navegar, e quem navega
  // não fica para ler a resposta.
  var chaves = [];

  function chaveDe(form, assinatura) {
    for (var i = 0; i < chaves.length; i++) {
      if (chaves[i].form === form) {
        if (chaves[i].assinatura !== assinatura) {
          chaves[i].assinatura = assinatura;
          chaves[i].chave = uuid();
        }
        return chaves[i].chave;
      }
    }
    var novo = { form: form, assinatura: assinatura, chave: uuid() };
    chaves.push(novo);
    return novo.chave;
  }

  // ─── envio ─────────────────────────────────────────────────────────────────

  function enviar(dados) {
    var corpo = JSON.stringify(dados);
    try {
      if (navigator.sendBeacon) {
        // `text/plain` de propósito: é o que dispensa preflight. Com
        // `application/json` o navegador exigiria um OPTIONS que o beacon não
        // sabe mandar, e o envio sumiria em silêncio.
        var pacote = new Blob([corpo], { type: 'text/plain;charset=UTF-8' });
        if (navigator.sendBeacon(ENDPOINT, pacote)) return;
      }
    } catch (e) {
      /* cai no fetch abaixo */
    }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: corpo,
        keepalive: true,
        mode: 'cors',
      }).catch(function () {});
    } catch (e) {
      /* nada a fazer: o envio original do site segue o caminho dele */
    }
  }

  function aoEnviar(form) {
    if (!elegivel(form)) return;

    var dados = coletar(form);

    // Sem nome não há lead, e sem e-mail ou telefone o contato não é
    // localizável — o servidor recusaria os dois casos. Desistir aqui evita
    // gastar requisição e encher o log de 400 com formulário de newsletter.
    if (!dados.nome) return;
    if (!dados.email && !dados.telefone) return;

    var assinatura = [dados.nome, dados.email, dados.telefone, dados.mensagem].join('|');

    var envio = {
      formulario: nomeDoFormulario(form),
      nome: dados.nome,
      caminho: location.pathname,
      idempotencia: chaveDe(form, assinatura),
    };
    if (dados.email) envio.email = dados.email;
    if (dados.telefone) envio.telefone = dados.telefone;
    if (dados.mensagem) envio.mensagem = dados.mensagem;

    // Do coletor, quando ele está na página. Os dois são opcionais: recusar um
    // contato porque o analytics não carregou seria o pior resultado possível.
    try {
      if (window.painel) {
        if (painel.visitante) envio.visitante = painel.visitante();
        // O token é o que liga este envio ao diagnóstico em andamento. Sem ele,
        // a etapa de formulários do assistente nunca fecha: ela conta envios
        // COM token, e o formulário antigo não mandava nenhum — chegava como
        // lead real e a verificação seguia pendente para sempre.
        if (painel.diagnostico) {
          var t = painel.diagnostico();
          if (t) envio.diagnostico = t;
        }
      }
    } catch (e) {
      /* segue sem os opcionais */
    }

    enviar(envio);
  }

  /*
   * Escuta no documento, na fase de captura.
   *
   * É o que faz isto funcionar em popup, modal e formulário montado depois —
   * inclusive os que só existem quando alguém clica em "Fale conosco". Um
   * `addEventListener` por formulário exigiria que todos já estivessem na
   * página no carregamento, que é justamente o caso que mais quebra.
   *
   * Captura, e não bolha: um formulário cujo próprio script chama
   * `stopPropagation` impediria a bolha de chegar aqui.
   */
  document.addEventListener(
    'submit',
    function (evento) {
      try {
        aoEnviar(evento.target);
      } catch (e) {
        // Um defeito aqui NUNCA pode derrubar o envio do site.
        console.warn('[painel] falha ao copiar o formulário:', e && e.message);
      }
    },
    true,
  );

  /*
   * Saída manual, para formulário que não dispara `submit`.
   *
   * React e afins às vezes tratam o clique e nunca emitem o evento nativo.
   * Nesses casos a página chama:
   *
   *   painelFormulario.enviar({ nome: '…', email: '…', formulario: 'Orçamento' })
   */
  window.painelFormulario = {
    enviar: function (dados) {
      if (!dados || !dados.nome) return;
      if (!dados.email && !dados.telefone) return;
      var envio = {
        formulario: String(dados.formulario || 'Formulário').slice(0, 120),
        nome: String(dados.nome).slice(0, 160),
        caminho: location.pathname,
        idempotencia: dados.idempotencia || uuid(),
      };
      if (dados.email) envio.email = String(dados.email).slice(0, 254);
      if (dados.telefone) envio.telefone = String(dados.telefone).slice(0, 40);
      if (dados.mensagem) envio.mensagem = String(dados.mensagem).slice(0, 4000);
      try {
        if (window.painel) {
          if (painel.visitante) envio.visitante = painel.visitante();
          if (painel.diagnostico) {
            var t = painel.diagnostico();
            if (t) envio.diagnostico = t;
          }
        }
      } catch (e) {
        /* opcionais */
      }
      enviar(envio);
    },
  };
})();
