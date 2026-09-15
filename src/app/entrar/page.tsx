import { Marca } from '@/components/Marca';
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
      <div style={{ width: '100%', maxWidth: 380 }}>
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
