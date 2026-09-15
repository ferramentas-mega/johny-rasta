import { num, pct } from '@/lib/formato';

/**
 * Cartão de indicador com anel de progresso.
 *
 * Adaptado de um componente pronto (Tailwind + Framer Motion). O anel e a ideia
 * de "valor contra meta" vieram de lá; o resto mudou, e a mudança que importa é
 * esta:
 *
 * **Só recebe anel o indicador que tem denominador real.**
 *
 * No componente original, qualquer número ganhava barra — e barra sem
 * denominador é um gráfico de uma coisa contra nada. "1.240 sessões" desenhadas
 * em 62% de um anel obrigam quem olha a perguntar "62% de quê?", e a resposta é
 * "de um teto que alguém escolheu". Aqui o denominador é obrigatório na
 * assinatura: `total` não é opcional. Indicador sem razão continua sendo um
 * cartão de número, e é assim que deve ser.
 *
 * Sem `total`, não há progresso — há um número. A tela que precisar de um número
 * usa o cartão comum.
 */

const RAIO = 26;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const ESPESSURA = 6;
const LADO = (RAIO + ESPESSURA) * 2;

export function CartaoProgresso({
  rotulo,
  valor,
  total,
  nota,
  tom = 'neutro',
}: {
  rotulo: string;
  /** Quantos já estão. */
  valor: number;
  /** De quantos. Obrigatório: é o que faz o anel significar alguma coisa. */
  total: number;
  nota: string;
  /**
   * `atencao` pinta o anel de âmbar. Usado quando o que falta é PENDÊNCIA, e não
   * só progresso — a cor precisa dizer se completar é bom ou se faltar é ruim.
   */
  tom?: 'neutro' | 'atencao';
}) {
  // Sem base, não há fração. Não é zero: zero afirmaria "medimos e nenhum está",
  // quando o que há é nada para medir.
  const razao = total > 0 ? Math.min(valor / total, 1) : null;
  const cor = tom === 'atencao' ? 'var(--warn-tx)' : 'var(--gold)';

  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid var(--bd)',
        background: 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>{rotulo}</div>
        <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>
          {num(valor)}
          <span style={{ fontSize: 16, color: 'var(--tx3)' }}>/{num(total)}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{nota}</div>
      </div>

      {/* Decorativo: a razão já está escrita como "valor/total" ao lado, e é
          essa forma que um leitor de tela anuncia. */}
      <svg width={LADO} height={LADO} aria-hidden="true" style={{ flex: 'none' }}>
        <circle
          cx={LADO / 2}
          cy={LADO / 2}
          r={RAIO}
          fill="none"
          stroke="var(--bd)"
          strokeWidth={ESPESSURA}
        />
        {razao !== null && (
          <circle
            cx={LADO / 2}
            cy={LADO / 2}
            r={RAIO}
            fill="none"
            stroke={cor}
            strokeWidth={ESPESSURA}
            strokeLinecap="round"
            strokeDasharray={CIRCUNFERENCIA}
            // Começa às 12h, e não às 3h, porque é de onde se espera que um
            // medidor comece a encher.
            strokeDashoffset={CIRCUNFERENCIA * (1 - razao)}
            transform={`rotate(-90 ${LADO / 2} ${LADO / 2})`}
          />
        )}
        <text
          x={LADO / 2}
          y={LADO / 2 + 4}
          textAnchor="middle"
          className="mono"
          style={{ fontSize: 12, fill: razao === null ? 'var(--tx3)' : 'var(--tx)' }}
        >
          {razao === null ? '—' : pct(razao, 0)}
        </text>
      </svg>
    </div>
  );
}
