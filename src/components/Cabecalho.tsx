import { CabecalhoFx } from '@/components/CabecalhoFx';
import { Sobrelinha } from '@/components/Sobrelinha';
import { ControlesAparencia } from '@/components/ControlesAparencia';
import { BotaoAtualizar } from '@/components/BotaoAtualizar';
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
  atualizarACada,
}: {
  kicker: string;
  titulo: string;
  estado?: { tipo: EstadoRastreamento; detalhe?: string };
  meta?: string;
  filtros?: React.ReactNode;
  /**
   * Segundos entre atualizações automáticas. Só para telas de ESPERA (o
   * primeiro evento de um site), onde quem olha quer ver o dado chegar. Nas
   * demais o botão existe e a hora dos dados fica à vista, mas nada se move
   * sozinho debaixo do cursor.
   */
  atualizarACada?: number;
}) {
  // Carimbado no render do servidor: é a hora em que ESTES números foram
  // buscados. `router.refresh()` renderiza de novo e o carimbo avança.
  const geradoEm = new Date();

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
          <Sobrelinha>{kicker}</Sobrelinha>
          <h1
            className="mono"
            /* Peso LEVE, e é a mudança de identidade mais visível desta rodada.
               A referência abre com `text-7xl font-extralight tracking-tight
               leading-[1.1]`; aqui o peso cai de 600 para 300 e a trilha fecha.
               A monoespaçada e o verde ficam: muda o peso, não a fonte nem a
               cor. Título de PAINEL continua em 600 — se ele afinasse junto,
               os dois competiriam, e hierarquia é o que sobra quando o peso
               some. */
            style={{
              fontWeight: 'var(--peso-leve)',
              fontSize: 'var(--tipo-display)',
              letterSpacing: 'var(--trilha-justa)',
              lineHeight: 1.1,
              margin: '4px 0 0',
              color: 'var(--tx)',
              textShadow: 'var(--glow)',
              wordBreak: 'break-word',
            }}
          >
            {titulo}
          </h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', marginTop: 6, fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
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
          <BotaoAtualizar geradoEm={geradoEm} aCadaSegundos={atualizarACada} />
          <ControlesAparencia />
        </div>
      </div>
    </header>
  );
}
