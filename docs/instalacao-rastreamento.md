# Instalar o rastreamento num site

O painel gera um identificador público por site. Esse identificador endereça o site no coletor —
ele aparece no HTML de quem instalar, então **não é credencial** e não dá acesso a nada.

O passo a passo com o identificador já preenchido está em **Sites › (seu site) › Rastreamento**.
Este documento é a referência completa.

---

## 1. O script

Uma linha, antes de fechar o `</head>`, em **todas** as páginas do site:

```html
<script async src="https://SEU-PAINEL/t.js" data-site="sit_xxxxxxxxxxxx"></script>
```

Com isso o coletor já registra sozinho:

- **visualizações de página**, inclusive troca de rota em aplicações de página única;
- **cliques em WhatsApp** (`wa.me`, `api.whatsapp.com`, `whatsapp://`);
- **cliques em telefone** (`tel:`);
- **cliques em e-mail** (`mailto:`);
- **origem da visita**: UTMs e referenciador, sanitizados.

Não é preciso marcar nada para os contatos funcionarem. Eles aparecem agrupados como
`auto:whatsapp`, `auto:phone` e `auto:email`.

### Atributos aceitos

| Atributo | Para quê |
|---|---|
| `data-site` | Obrigatório. O identificador público do site. |
| `data-endpoint` | Opcional. Outro endereço de painel, se o script for servido de um CDN. |
| `data-consentimento="negado"` | Desliga a coleta para aquela visita. |
| `data-teste="true"` | Marca os eventos como teste: eles ficam fora de todas as métricas. |

---

## 2. Nomear os botões (opcional, recomendado)

Sem marcação, os cliques são contados e agrupados por tipo. Com marcação, cada botão aparece com
nome próprio no relatório:

```html
<a href="https://wa.me/5511999999999"
   data-track-id="cta-whatsapp-hero"
   data-track-sub="whatsapp"
   data-track-pos="Hero">Falar no WhatsApp</a>
```

| Atributo | Efeito |
|---|---|
| `data-track-id` | Identificador do botão no relatório. Use nomes estáveis. |
| `data-track-sub` | `whatsapp`, `phone`, `email`, `form_open` ou `outro`. Detectado sozinho em links. |
| `data-track-pos` | Onde o botão fica: Hero, Conteúdo, Rodapé, Flutuante… |
| `data-track-texto` | Rótulo no relatório, quando o texto visível não serve. |

### Abertura de formulário

Um clique que abre um formulário **não é um envio**, e o painel mantém os dois separados. Registre
a abertura explicitamente:

```html
<button onclick="painel.evento('form_open', { botaoId: 'cta-orcamento', botaoPosicao: 'Hero' })">
  Solicitar orçamento
</button>
```

Aberturas entram em "Cliques em CTA" e em "Aberturas de formulário", e **não** em "Cliques em
outros contatos".

---

## 3. Receber formulários

O envio vai para o endpoint do painel, que valida no servidor, grava a submissão, cria ou associa o
lead e só então confirma:

```html
<form id="contato">
  <input name="nome" required>
  <input name="email" type="email">
  <input name="telefone">
  <textarea name="mensagem"></textarea>
  <button type="submit">Enviar</button>
</form>

<script>
  // Uma chave por formulário PREENCHIDO, não por tentativa de envio.
  // É ela que impede que um reenvio após falha de rede crie um segundo lead.
  let chave = crypto.randomUUID();

  document.getElementById('contato').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = new FormData(evento.target);

    const resposta = await fetch('https://SEU-PAINEL/api/forms/sit_xxxxxxxxxxxx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: dados.get('nome'),
        email: dados.get('email'),
        telefone: dados.get('telefone'),
        mensagem: dados.get('mensagem'),
        formulario: 'Fale conosco',
        caminho: location.pathname,
        visitante: window.painel.visitante(),
        idempotencia: chave,
      }),
    });

    const corpo = await resposta.json();
    if (!resposta.ok) {
      // Mostre o erro. Não confirme um envio que não foi gravado.
      return mostrarErro(corpo.erro, corpo.campos);
    }
    chave = crypto.randomUUID(); // novo preenchimento, nova chave
    mostrarSucesso();
  });
</script>
```

**Obrigatório:** `nome` e pelo menos um entre `email` e `telefone`. Sem forma de contato não há
lead localizável, e o servidor recusa com 422.

Respostas possíveis:

| Código | Significado |
|---|---|
| `201` | Gravado. `duplicada: true` indica que a chave já havia sido usada — nenhum lead novo. |
| `422` | Dados inválidos. `campos` traz a mensagem por campo. |
| `404` | Identificador do site não encontrado. |
| `500` | Falha ao gravar. **Não** confirme o envio ao visitante. |

---

## 4. Verificar

Na aba Rastreamento há duas formas, e as duas fazem chamadas reais:

- **Enviar evento de teste** — dispara contra o endpoint real. Se o identificador estiver errado ou
  o endpoint fora do ar, o erro aparece na tela. O evento fica marcado como teste e não entra nas
  métricas.
- **Página de teste do site** — uma página servida pelo próprio painel, com o coletor instalado,
  botão de WhatsApp e formulário funcionando. Os eventos dela contam como coleta real.

### Os estados possíveis

| Estado | Significa |
|---|---|
| Aguardando instalação | O identificador existe, mas o snippet ainda não foi exibido. |
| Aguardando primeiro evento | O snippet foi entregue; nenhum evento chegou. |
| Evento de teste recebido | Só eventos de teste chegaram até agora. |
| Coletando | Eventos reais chegaram nas últimas 48 horas. |
| Sem eventos recentes | Já coletou, mas nada nas últimas 48 horas. |

O estado é sempre derivado dos eventos recebidos. Salvar um identificador não muda para "coletando".

---

## O que o coletor não faz

- **Não lê campos de formulário.** Nome, e-mail, telefone e mensagem só trafegam pelo endpoint de
  formulários, quando o visitante clica em Enviar.
- **Não bloqueia a navegação.** Todo envio usa `sendBeacon` (ou `fetch` com `keepalive`). O clique
  no WhatsApp abre imediatamente; a medição vai junto, sem esperar.
- **Não conta o mesmo gesto duas vezes.** Cada clique gera um identificador próprio, e o servidor
  descarta repetidos. Script instalado em duplicidade, reenvio de rede e voltar/avançar no navegador
  não inflam a contagem.
- **Não ignora consentimento.** Se a página definir `window.painelConsentimento = false`, ou o
  script tiver `data-consentimento="negado"`, nada é enviado.

## Domínios aceitos

O endpoint compara a origem da requisição com o domínio cadastrado no site (e seus subdomínios).
Eventos vindos de outro domínio são recusados com 403. Se o site mudar de endereço, atualize o
domínio no cadastro.
