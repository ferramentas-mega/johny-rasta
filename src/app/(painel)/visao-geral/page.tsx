import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { getKpis } from '@/server/metrics/queries';
import { ESTADO_LABEL, ESTADO_TOM } from '@/server/services/sites';
import { num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { SeletorPeriodo } from '@/components/filtros';

export const dynamic = 'force-dynamic';

type LinhaSite = {
  id: string;
  nome: string;
  cliente: string;
  estado: keyof typeof ESTADO_LABEL;
  sessoes: number | null;
  leads: number | null;
};

export default async function PaginaVisaoGeral({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const ctx = await contextoPainel(await searchParams);

  if (!ctx.site || !ctx.periodo) {
    return (
      <>
        <Cabecalho kicker="VISÃO GERAL" titulo="Nenhum site cadastrado" />
        <div style={{ padding: '22px 32px' }}>
          <Painel titulo="Comece cadastrando um cliente e um site" subtitulo="Sem site cadastrado não há o que medir.">
            <Link href="/clientes">Ir para Clientes →</Link>
          </Painel>
        </div>
      </>
    );
  }

  const periodo = ctx.periodo;

  // Um agregado por site: os mesmos números que cada tela de site mostraria.
  const linhas: LinhaSite[] = await withAccount(ctx.usuario.accountId, async (db) => {
    const resultado: LinhaSite[] = [];
    for (const site of ctx.sites) {
      if (site.totalEventos === 0) {
        resultado.push({ id: site.id, nome: site.name, cliente: site.clienteNome, estado: site.estado, sessoes: null, leads: null });
        continue;
      }
      const kpis = await getKpis(db, site, periodo);
      resultado.push({
        id: site.id, nome: site.name, cliente: site.clienteNome, estado: site.estado,
        sessoes: kpis.atual.sessoes, leads: kpis.atual.leads,
      });
    }
    return resultado;
  });

  const totalSessoes = linhas.reduce((t, l) => t + (l.sessoes ?? 0), 0);
  const totalLeads = linhas.reduce((t, l) => t + (l.leads ?? 0), 0);
  const comEventos = linhas.filter((l) => l.sessoes !== null).length;

  const colunas: Coluna<LinhaSite>[] = [
    { chave: 'site', titulo: 'Site', render: (l) => <Link href={`/sites/${l.id}/desempenho?periodo=${ctx.periodoInput.key}`}>{l.nome}</Link>, total: () => 'Total' },
    { chave: 'cliente', titulo: 'Cliente', render: (l) => l.cliente },
    { chave: 'estado', titulo: 'Situação', render: (l) => (
        <Etiqueta texto={ESTADO_LABEL[l.estado]} tom={ESTADO_TOM[l.estado] === 'ok' ? 'ok' : ESTADO_TOM[l.estado] === 'aguardando' ? 'warn' : 'soft'} />
      ) },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true,
      render: (l) => (l.sessoes === null ? <span style={{ color: 'var(--tx3)' }}>Indisponível</span> : num(l.sessoes)),
      total: () => num(totalSessoes) },
    { chave: 'leads', titulo: 'Leads', alinhamento: 'direita', mono: true,
      render: (l) => (l.leads === null ? <span style={{ color: 'var(--tx3)' }}>Indisponível</span> : num(l.leads)),
      total: () => num(totalLeads) },
  ];

  const resumo = [
    { rotulo: 'Sites cadastrados', valor: num(ctx.sites.length), nota: `em ${ctx.clientes.length} cliente(s)` },
    { rotulo: 'Com eventos no período', valor: num(comEventos), nota: 'os demais aguardam instalação' },
    { rotulo: 'Sessões no período', valor: num(totalSessoes), nota: 'somadas entre os sites' },
    { rotulo: 'Leads no período', valor: num(totalLeads), nota: 'somados entre os sites' },
  ];

  return (
    <>
      <Cabecalho
        kicker="VISÃO GERAL"
        titulo={ctx.usuario.accountName}
        meta={`${ctx.sites.length} site(s) · ${periodo.label}`}
        filtros={<SeletorPeriodo atual={ctx.periodoInput.key} />}
      />

      <div className="pagina" style={{ padding: '22px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div className="grade-cartoes">
          {resumo.map((c) => (
            <div key={c.rotulo} style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--card)' }}>
              <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>{c.rotulo}</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>{c.valor}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{c.nota}</div>
            </div>
          ))}
        </div>

        <Painel titulo="Sites monitorados" subtitulo={`Resumo dos sites da conta · ${periodo.label}`}>
          <Tabela colunas={colunas} linhas={linhas} vazio="Nenhum site cadastrado." />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Sites sem rastreamento instalado não têm histórico: aparecem como "Indisponível", nunca como zero
            estimado. Zero significaria "medimos e não houve" — não é o caso.
          </p>
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO</Aviso>
          <Aviso>PERÍODO: {periodo.label.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
