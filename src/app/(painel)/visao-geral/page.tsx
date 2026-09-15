import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { getCarteira, totalizarCarteira, type LinhaCarteira } from '@/server/metrics/queries';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { num, pct } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { CartaoProgresso } from '@/components/CartaoProgresso';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { SeletorPeriodo } from '@/components/filtros';
import { BuscaCarteira } from './busca';

export const dynamic = 'force-dynamic';

/** Quantos dias cada chave de período representa, para a consulta da carteira. */
const DIAS: Record<string, number> = { hoje: 1, '7d': 7, '30d': 30, '90d': 90 };

/**
 * Sem um volume mínimo, uma conversão em três sessões vira "33%" e o cliente
 * sobe ao topo da lista. É REGRA DE PRODUTO, não garantia estatística: serve
 * para não exibir classificação enganosa, e está documentada como tal.
 */
const MIN_SESSOES_PARA_COMPARAR = 30;

type Prioridade = { texto: string; tom: 'ok' | 'warn' | 'soft' };

/**
 * Por que este cliente precisa de atenção — com o motivo dito, não um "score"
 * que ninguém consegue auditar.
 */
function prioridade(l: LinhaCarteira): Prioridade {
  if (l.sites === 0) return { texto: 'Sem site cadastrado', tom: 'soft' };
  if (l.sitesComColeta === 0) return { texto: 'Rastreamento pendente', tom: 'warn' };
  if (l.sitesComColeta < l.sites) return { texto: `${l.sites - l.sitesComColeta} site(s) sem coleta`, tom: 'warn' };
  if (l.sessoes < MIN_SESSOES_PARA_COMPARAR) return { texto: 'Volume baixo para comparar', tom: 'soft' };
  if (l.sessoesAnterior > 0 && l.sessoes < l.sessoesAnterior * 0.7) {
    return { texto: 'Queda de sessões', tom: 'warn' };
  }
  if (l.leads === 0) return { texto: 'Sem leads no período', tom: 'warn' };
  return { texto: 'Sem pendência', tom: 'ok' };
}

function Evolucao({ atual, anterior }: { atual: number; anterior: number }) {
  // Base zero não gera crescimento infinito: não há com o que comparar.
  if (anterior === 0) {
    return <span style={{ color: 'var(--tx3)' }}>Sem base</span>;
  }
  const r = (atual - anterior) / anterior;
  const cor = r > 0 ? 'var(--pos)' : r < 0 ? 'var(--neg)' : 'var(--tx2)';
  return <span style={{ color: cor }}>{r > 0 ? '+' : ''}{pct(r)}</span>;
}

export default async function PaginaVisaoGeral({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const ctx = await contextoPainel(await searchParams);
  const params = await searchParams;
  const busca = (typeof params.q === 'string' ? params.q : '').trim().toLowerCase();
  const dias = DIAS[ctx.periodoInput.key] ?? 7;

  const todas = await withAccount(ctx.usuario.accountId, (db) => getCarteira(db, dias));
  const linhas = busca
    ? todas.filter((l) => l.cliente.toLowerCase().includes(busca))
    : todas;
  const totais = totalizarCarteira(linhas);

  const precisamAtencao = linhas.filter((l) => prioridade(l).tom === 'warn').length;

  // Cobertura de configuração: quantos sites da carteira ainda têm recurso
  // escolhido e não verificado. Uma consulta só, e o mapa é indexado por site —
  // a carteira agrega por cliente, então somamos por cliente aqui.
  const resumos = await resumoDeConfiguracao(
    ctx.usuario.accountId,
    ctx.sites.map((s) => s.id),
  );
  const pendentesPorCliente = new Map<string, number>();
  for (const site of ctx.sites) {
    const r = resumos.get(site.id);
    const conta = !r || r.naoIniciado ? 1 : r.pendentes > 0 ? 1 : 0;
    pendentesPorCliente.set(site.clientId, (pendentesPorCliente.get(site.clientId) ?? 0) + conta);
  }
  const sitesPendentes = [...pendentesPorCliente.values()].reduce((t, n) => t + n, 0);

  const colunas: Coluna<LinhaCarteira>[] = [
    {
      chave: 'cliente', titulo: 'Cliente', total: () => 'Total',
      render: (l) => <Link href={`/clientes/${l.clienteId}?periodo=${ctx.periodoInput.key}`}>{l.cliente}</Link>,
    },
    {
      chave: 'sites', titulo: 'Sites', alinhamento: 'direita', mono: true,
      render: (l) => (l.sites === l.sitesComColeta ? num(l.sites) : `${num(l.sitesComColeta)}/${num(l.sites)}`),
      total: () => `${num(totais.sitesComColeta)}/${num(totais.sites)}`,
    },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true,
      render: (l) => num(l.sessoes), total: () => num(totais.sessoes) },
    { chave: 'whatsapp', titulo: 'WhatsApp', alinhamento: 'direita', mono: true,
      render: (l) => num(l.cliquesWhatsapp), total: () => num(totais.cliquesWhatsapp) },
    { chave: 'leads', titulo: 'Leads', alinhamento: 'direita', mono: true,
      render: (l) => num(l.leads), total: () => num(totais.leads) },
    {
      chave: 'conversao', titulo: 'Conversão', alinhamento: 'direita', mono: true,
      render: (l) =>
        l.sessoes === 0
          ? <span style={{ color: 'var(--tx3)' }}>Sem base</span>
          : pct(l.sessoesConvertidasAbs / l.sessoes),
      total: () => (totais.taxaConversao === null ? 'Sem base' : pct(totais.taxaConversao)),
    },
    {
      chave: 'evolucao', titulo: 'Sessões vs. anterior', alinhamento: 'direita', mono: true,
      render: (l) => <Evolucao atual={l.sessoes} anterior={l.sessoesAnterior} />,
    },
    {
      chave: 'configuracao', titulo: 'Configuração',
      ajuda: 'Sites deste cliente com configuração não iniciada ou com recurso escolhido ainda sem verificação.',
      render: (l) => {
        const pendentes = pendentesPorCliente.get(l.clienteId) ?? 0;
        return pendentes === 0
          ? <Etiqueta texto="Sem pendência" tom="ok" />
          : <Link href={`/clientes/${l.clienteId}?periodo=${ctx.periodoInput.key}`}>{pendentes} site(s) →</Link>;
      },
      total: () => (sitesPendentes === 0 ? 'Sem pendência' : `${num(sitesPendentes)} site(s)`),
    },
    {
      chave: 'prioridade', titulo: 'Atenção',
      render: (l) => { const p = prioridade(l); return <Etiqueta texto={p.texto} tom={p.tom} />; },
    },
  ];

  /**
   * Os cartões se dividem em dois tipos, e a divisão não é estética.
   *
   * Recebem ANEL de progresso só os indicadores que são uma razão com
   * denominador real — "quantos dos quantos". Os demais são contagens: desenhar
   * progresso neles exigiria inventar um teto, e um anel em "1.240 sessões"
   * obriga quem olha a perguntar "de quê?".
   */
  const cartoesComRazao = [
    {
      rotulo: 'Sites com coleta',
      valor: totais.sitesComColeta,
      total: totais.sites,
      nota: 'cadastrar não é coletar',
      tom: 'neutro' as const,
    },
    {
      rotulo: 'Configuração concluída',
      valor: totais.sites - sitesPendentes,
      total: totais.sites,
      nota: 'sem recurso escolhido esperando verificação',
      // Âmbar: aqui o que falta é pendência, não só progresso.
      tom: sitesPendentes > 0 ? ('atencao' as const) : ('neutro' as const),
    },
  ];

  const cartoes = [
    { rotulo: 'Clientes', valor: num(totais.clientes), nota: busca ? 'filtrados pela busca' : 'na carteira' },
    { rotulo: 'Sessões', valor: num(totais.sessoes), nota: 'somadas entre os sites' },
    { rotulo: 'Cliques no WhatsApp', valor: num(totais.cliquesWhatsapp), nota: 'clique não é conversa iniciada' },
    { rotulo: 'Leads', valor: num(totais.leads), nota: 'contatos registrados' },
    { rotulo: 'Precisam de atenção', valor: num(precisamAtencao), nota: 'com motivo declarado na tabela' },
  ];

  return (
    <>
      <Cabecalho
        kicker="VISÃO GERAL"
        titulo={ctx.usuario.accountName}
        meta={`${totais.clientes} cliente(s) · ${totais.sites} site(s)`}
        filtros={
          <>
            <BuscaCarteira valor={busca} />
            <SeletorPeriodo atual={ctx.periodoInput.key} />
          </>
        }
      />

      <div className="pagina">
        <div className="grade-cartoes">
          {cartoesComRazao.map((c) => (
            <CartaoProgresso
              key={c.rotulo}
              rotulo={c.rotulo}
              valor={c.valor}
              total={c.total}
              nota={c.nota}
              tom={c.tom}
            />
          ))}
          {cartoes.map((c) => (
            <div key={c.rotulo} style={{ padding: '16px 18px', borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--card)' }}>
              <div style={{ fontSize: 12.5, color: 'var(--tx2)' }}>{c.rotulo}</div>
              <div className="mono" style={{ fontSize: 28, fontWeight: 500, margin: '8px 0 4px' }}>{c.valor}</div>
              <div style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{c.nota}</div>
            </div>
          ))}
        </div>

        <Painel
          titulo="Carteira"
          subtitulo={`Um cliente por linha, somando os sites dele${busca ? ` · busca: "${busca}"` : ''}`}
        >
          <Tabela colunas={colunas} linhas={linhas} vazio={busca ? 'Nenhum cliente com esse nome.' : 'Nenhum cliente cadastrado.'} />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            A conversão da linha Total é a soma das sessões convertidas dividida pela soma das sessões — não a
            média das taxas dos clientes, que daria outro número quando os volumes são diferentes.
            Comparações com menos de {MIN_SESSOES_PARA_COMPARAR} sessões são marcadas como volume baixo: é
            regra deste painel para não exibir classificação enganosa, não garantia estatística.
            Visitantes únicos não são somados entre sites — quem visita dois sites seria contado duas vezes.
          </p>
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO</Aviso>
          <Aviso>PERÍODO: {ctx.periodoInput.key.toUpperCase()}</Aviso>
        </footer>
      </div>
    </>
  );
}
