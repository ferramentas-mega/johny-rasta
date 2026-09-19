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
import { SeletorSiteRota } from '@/components/filtros';
import { EstadoVazio } from '@/components/EstadoVazio';

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
      <h3 style={{ fontSize: 'var(--tipo-corpo)', fontWeight: 600, marginBottom: 12 }}>{titulo}</h3>
      {linhas.length === 0 ? (
        <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>Sem dados no período.</p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 9 }}>
          {linhas.map((l) => (
            <li key={l.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 'var(--tipo-apoio)' }}>
              <span className="mono" style={{ flex: '0 0 86px', color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.rotulo}>
                {l.rotulo}
              </span>
              <span style={{ flex: 1, height: 8, background: 'var(--elev)', borderRadius: 'var(--raio-pilula)', overflow: 'hidden' }}>
                <span
                  style={{
                    display: 'block',
                    height: '100%',
                    width: `${(l.sessoes / maior) * 100}%`,
                    background: 'var(--gold)',
                    borderRadius: 'var(--raio-pilula)',
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
  // Vem da consulta, e não de somar os dispositivos na tela: o numerador das
  // porcentagens já vinha de lá, e reconstruir o denominador aqui era manter
  // duas contas que ninguém garante que continuam iguais.
  const totalSessoes = comportamento.sessoes;

  return (
    <>
      <Cabecalho
        kicker="COMPORTAMENTO"
        titulo={site.name}
        estado={{
          tipo: site.estado,
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento, site.timezone)}` : undefined,
        }}
        meta={`Horários no fuso do site: ${site.timezone}`}
        filtros={<SeletorSiteRota sites={sites} atual={site.id} aba="comportamento" />}
      />

      <div className="abas">
        <Abas siteId={site.id} />
      </div>

      <div className="pagina">
        {totalSessoes === 0 ? (
          // Site que coleta e só não teve sessão na janela é vazio NEUTRO —
          // período curto num site pequeno é normal. Sem instalação é vermelho;
          // instalado e sem evento real, amarelo.
          <EstadoVazio
            tom={site.estado === 'coletando' ? 'neutro' : site.estado === 'aguardando_instalacao' ? 'erro' : 'aguardando'}
            kicker={ESTADO_LABEL[site.estado]}
            icone="cursor"
            titulo="Sem sessões neste período"
            explicacao="Nenhuma sessão foi registrada na janela selecionada. Experimente um período maior, ou verifique a instalação na aba Rastreamento."
            acao={site.estado === 'coletando' ? undefined : { rotulo: 'Verificar a instalação', href: `/sites/${site.id}/rastreamento` }}
          />
        ) : (
          <>
            <div className="grade-cartoes">
              <div className="cartao" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>Páginas por sessão</div>
                <div className="mono" style={{ fontSize: 'var(--tipo-display)', fontWeight: 500, margin: '8px 0 4px' }}>
                  {comportamento.paginasPorSessao !== null
                    ? comportamento.paginasPorSessao.toFixed(2).replace('.', ',')
                    : '—'}
                </div>
                <div style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>média no período</div>
              </div>

              <div className="cartao" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>Sessões sem interação</div>
                <div className="mono" style={{ fontSize: 'var(--tipo-display)', fontWeight: 500, margin: '8px 0 4px' }}>
                  {num(comportamento.sessoesDeUmaPagina)}
                </div>
                <div style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
                  uma página e nenhum clique · {pct(totalSessoes > 0 ? comportamento.sessoesDeUmaPagina / totalSessoes : null, 0)}
                </div>
              </div>

              <div className="cartao" style={{ padding: '16px 18px' }}>
                <div style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>Sessões analisadas</div>
                <div className="mono" style={{ fontSize: 'var(--tipo-display)', fontWeight: 500, margin: '8px 0 4px' }}>{num(totalSessoes)}</div>
                <div style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{periodo.label}</div>
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
