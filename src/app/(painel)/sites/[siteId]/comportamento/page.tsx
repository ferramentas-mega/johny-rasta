import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarSites, obterSite, ESTADO_LABEL } from '@/server/services/sites';
import { getBehavior, resolvePeriod, type ComportamentoRow } from '@/server/metrics/queries';
import { parsePeriodParams, periodLabel } from '@/lib/periodo';
import { num, pct, dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { Painel, Aviso } from '@/components/Cartoes';
import { SeletorPeriodo, SeletorSiteRota } from '@/components/filtros';

export const dynamic = 'force-dynamic';

/**
 * Comportamento de navegação.
 *
 * Alimentado pelos MESMOS eventos do Desempenho — não há provedor externo
 * envolvido nesta rodada, e por isso nenhum cartão aqui fica esperando
 * credencial para mostrar um traço.
 */

function Barras({ titulo, linhas, total }: { titulo: string; linhas: ComportamentoRow[]; total: number }) {
  const maior = Math.max(1, ...linhas.map((l) => l.sessoes));
  return (
    <div>
      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{titulo}</h3>
      {linhas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Sem dados no período.</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {linhas.map((l) => (
            <li key={l.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
              <span className="mono" style={{ flex: '0 0 86px', color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.rotulo}>
                {l.rotulo}
              </span>
              <span style={{ flex: 1, height: 8, background: 'var(--elev)', borderRadius: 999, overflow: 'hidden' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${(l.sessoes / maior) * 100}%`,
                    background: 'var(--gold)',
                    borderRadius: 999,
                  }}
                />
              </span>
              <span className="mono" style={{ flex: '0 0 96px', textAlign: 'right', color: 'var(--tx)' }}>
                {num(l.sessoes)}
                <span style={{ color: 'var(--tx3)' }}> · {pct(total > 0 ? l.sessoes / total : null, 0)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function PaginaComportamento({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirSessao();
  const { siteId } = await params;
  const busca = await searchParams;

  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();

  const sites = await listarSites(usuario.accountId);
  const entrada = parsePeriodParams({
    periodo: typeof busca.periodo === 'string' ? busca.periodo : null,
    de: typeof busca.de === 'string' ? busca.de : null,
    ate: typeof busca.ate === 'string' ? busca.ate : null,
  });

  const dados = await withAccount(usuario.accountId, async (db) => {
    const bruto = await resolvePeriod(db, site.timezone, entrada);
    const periodo = { ...bruto, label: periodLabel(bruto) };
    const comportamento = await getBehavior(db, site, periodo);
    return { periodo, comportamento };
  });

  const { periodo, comportamento } = dados;
  const totalSessoes = comportamento.dispositivos.reduce((t, d) => t + d.sessoes, 0);

  return (
    <>
      <Cabecalho
        kicker="COMPORTAMENTO"
        titulo={site.name}
        estado={{
          tipo: site.estado,
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento)}` : undefined,
        }}
        meta={`Horários no fuso do site: ${site.timezone}`}
        filtros={
          <>
            <SeletorSiteRota sites={sites} atual={site.id} aba="comportamento" />
            <SeletorPeriodo atual={entrada.key} />
          </>
        }
      />

      <div style={{ padding: '0 32px' }}>
        <Abas siteId={site.id} />
      </div>

      <div className="pagina" style={{ padding: '22px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {totalSessoes === 0 ? (
          <Painel
            titulo="Sem sessões neste período"
            subtitulo={`Situação do rastreamento: ${ESTADO_LABEL[site.estado]}.`}
          >
            <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
              Nenhuma sessão foi registrada na janela selecionada. Experimente um período maior, ou verifique a
              instalação na aba Rastreamento.
            </p>
          </Painel>
        ) : (
          <>
            <div className="grade-cartoes">
              <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--card)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Páginas por sessão</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>
                  {comportamento.paginasPorSessao !== null
                    ? comportamento.paginasPorSessao.toFixed(2).replace('.', ',')
                    : '—'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>média no período</div>
              </div>

              <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--card)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Sessões sem interação</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>
                  {num(comportamento.sessoesDeUmaPagina)}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                  uma página e nenhum clique · {pct(totalSessoes > 0 ? comportamento.sessoesDeUmaPagina / totalSessoes : null, 0)}
                </div>
              </div>

              <div style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--card)' }}>
                <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Sessões analisadas</div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>{num(totalSessoes)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{periodo.label}</div>
              </div>
            </div>

            <div className="grade-dupla">
              <Painel titulo="Profundidade de navegação" subtitulo="Quantas páginas cada sessão percorreu">
                <Barras titulo="" linhas={comportamento.profundidade} total={totalSessoes} />
              </Painel>

              <Painel titulo="Dispositivos" subtitulo="Classificado pela menor dimensão da tela">
                <Barras titulo="" linhas={comportamento.dispositivos} total={totalSessoes} />
              </Painel>
            </div>

            <div className="grade-dupla">
              <Painel titulo="Páginas de entrada" subtitulo="Primeira página de cada sessão">
                <Barras titulo="" linhas={comportamento.entradas} total={totalSessoes} />
              </Painel>

              <Painel titulo="Sessões por hora" subtitulo={`Hora local de ${site.timezone}`}>
                <Barras titulo="" linhas={comportamento.porHora} total={totalSessoes} />
              </Painel>
            </div>
          </>
        )}

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO</Aviso>
          <Aviso>PERÍODO: {periodo.label.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
