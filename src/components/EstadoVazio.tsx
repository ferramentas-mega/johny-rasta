import Link from 'next/link';
import { Icone, type IconeNome } from '@/components/icones';
import { Sobrelinha } from '@/components/Sobrelinha';

/**
 * Estado vazio.
 *
 * Antes era uma frase solta num `<p>`. Uma frase responde "não há nada", e
 * deixa três perguntas abertas: por que não há, se isso é normal, e o que fazer
 * a seguir. Numa ferramenta de operação, tela vazia sem explicação parece
 * defeito — e o suporte recebe a pergunta.
 *
 * O CTA é **opcional de propósito**. A maioria das listas deste painel fica
 * vazia por um motivo legítimo e sem ação possível ("nenhum lead neste site e
 * período"): ali, um botão seria uma porta para lugar nenhum, que é pior que
 * não ter botão. Só recebe ação a tela em que existe um próximo passo real.
 *
 * v2: o vazio tem TOM. `aguardando` (amarelo) é "ainda não chegou nada, e é
 * esperado"; `erro` (vermelho) é "deveria estar chegando e parou". A borda
 * tracejada na cor do tom e o prompt `>_` dizem de longe qual dos dois é —
 * e o `kicker` em caixa-alta nomeia a situação antes do título.
 *
 * Zero continua não sendo isto: zero é "medimos e não houve", e aparece como
 * número. O vazio é a ausência de base para medir.
 */
export type TomDoVazio = 'neutro' | 'aguardando' | 'erro';

const BORDA: Record<TomDoVazio, string> = {
  neutro: 'var(--bd)',
  aguardando: 'var(--warn-tx)',
  erro: 'var(--neg)',
};
const TEXTO: Record<TomDoVazio, string> = {
  neutro: 'var(--tx3)',
  aguardando: 'var(--warn-tx)',
  erro: 'var(--neg)',
};

export function EstadoVazio({
  icone = 'caixa',
  titulo,
  explicacao,
  acao,
  tom = 'neutro',
  kicker,
}: {
  icone?: IconeNome;
  titulo: string;
  explicacao?: string;
  acao?: { rotulo: string; href: string };
  tom?: TomDoVazio;
  /** Sobrelinha caixa-alta que nomeia a situação ("aguardando eventos"). */
  kicker?: string;
}) {
  return (
    <div
      data-tom={tom}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--esp-3)',
        padding: 'var(--esp-7) var(--esp-4)',
        border: `1px dashed ${BORDA[tom]}`,
        borderRadius: 'var(--raio-g)',
      }}
    >
      {/* Ladrilho, o mesmo do cartão de indicador: o vazio pertence ao sistema,
          não é uma tela de erro. Decorativo — o título já diz o que é. Com tom,
          vira o prompt `>_` do console, na cor da situação. */}
      <span
        aria-hidden="true"
        className={tom === 'neutro' ? undefined : 'mono'}
        style={{
          width: 38,
          height: 38,
          borderRadius: 'var(--raio-p)',
          background: 'var(--soft-bg)',
          border: `1px solid ${tom === 'neutro' ? 'var(--bd)' : BORDA[tom]}`,
          color: TEXTO[tom],
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--tipo-corpo)',
          fontWeight: 'var(--peso-forte)',
        }}
      >
        {tom === 'neutro' ? <Icone nome={icone} tamanho={18} /> : '>_'}
      </span>

      <div style={{ maxWidth: 380 }}>
        {kicker && (
          <div style={{ marginBottom: 'var(--esp-1)', color: TEXTO[tom] }}>
            <Sobrelinha tom="discreto">
              <span style={{ color: 'inherit' }}>{kicker}</span>
            </Sobrelinha>
          </div>
        )}
        <p style={{ fontSize: 'var(--tipo-corpo)', color: 'var(--tx)', fontWeight: 'var(--peso-medio)' }}>
          {titulo}
        </p>
        {explicacao && (
          <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx3)', marginTop: 'var(--esp-1)', lineHeight: 1.6 }}>
            {explicacao}
          </p>
        )}
      </div>

      {acao && (
        <Link
          href={acao.href}
          style={{
            fontSize: 'var(--tipo-apoio)',
            padding: 'var(--esp-2) var(--esp-4)',
            minHeight: 44,
            display: 'inline-flex',
            alignItems: 'center',
            borderRadius: 'var(--raio-pilula)',
            border: '1px solid var(--gold-bd)',
            background: 'var(--ok-bg)',
            color: 'var(--gold-tx)',
            textDecoration: 'none',
          }}
        >
          {acao.rotulo}
        </Link>
      )}
    </div>
  );
}
