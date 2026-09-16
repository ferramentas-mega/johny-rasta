import { CabecalhoFx } from '@/components/CabecalhoFx';
import { ControlesAparencia } from '@/components/ControlesAparencia';
import { ESTADO_LABEL, ESTADO_TOM, type EstadoRastreamento } from '@/server/services/sites';

const COR_PONTO = { ok: 'var(--gold)', aguardando: 'var(--warn-tx)', inativo: 'var(--tx3)' } as const;

/**
 * Cabeçalho de página.
 *
 * As animações decorativas ficam concentradas aqui, como pede o briefing — o
 * resto da interface não se move.
 */
export function Cabecalho({
  kicker,
  titulo,
  estado,
  meta,
  filtros,
}: {
  kicker: string;
  titulo: string;
  estado?: { tipo: EstadoRastreamento; detalhe?: string };
  meta?: string;
  filtros?: React.ReactNode;
}) {
  return (
    <header
      className="cabecalho"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--bd)',
        background: 'var(--header-bg)',
      }}
    >
      <CabecalhoFx />
      <i aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderTop: '1px solid var(--gold)', borderLeft: '1px solid var(--gold)', opacity: 0.55 }} />
      <i aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderTop: '1px solid var(--gold)', borderRight: '1px solid var(--gold)', opacity: 0.55 }} />

      <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--gold-tx)' }}>
            {kicker}
          </span>
          <h1
            className="mono"
            style={{ fontWeight: 600, fontSize: 26, lineHeight: 1.2, margin: '2px 0 0', color: 'var(--tx)', textShadow: 'var(--glow)', wordBreak: 'break-word' }}
          >
            {titulo}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 6, fontSize: 12, color: 'var(--tx2)' }}>
            {estado && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <i style={{ width: 7, height: 7, borderRadius: '50%', background: COR_PONTO[ESTADO_TOM[estado.tipo]], display: 'inline-block', flex: 'none' }} />
                {ESTADO_LABEL[estado.tipo]}
                {estado.detalhe && <span style={{ color: 'var(--tx3)' }}>· {estado.detalhe}</span>}
              </span>
            )}
            {meta && <span>{meta}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          {filtros}
          <ControlesAparencia />
        </div>
      </div>
    </header>
  );
}
