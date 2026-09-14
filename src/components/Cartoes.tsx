import Link from 'next/link';
import { Icone, type IconeNome } from '@/components/icones';
import type { Variacao } from '@/lib/formato';

/**
 * Cartão de indicador.
 *
 * Recebe valor e variação já calculados pela camada de métricas. Não faz conta
 * nenhuma: se este componente pudesse calcular, dois cartões poderiam discordar.
 */
export function CartaoIndicador({
  rotulo,
  valor,
  ajuda,
  icone,
  variacao,
  destaque = false,
  href,
}: {
  rotulo: string;
  valor: string;
  ajuda: string;
  icone: IconeNome;
  variacao: Variacao;
  destaque?: boolean;
  href?: string;
}) {
  const cor =
    variacao.tom === 'alta' ? 'var(--pos)' : variacao.tom === 'baixa' ? 'var(--neg)' : 'var(--tx3)';

  const conteudo = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)', fontSize: 13 }}>
        <Icone nome={icone} tamanho={15} />
        <span>{rotulo}</span>
        <span
          title={ajuda}
          aria-label={`Definição: ${ajuda}`}
          tabIndex={0}
          style={{
            marginLeft: 'auto',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1px solid var(--bd)',
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--tx3)',
            cursor: 'help',
            flex: 'none',
          }}
        >
          ?
        </span>
      </div>
      <div
        className="mono"
        style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.01em', margin: '10px 0 6px', color: 'var(--tx)' }}
      >
        {valor}
      </div>
      <div className="mono" style={{ fontSize: 11.5, color: cor }}>
        {variacao.texto}
      </div>
    </>
  );

  const estilo = {
    display: 'block',
    padding: '18px 18px 16px',
    borderRadius: 12,
    border: `1px solid ${destaque ? 'var(--gold)' : 'var(--bdc)'}`,
    background: destaque ? 'linear-gradient(180deg, rgba(112,255,139,.10), var(--card) 62%)' : 'var(--card)',
    textDecoration: 'none',
    color: 'inherit',
  } as const;

  return href ? (
    <Link href={href} style={estilo}>
      {conteudo}
    </Link>
  ) : (
    <div style={estilo}>{conteudo}</div>
  );
}

export function Painel({
  titulo,
  subtitulo,
  kicker,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  kicker?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--bd)',
        borderRadius: 12,
        background: 'var(--card)',
        padding: '18px 18px 20px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          {kicker && (
            <div className="mono" style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--tx3)' }}>
              {kicker}
            </div>
          )}
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: '2px 0 0' }}>{titulo}</h2>
          {subtitulo && <p style={{ fontSize: 12, color: 'var(--tx2)', marginTop: 4 }}>{subtitulo}</p>}
        </div>
        {acoes && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Aviso({ children, tom = 'soft' }: { children: React.ReactNode; tom?: 'soft' | 'ok' | 'warn' }) {
  const fundo = tom === 'ok' ? 'var(--ok-bg)' : tom === 'warn' ? 'var(--warn-bg)' : 'var(--soft-bg)';
  const cor = tom === 'ok' ? 'var(--ok-tx)' : tom === 'warn' ? 'var(--warn-tx)' : 'var(--soft-tx)';
  return (
    <div
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 999,
        background: fundo,
        color: cor,
        fontSize: 11.5,
        letterSpacing: '.03em',
      }}
    >
      {children}
    </div>
  );
}
