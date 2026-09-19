import { CabecalhoFx } from '@/components/CabecalhoFx';
import { Sobrelinha } from '@/components/Sobrelinha';
import { ControlesAparencia } from '@/components/ControlesAparencia';
import { BotaoAtualizar } from '@/components/BotaoAtualizar';
import { SinoAvisos } from '@/components/SinoAvisos';
import { ESTADO_LABEL, ESTADO_TOM, type EstadoRastreamento } from '@/server/services/sites';

const COR_PONTO = { ok: 'var(--c1)', aguardando: 'var(--c3)', inativo: 'var(--c5)' } as const;

/**
 * Cabeçalho de página — v2: UMA linha, fixa no topo, translúcida.
 *
 * Na linha: título (com reticências, nunca quebra), ponto de status pulsando
 * com o nome do estado, e as ações (filtros da tela, atualizar, sino, e —
 * só no celular — tema e efeitos, que no desktop vivem no rodapé do menu).
 *
 * O que não cabe numa linha desce para o `sub-cabecalho`, no topo do conteúdo
 * rolável: o kicker da seção e a linha de meta (fuso, contagens). É informação
 * de contexto, não de identidade — não precisa ficar fixa.
 *
 * O título leva gradiente recortado no texto, e por isso NÃO leva mais o
 * `--glow`: brilho e recorte de fundo não convivem no mesmo elemento.
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
    <>
      <header className="cabecalho" style={{ overflow: 'hidden', borderBottom: '1px solid var(--bd)' }}>
        <CabecalhoFx />
        <i aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, width: 22, height: 22, borderTop: '1px solid var(--gold)', borderLeft: '1px solid var(--gold)', opacity: 0.55 }} />
        <i aria-hidden="true" style={{ position: 'absolute', top: 0, right: 0, width: 22, height: 22, borderTop: '1px solid var(--gold)', borderRight: '1px solid var(--gold)', opacity: 0.55 }} />

        <div className="cabecalho-linha">
          <div className="cabecalho-titulo">
            <h1
              className="mono"
              title={titulo}
              style={{
                fontWeight: 'var(--peso-leve)',
                fontSize: 'var(--tipo-display)',
                letterSpacing: 'var(--trilha-justa)',
                lineHeight: 1.1,
              }}
            >
              {titulo}
            </h1>
            {estado && (
              <span className="cabecalho-status" title={estado.detalhe}>
                <i className="ponto-status" style={{ background: COR_PONTO[ESTADO_TOM[estado.tipo]], color: COR_PONTO[ESTADO_TOM[estado.tipo]] }} />
                <span className="cabecalho-status-texto">{ESTADO_LABEL[estado.tipo]}</span>
              </span>
            )}
          </div>

          <div className="cabecalho-acoes">
            {filtros}
            <BotaoAtualizar geradoEm={geradoEm} aCadaSegundos={atualizarACada} />
            <SinoAvisos />
            <ControlesAparencia />
          </div>
        </div>
      </header>

      <div className="sub-cabecalho">
        <Sobrelinha>{kicker}</Sobrelinha>
        {estado?.detalhe && <span style={{ color: 'var(--tx3)' }}>{estado.detalhe}</span>}
        {meta && <span>{meta}</span>}
      </div>
    </>
  );
}
