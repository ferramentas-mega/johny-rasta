'use client';

import { useActionState, useState } from 'react';
import { entrar, type EstadoLogin } from './acoes';

const ESTADO_INICIAL: EstadoLogin = {};

/**
 * Ícones desenhados aqui, em SVG, em vez de virem de uma biblioteca.
 *
 * O componente de referência importava quatro ícones do `lucide-react`. São
 * quatro traçados; a dependência inteira não se paga por eles, e este é o
 * único lugar do painel que os usa. `aria-hidden` porque cada um acompanha um
 * rótulo de texto — anunciá-los seria repetição para quem usa leitor de tela.
 */
const svg = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function IconeEnvelope() {
  return (
    <svg {...svg}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </svg>
  );
}

function IconeCadeado() {
  return (
    <svg {...svg}>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconeOlho({ aberto }: { aberto: boolean }) {
  return (
    <svg {...svg}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!aberto && <path d="m3 3 18 18" />}
    </svg>
  );
}

function IconeSeta() {
  return (
    <svg {...svg} width={14} height={14}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/**
 * O formulário de login.
 *
 * Separado da página porque ela precisa ser um server component para ler o
 * commit do build (veja `page.tsx`). O comportamento não mudou: a Server Action
 * `entrar` valida, autentica e redireciona.
 *
 * O visual veio de um componente pronto em shadcn/Tailwind/framer-motion. O que
 * foi adotado é a aparência — cartão de vidro, feixes na borda, campos com
 * ícone, botão com estado de espera —, escrita nos tokens do tema
 * (`src/styles/theme.css`, seção "Cartão de vidro").
 *
 * O que NÃO foi adotado, e por quê:
 *
 * - **"Lembrar de mim"** — a sessão tem uma duração só, definida no servidor.
 *   Uma caixa que não muda nada é pior que a ausência dela: promete um
 *   comportamento que não existe.
 * - **"Esqueci minha senha"** — recuperação de senha não está implementada
 *   (veja `CLAUDE.md`). Um link para uma rota inexistente é um 404 disfarçado
 *   de funcionalidade.
 * - **"Entrar com o Google" e "Criar conta"** — não há OAuth, e as contas são
 *   criadas por seed ou SQL. A plataforma é interna.
 *
 * Nenhum dos três é difícil de acrescentar depois. O que não dá é exibi-los
 * antes de existirem.
 */
export function FormularioDeLogin() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL);
  const [senhaVisivel, setSenhaVisivel] = useState(false);

  return (
    <form action={acao} className="cartao-vidro" style={{ marginTop: 18 }}>
      {/* Decorativos: fora da árvore de acessibilidade. */}
      <div className="feixes" aria-hidden="true">
        <span className="feixe feixe-h feixe-topo" />
        <span className="feixe feixe-v feixe-direita" />
        <span className="feixe feixe-h feixe-base" />
        <span className="feixe feixe-v feixe-esquerda" />
      </div>

      {/* O conteúdo sobe acima da trama e dos feixes. */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 'var(--tipo-titulo)', fontWeight: 600 }}>Entrar no painel</h1>
          <p style={{ marginTop: 4, fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
            Acesso restrito à equipe.
          </p>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
          E-mail
          <span className="campo-login">
            <IconeEnvelope />
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="voce@empresa.com"
              required
              autoFocus
            />
          </span>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
          Senha
          <span className="campo-login">
            <IconeCadeado />
            <input
              name="senha"
              // Alternar o `type` preserva o valor digitado: o React mantém o
              // mesmo nó, então trocar de `password` para `text` não limpa o
              // campo nem devolve o foco ao início.
              type={senhaVisivel ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              className="revelar-senha"
              onClick={() => setSenhaVisivel((v) => !v)}
              // Botão sem texto: o nome acessível vem daqui. `aria-pressed`
              // informa o estado atual a quem não vê o ícone mudar.
              aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={senhaVisivel}
            >
              <IconeOlho aberto={senhaVisivel} />
            </button>
          </span>
        </label>

        {estado.erro && (
          <p role="alert" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--neg-tx)' }}>
            {estado.erro}
          </p>
        )}

        <button
          type="submit"
          disabled={pendente}
          style={{
            marginTop: 4,
            cursor: pendente ? 'progress' : 'pointer',
            background: 'var(--gold)',
            color: 'var(--on-gold)',
            border: 'none',
            borderRadius: 'var(--raio-m)',
            padding: '12px 14px',
            fontWeight: 600,
            fontSize: 'var(--tipo-corpo)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
          }}
        >
          {pendente ? (
            <>
              <span className="girando" aria-hidden="true" />
              Verificando…
            </>
          ) : (
            <>
              Entrar
              <IconeSeta />
            </>
          )}
        </button>
      </div>
    </form>
  );
}
