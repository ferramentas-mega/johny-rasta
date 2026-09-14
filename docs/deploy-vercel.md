# Deploy na Vercel, clique a clique

Ao final você terá uma URL pública, com os dados no Supabase. Leva uns 15 minutos.

Antes de começar, tenha em mãos: a conta do GitHub que é dona do repositório, uma conta na Vercel
e acesso ao painel do Supabase.

---

## Passo 1 — Conferir a branch (provavelmente nada a fazer)

O repositório tem **uma única branch**, `claude/busy-hopper-3seo9l`, e ela já é a branch padrão.
Não existe `main`, e não há nada para mesclar — a Vercel vai publicar a partir da padrão sozinha.

Se você abriu a tela **Compare changes** do GitHub e ela mostrou a mesma branch dos dois lados,
foi exatamente por isso. Pode fechar e seguir para o passo 2.

### Quer que a branch se chame `main`?

Opcional, e é só cosmético — mas `claude/busy-hopper-3seo9l` é um nome estranho para uma branch de
produção permanente. Renomear no GitHub leva dois cliques e não quebra nada:

1. No repositório, clique em **Settings**.
2. No menu lateral, clique em **Branches**.
3. Ao lado de `claude/busy-hopper-3seo9l`, clique no ícone de lápis (**Rename branch**).
4. Digite `main` e clique em **Rename branch**.

O GitHub redireciona as referências antigas automaticamente. Se você já tiver clonado o repositório
em algum lugar, rode lá:

```bash
git branch -m claude/busy-hopper-3seo9l main
git fetch origin
git branch -u origin/main main
```

> **Se o projeto da Vercel já existir, o rename exige um ajuste lá — e ele não é opcional.**
> O campo **Settings → Git → Production Branch** guarda o *nome* da branch e **não acompanha** o
> rename do GitHub. Depois de renomear, ele continua apontando para `claude/busy-hopper-3seo9l`,
> uma branch que não existe mais. O resultado não é um erro visível: os pushes passam a gerar
> apenas **Preview**, a produção congela no último build publicado, e o domínio serve código
> antigo indefinidamente. Renomeou? Vá em **Settings → Git**, troque o Production Branch para
> `main` e salve, antes de qualquer outra coisa.

---

## Passo 2 — Pegar a connection string do Supabase

1. Abra `https://supabase.com/dashboard/project/cihsheaiqinrmftjwexu`.
2. No menu lateral, clique na engrenagem **Project Settings**.
3. Clique em **Database**.
4. Role até **Connection string** e escolha a aba **Transaction pooler**.
5. Copie o texto. Ele tem este formato:

```
postgresql://postgres.cihsheaiqinrmftjwexu:[YOUR-PASSWORD]@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

**Importante:** use o *pooler*, não a **Direct connection**. A conexão direta só existe em IPv6, e
as funções da Vercel não alcançam.

> **O painel do Supabase também oferece uma seção de "API Keys" com um guia de instalação do
> `@supabase/supabase-js`. Ignore.** Esta aplicação não usa a API do Supabase: ela fala Postgres
> direto, com três papéis de privilégios diferentes. Instalar aquele pacote e usar a chave
> publicável colocaria a separação de privilégios de lado e exigiria reescrever as políticas de RLS.
> Do painel, você só precisa da connection string.

Guarde o **host** (a parte `aws-...pooler.supabase.com`) — o seu pode ter um número diferente.
Você vai montar três connection strings a partir dele, trocando o usuário e a senha:

| Variável | Usuário | Senha |
|---|---|---|
| `DATABASE_URL` | `app_user.cihsheaiqinrmftjwexu` | a senha do papel `app_user` |
| `DATABASE_URL_INGEST` | `app_ingest.cihsheaiqinrmftjwexu` | a senha do papel `app_ingest` |
| `DATABASE_URL_FORMS` | `app_forms.cihsheaiqinrmftjwexu` | a senha do papel `app_forms` |

O sufixo `.cihsheaiqinrmftjwexu` depois do nome do papel **é obrigatório**: é assim que o pooler
descobre para qual projeto encaminhar a conexão.

Cada uma fica assim:

```
postgresql://app_user.cihsheaiqinrmftjwexu:SENHA_DO_APP_USER@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

Gere também o segredo de sessão, num terminal qualquer:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

---

## Passo 3 — Criar o projeto na Vercel

1. Abra `https://vercel.com/new`.
2. Se for a primeira vez, clique em **Continue with GitHub** e autorize.
3. Na lista **Import Git Repository**, encontre **johny-rasta** e clique em **Import**.
   - Não aparece? Clique em **Adjust GitHub App Permissions**, marque o repositório e salve.
4. Na tela de configuração:
   - **Framework Preset**: já vem como **Next.js**. Não mexa.
   - **Root Directory**: deixe em branco.
   - **Build and Output Settings**: não mexa. O `vercel.json` do projeto já cuida disso.
5. **Git Branch**: a Vercel já seleciona a branch padrão do repositório. Não precisa mexer.

---

## Passo 4 — As variáveis de ambiente

Ainda na mesma tela, expanda **Environment Variables** e adicione uma a uma. Para cada uma: digite
o nome em **Key**, o valor em **Value**, e clique em **Add**.

**As duas que fazem o painel subir.** Sem qualquer uma delas, ninguém entra:

| Key | Value |
|---|---|
| `DATABASE_URL` | a string do `app_user` montada no passo 2 |
| `SESSION_SECRET` | o segredo gerado no passo 2 |

**As duas que ligam a coleta.** Faltando, os endpoints públicos respondem 503 e **só eles** — o
painel continua funcionando, o que é útil para conferir o login primeiro:

| Key | Value |
|---|---|
| `DATABASE_URL_INGEST` | a string do `app_ingest` |
| `DATABASE_URL_FORMS` | a string do `app_forms` |

> **Marque os três ambientes em cada variável**: **Production**, **Preview** e **Development**.
> A Vercel deixa marcar só um, e uma variável salva apenas em Production **não existe** num
> deployment de Preview. O sintoma engana: o `/api/diagnostico` aberto pela URL de preview acusa
> tudo ausente, como se você não tivesse salvado nada.

**Não adicione `DATABASE_URL_ADMIN`.** Ela só serve para migração e seed, e o código da aplicação
nunca a importa. Fora dali, ela seria uma credencial de superusuário exposta sem necessidade.

**Não adicione `APP_URL` agora.** Sem ela, a aplicação usa o domínio que a própria Vercel informa —
que é o certo. Você só vai definir essa variável quando tiver um domínio próprio (passo 7).

---

## Passo 5 — Publicar

Clique em **Deploy**.

Leva dois ou três minutos. Quando terminar, aparece uma tela de parabéns com a captura do site.
Clique em **Continue to Dashboard** e copie a URL, algo como
`https://johny-rasta.vercel.app`.

---

## Passo 6 — Entrar e conferir

1. Abra a URL e vá para `/entrar`.
2. Use **ferramentas@megaads.com.br** e a senha que combinamos para a conta do Supabase.
3. Você deve cair na Visão geral, com a conta **Mega Ads** e nenhum site — a conta do Supabase está
   vazia de propósito, sem massa fictícia.

Se der erro de conexão nesta hora, é quase sempre a connection string. Veja **Quando algo dá
errado**, no fim.

Agora crie o primeiro cliente e o primeiro site de verdade:

1. **Clientes** → **+ Novo cliente** → nome do cliente → **Cadastrar cliente**.
2. **Sites** → **+ Novo site** → escolha o cliente, dê um nome e informe o domínio →
   **Cadastrar site**.
3. Na linha do site, clique em **Instalação →**.
4. Copie o snippet. Confira que o endereço nele é a sua URL da Vercel, e não `localhost`.
5. Clique em **Enviar evento de teste**. Deve aparecer *"Evento de teste recebido pelo servidor"*.

Esse botão faz uma chamada real ao endpoint. Se ele responder, a coleta está de pé e o caminho
inteiro — aplicação, pooler, banco, RLS — está funcionando.

---

## Passo 7 — Domínio próprio (opcional)

1. No projeto, clique em **Settings** → **Domains**.
2. Digite seu domínio (ex.: `painel.megaads.com.br`) e clique em **Add**.
3. A Vercel mostra o registro DNS a criar. Adicione no seu provedor de domínio e aguarde a
   validação.
4. Depois que o domínio estiver ativo, vá em **Settings** → **Environment Variables**, adicione
   `APP_URL` com o valor `https://painel.megaads.com.br` e clique em **Save**.
5. Vá em **Deployments**, nos três pontinhos do deploy mais recente, e clique em **Redeploy**.

O passo 4 importa: o `APP_URL` é o endereço que aparece no snippet que seus clientes colam no site
deles. Se ficar apontando para o domínio antigo da Vercel e você um dia desativá-lo, a coleta
daqueles sites para de funcionar.

---

## A produção está servindo um build antigo

Este é o problema mais confuso da Vercel, porque **nada aparece quebrado**. O domínio responde, a
tela de login abre, e ainda assim o código no ar é de dias atrás.

O sintoma que denuncia: **um endereço que funcionava passa a responder 404** — ou um endereço novo
nunca responde. Uma rota só existe no build que a contém. Se `/api/diagnostico` dá 404, o build no
ar é anterior ao commit que criou essa rota, por mais recente que seja a data mostrada na lista.

Nada disso é defeito do projeto: o repositório compila limpo, num clone novo, **sem nenhuma
variável de ambiente definida**. Se o build quebrasse, quebraria aqui também.

### Passo 1 — A lista de Deployments

Abra **Deployments**, no menu do projeto, e olhe a entrada do topo:

| O que você vê | O que significa | O que fazer |
|---|---|---|
| **Error** (vermelho) | O build falhou; a produção segue no último que deu certo | Abra o deployment, vá em **Building** e leia a **primeira** linha vermelha do log |
| **Ready** (verde), **Production**, sem mais nada | Esse build está no ar | O problema é outro; siga para *Quando algo dá errado* |
| **Ready** (verde), **Production · Staged** | O build está pronto, mas o domínio **não** aponta para ele | Passo 2 |
| **Ready** (verde), **Preview** | Build de outra branch; nunca vira produção sozinho | Passo 2, e depois o passo 3 |
| **Queued** / **Building** | Ainda rodando | Espere terminar |

**`Staged` é a pegadinha.** Um deployment pode ser de produção, ter compilado sem erro nenhum, e
mesmo assim não estar no ar. É o que acontece quando a atribuição automática de domínio está
desligada no projeto — a tela do deployment avisa, em amarelo:

> Custom domains won't be assigned — auto-assignment is disabled.

A partir daí **todo** build novo nasce staged e se acumula, enquanto o domínio segue servindo o
último build que chegou a receber o domínio. Nenhuma variável de ambiente muda isso.

### Passo 2 — Publicar o build que já existe

1. Em **Deployments**, na linha do deployment verde mais recente, clique nos **três pontinhos**
   (⋯), à direita.
2. Clique em **Promote to Production**.
3. Confirme. Em segundos o domínio passa a servir esse build.

**Não use o Redeploy.** Ele reconstrói, o que é outra coisa, e a Vercel só aceita reconstruir o
deployment mais recente — em qualquer outro aparece *"A more recent Production Deployment has been
created, so the one you are looking at cannot be redeployed anymore"*. Para pôr no ar um build que
já está pronto, o botão é **Promote**.

### Desligar a pegadinha de vez

Promover resolve uma vez. Para os próximos builds subirem sozinhos, religue a atribuição
automática: **Settings** → **Domains** → no domínio de produção, **Edit** → que ele siga a **branch
de produção**, e não um deployment fixo.

Enquanto isso estiver desligado, cada push exige um **Promote** manual.

### Passo 3 — Por que ele saiu como Preview

Se os builds saem como Preview, a branch que você envia não é a que a Vercel considera de
produção. Confira os dois lados:

- **GitHub** → **Settings** → **Branches**: qual é a branch padrão. Neste repositório é
  `claude/busy-hopper-3seo9l`, e ela é a única que existe.
- **Vercel** → **Settings** → **Git** → **Production Branch**: precisa ser exatamente esse nome.

Diferentes? Ajuste o lado da Vercel e salve. O próximo push já sai como Production. Essa divergência
é o efeito colateral do rename descrito no passo 1 deste documento.

### Ainda assim, publicar de novo

Não existe "limpar cache e publicar" na Vercel como um botão único. O que publica de novo é um
commit novo na branch de produção. Um commit vazio serve:

```bash
git commit --allow-empty -m "Republicar"
git push
```

---

## Quando algo dá errado

### Primeiro: abra `/api/diagnostico`

A aplicação publicada tem um endereço que testa as três conexões e diz o que está errado:

```
https://SEU-APP.vercel.app/api/diagnostico
```

**Deu 404?** Então não é diagnóstico nenhum: o build no ar não tem essa rota. Volte para
*A produção está servindo um build antigo*, acima — nenhuma variável de ambiente resolve isso.

Resposta quando está tudo certo:

```json
{ "tudoOk": true, "problemas": [] }
```

Quando não está, cada problema vem com a causa e o que fazer:

```json
{ "tudoOk": false,
  "problemas": [
    { "variavel": "DATABASE_URL",
      "causa": "usuario_sem_sufixo_do_projeto",
      "oQueFazer": "Falta o sufixo do projeto no nome do papel: app_user.SEU_PROJECT_REF" } ] }
```

O endereço é público por necessidade — quando o banco não conecta, ninguém consegue entrar para ver
um diagnóstico protegido por login. Por isso a resposta pública é deliberadamente pobre: diz apenas
o que a tela de login já revela, organizado de forma acionável. **Não** devolve host, usuário, senha,
nome de papel, contagem de tabelas nem lista de variáveis de ambiente.

### Detalhe adicional

Para ver o ambiente do build (`production` ou `preview`) e os nomes de variáveis presentes — útil
quando o nome foi digitado errado —, há duas formas:

- **estar autenticado** no painel, ou
- definir uma variável `DIAGNOSTIC_TOKEN` na hospedagem e abrir
  `/api/diagnostico?token=SEU_TOKEN`.

### Depois: os logs, se precisar da mensagem crua

Vá em **Deployments** → clique no deploy → **Runtime Logs** e procure linhas `[db]` ou `[entrar]`:

| Mensagem | Causa | Solução |
|---|---|---|
| `password authentication failed` | senha errada, ou falta o sufixo `.cihsheaiqinrmftjwexu` no usuário | Refaça as três strings do passo 2 |
| `ENOTFOUND` / `ETIMEDOUT` | está usando o host da conexão direta (IPv6) | Troque pelo host do **Transaction pooler** |
| `Tenant or user not found` | o sufixo do projeto está faltando ou errado | O usuário precisa ser `app_user.cihsheaiqinrmftjwexu` |
| `permission denied for table ...` | os papéis não foram criados naquele projeto | Rode o SQL do passo 1 de `docs/deploy-supabase.md` |
| `EAUTHQUERY` / `unsupported or invalid secret format` | o papel tem prazo de validade vencido | `alter role app_user valid until 'infinity';` (idem para os outros dois) |
| `no pg_hba.conf entry ... SSL off` | versão antiga do código, sem TLS | Atualize para o commit mais recente e faça **Redeploy** |

A aplicação liga TLS sozinha para qualquer host que não seja local. Se quiser que o certificado do
servidor seja *verificado* (e não apenas usado para cifrar), defina `DATABASE_SSL_CA` com o
certificado raiz que o Supabase disponibiliza em **Project Settings → Database → SSL Configuration**.

**O build falha.**
Abra o log e procure a primeira linha vermelha. O projeto compila limpo (`npm run build` local),
então quase sempre é variável de ambiente ausente.

**O snippet mostra `localhost:3000`.**
Falta o deploy enxergar o domínio. Confira que você **não** definiu `APP_URL` com um valor errado.
Sem ela, a Vercel informa o domínio sozinha.

**Tudo funciona, mas as telas demoram.**
Confirme em **Settings** → **Functions** que a região é **Washington, D.C. (iad1)**. O `vercel.json`
já pede isso — é a mesma região do seu projeto Supabase, e cada tela faz várias consultas.

---

## Sobre o modo transação do pooler

A documentação do Supabase avisa que o modo transação **não suporta prepared statements nomeados**,
e que é preciso desligá-los na biblioteca de conexão.

Este projeto não precisa de ajuste: o `node-postgres` usa statements *sem nome* nas consultas
parametrizadas, que o pooler aceita. Só haveria problema se alguma consulta passasse a opção `name`
— coisa que o código não faz em lugar nenhum.

Fica o registro para quem for mexer: não adicione `name` às consultas sem antes trocar o pooler
para modo sessão.

---

## O que este deploy NÃO faz

- **Não cria massa fictícia.** A conta do Supabase começa vazia. Os números aparecem conforme a
  coleta acontecer nos sites reais.
- **Não expõe nada com a chave `service_role`.** A aplicação fala Postgres direto, com os três
  papéis. A separação de privilégios é do banco.
- **Não publica automaticamente cada commit da sua branch de trabalho** — só da branch de produção
  configurada. Outras branches viram pré-visualizações com URL própria.
