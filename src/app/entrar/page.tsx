import { Marca } from '@/components/Marca';
import { ChuvaMatrix } from '@/components/ChuvaMatrix';
import { FormularioDeLogin } from './formulario';
import { descricaoDoBuild } from '@/lib/build';

/**
 * Tela de login.
 *
 * É um server component para poder carimbar o build no rodapé — veja
 * `src/lib/build.ts` para o porquê. O formulário em si é cliente, e mora em
 * `formulario.tsx`.
 */
export default function PaginaEntrar() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'var(--header-bg)',
      }}
    >
      <ChuvaMatrix variante="tela" />

      {/*
        Véu entre a chuva e o formulário. Decorativo e transparente ao ponteiro:
        nunca pode virar uma camada que intercepta o clique no campo de e-mail.
      */}
      <div className="veu-de-fundo" aria-hidden="true" />

      {/*
        `position: relative` + `zIndex: 1` põem o cartão ACIMA do canvas e do
        véu. Sem isso o canvas em tela cheia ficaria por cima do formulário — e
        como ele tem `pointerEvents: none`, o clique até passaria, mas o texto
        ficaria atrás da animação.
      */}
      <div style={{ width: '100%', maxWidth: 380, position: 'relative', zIndex: 1 }}>
        <Marca />
        <FormularioDeLogin />
        <p
          className="mono"
          data-testid="carimbo-do-build"
          style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: 'var(--tx2)' }}
        >
          {descricaoDoBuild()}
        </p>
      </div>
    </main>
  );
}
