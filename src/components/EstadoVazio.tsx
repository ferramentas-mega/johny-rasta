import Link from 'next/link';
import { Icone, type IconeNome } from '@/components/icones';

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
 */
export function EstadoVazio({
  icone = 'caixa',
  titulo,
  explicacao,
  acao,
}: {
  icone?: IconeNome;
  titulo: string;
  explicacao?: string;
  acao?: { rotulo: string; href: string };
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 'var(--esp-3)',
        padding: 'var(--esp-7) var(--esp-4)',
      }}
    >
      {/* Ladrilho, o mesmo do cartão de indicador: o vazio pertence ao sistema,
          não é uma tela de erro. Decorativo — o título já diz o que é. */}
      <span
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          borderRadius: 'var(--raio-p)',
          background: 'var(--soft-bg)',
          border: '1px solid var(--bd)',
          color: 'var(--tx3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icone nome={icone} tamanho={18} />
      </span>

      <div style={{ maxWidth: 380 }}>
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
