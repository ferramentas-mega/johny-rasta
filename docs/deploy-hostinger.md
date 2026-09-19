# Deploy na Hostinger (hospedagem Node.js)

O painel é um Next.js **com servidor**: precisa de um processo Node rodando `next build` +
`next start`, de um Postgres (o Supabase) e de variáveis de ambiente. A hospedagem
**compartilhada** da Hostinger (hPanel → Git → `public_html`) só copia arquivos e não serve —
o produto certo é a **hospedagem Node.js** (a tela "Configurações e reimplantação" com
Configuração predefinida, Branch, Versão do Node e Comando de construção).

## 1. Compilação

| Campo | Valor |
|---|---|
| Configuração predefinida | Next.js |
| Branch | `claude/busy-hopper-3seo9l` (ou `main`, se renomeou) |
| Versão do Node | 22.x |
| Diretório raiz | `./` |
| Comando de construção | `npm run build` |
| Gerenciador de pacotes | npm |
| Diretório de saída | `.next` |

## 2. Variáveis de ambiente (o passo que faltava)

Sem `DATABASE_URL` e `SESSION_SECRET` o servidor não sobe, e a Hostinger devolve
`ERR_SSL_PROTOCOL_ERROR` no domínio — não há processo atrás dele. Os valores vêm do
[deploy no Supabase](deploy-supabase.md) e dos passos 2 e 3 de [deploy-vercel.md](deploy-vercel.md).

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Transaction pooler do Supabase, papel `app_user.<projeto>`, porta 6543 |
| `DATABASE_URL_INGEST` | idem, papel `app_ingest.<projeto>` |
| `DATABASE_URL_FORMS` | idem, papel `app_forms.<projeto>` |
| `SESSION_SECRET` | 32+ caracteres aleatórios (`openssl rand -base64 32`) |
| `APP_URL` | `https://app.johnyweb.com` — é o endereço que vai no snippet dos clientes |
| `CRON_SECRET` | segredo aleatório; **o mesmo** vai no GitHub (passo 4) |
| `PAGESPEED_API_KEY` | opcional; sem ela a análise técnica fica "não configurada" |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | opcionais; push (`npx web-push generate-vapid-keys`) |

**Não** adicione `DATABASE_URL_ADMIN` (só migração e seed a usam). Depois de salvar as
variáveis: **Salvar e reimplantar** — variável só vale a partir do próximo build.

## 3. Domínio e SSL

O domínio precisa estar atribuído a este aplicativo no hPanel, e o certificado é emitido pela
Hostinger. Se o deploy subiu (o log termina em `next start` ouvindo a porta) e o navegador ainda
acusa SSL, force em **Websites → o domínio → SSL → Instalar**. Conferência rápida:
`https://app.johnyweb.com/api/diagnostico` responde JSON com `commit`, `ambiente` e a lista de
variáveis que faltam.

## 4. Agendamentos (o que a Vercel fazia e a Hostinger não faz)

Os dois crons do `vercel.json` não existem aqui. Quem os substitui é o workflow
`.github/workflows/cron.yml`, que chama `/api/auditorias/agendar` (06:00 UTC) e
`/api/auditorias/processar` (06:30 UTC) com o `CRON_SECRET`. Em **Settings → Secrets and
variables → Actions** do repositório:

- **Variable** `APP_URL` = `https://app.johnyweb.com` (também é o que o `pos-deploy.yml` confere);
- **Secret** `CRON_SECRET` = o mesmo valor da hospedagem.

Sem os dois, o workflow falha com a mensagem dizendo o que falta — não fica mudo.

## 5. Conferir

Depois de cada push, o workflow **Conferir publicação** compara o commit servido em
`APP_URL/api/diagnostico` com o commit enviado. Na Hostinger o commit vem do `git rev-parse` na
hora do build (`next.config.ts`); se o ambiente de build não tiver git, o campo vem `null` e o
workflow acusa em vez de fingir.
