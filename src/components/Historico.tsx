import Link from 'next/link';
import { Etiqueta } from '@/components/Tabela';
import { EstadoVazio } from '@/components/EstadoVazio';
import { PaginaDoSinal } from '@/components/PaginaDoSinal';
import { dataHora } from '@/lib/formato';
import { EVENTO_LABEL, EVENTO_TOM, direcao, tendencia, type EventoDeHistorico } from '@/lib/historico';

/**
 * Linha do tempo. Cada item diz quando, em qual site/página, o que aconteceu
 * e — numa medição — a nota contra a anterior do MESMO par. A seta só aparece
 * com base comparável: um ponto não tem direção.
 */
export function Historico({
  eventos,
  comSite = true,
  fuso,
}: {
  eventos: EventoDeHistorico[];
  /** Mostrar o site em cada item (painel do cliente); numa tela de site, não. */
  comSite?: boolean;
  fuso?: string;
}) {
  if (eventos.length === 0) {
    return (
      <EstadoVazio
        icone="relogio"
        titulo="Nenhum acontecimento registrado"
        explicacao="O histórico é derivado do que já foi medido, marcado ou verificado. Ele se preenche com a primeira análise, verificação ou tarefa."
      />
    );
  }

  const t = tendencia(eventos);

  return (
    <div>
      {t.medicoes > 1 && (
        <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)', marginBottom: 'var(--esp-4)' }}>
          Nas {t.medicoes} medições listadas: {t.melhoras} melhoraram e {t.pioras} pioraram contra a
          medição anterior da mesma página e dispositivo. Não é uma nota média — é a contagem das
          direções.
        </p>
      )}
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
        {eventos.map((e, i) => {
          const d = direcao(e);
          return (
            <li
              key={`${e.tipo}-${e.quando.toISOString()}-${e.siteId}-${e.url ?? ''}-${e.dispositivo ?? ''}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(120px, 160px) 1fr',
                gap: 'var(--esp-3)',
                padding: 'var(--esp-3) 0',
                borderTop: '1px solid var(--rowbd)',
              }}
            >
              <span className="mono" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
                {dataHora(e.quando, fuso)}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'flex', gap: 'var(--esp-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Etiqueta texto={EVENTO_LABEL[e.tipo]} tom={EVENTO_TOM[e.tipo]} />
                  {comSite && (
                    <Link href={`/sites/${e.siteId}/qualidade`} style={{ fontSize: 'var(--tipo-apoio)' }}>{e.site}</Link>
                  )}
                  {e.url && <PaginaDoSinal url={e.url} dispositivo={e.dispositivo} />}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--tipo-corpo)', marginTop: 4 }}>
                  {e.titulo}
                  {e.nota !== null && e.notaAnterior !== null && (
                    <span
                      className="mono"
                      style={{
                        marginLeft: 8,
                        fontSize: 'var(--tipo-legenda)',
                        color: d === 'melhora' ? 'var(--pos-tx)' : d === 'piora' ? 'var(--neg-tx)' : 'var(--tx3)',
                      }}
                    >
                      {e.notaAnterior} → {e.nota}
                      {d === 'melhora' ? ' ↑' : d === 'piora' ? ' ↓' : ' ='}
                    </span>
                  )}
                </span>
                {e.detalhe && (
                  <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 2 }}>{e.detalhe}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
