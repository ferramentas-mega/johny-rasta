import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarSites } from '@/server/services/sites';
import { getKpis, resolvePeriod } from '@/server/metrics/queries';
import { ESTADO_LABEL, ESTADO_TOM } from '@/server/services/sites';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { listarOtimizacoes, STATUS_LABEL, TIPO_LABEL, type Otimizacao } from '@/server/qualidade/otimizacoes';
import { listarTarefas } from '@/server/services/tarefas';
import { listarHistorico } from '@/server/services/historico';
import { Historico } from '@/components/Historico';
import { TabelaDeTarefas } from '@/components/TabelaDeTarefas';
import { num, pct, dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso, CartaoNumero } from '@/components/Cartoes';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { PaginaDoSinal, SiteInteiro } from '@/components/PaginaDoSinal';
import { SeletorPeriodo } from '@/components/filtros';
import { parsePeriodParams, type PeriodKey } from '@/lib/periodo';

export const dynamic = 'force-dynamic';

type LinhaSite = {
  id: string;
  nome: string;
  dominio: string;
  estado: keyof typeof ESTADO_LABEL;
  sessoes: number | null;
  whatsapp: number | null;
  formularios: number | null;
  leads: number | null;
  convertidas: number | null;
};

/**
 * Painel do cliente: os sites dele, com os MESMOS números que cada tela de site
 * mostra — porque saem da mesma função (`getKpis`). Se divergissem, o usuário
 * veria um total aqui e outro ao abrir o site, sem saber qual acreditar.
 */
export default async function PaginaCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { clienteId } = await params;
  const busca = await searchParams;
  const usuario = await exigirSessao();
  const periodoInput = parsePeriodParams({
    periodo: typeof busca.periodo === 'string' ? busca.periodo : undefined,
    de: typeof busca.de === 'string' ? busca.de : undefined,
    ate: typeof busca.ate === 'string' ? busca.ate : undefined,
  });

  // A RLS já limita à conta da sessão; um id de outra conta simplesmente não
  // devolve site nenhum, e a tela responde 404 em vez de vazar existência.
  const sites = await listarSites(usuario.accountId, clienteId);
  if (sites.length === 0) notFound();
  const cliente = sites[0]!.clienteNome;

  // Uma consulta para todos os sites do cliente, não uma por linha.
  const resumos = await resumoDeConfiguracao(usuario.accountId, sites.map((s) => s.id));

  const linhas: LinhaSite[] = await withAccount(usuario.accountId, async (db) => {
    const saida: LinhaSite[] = [];
    for (const site of sites) {
      const base = {
        id: site.id, nome: site.name, dominio: site.domain, estado: site.estado,
      };
      if (site.totalEventos === 0) {
        saida.push({ ...base, sessoes: null, whatsapp: null, formularios: null, leads: null, convertidas: null });
        continue;
      }
      const periodo = await resolvePeriod(db, site.timezone, periodoInput);
      const k = await getKpis(db, site, periodo);
      saida.push({
        ...base,
        sessoes: k.atual.sessoes,
        whatsapp: k.atual.cliquesWhatsapp,
        formularios: k.atual.formularios,
        leads: k.atual.leads,
        convertidas: k.atual.sessoesConvertidasAbs,
      });
    }
    return saida;
  });

  /**
   * Problemas do cliente: os MESMOS sinais da tela de Otimizações, recortados
   * pelos sites dele. A definição é uma só (`SINAIS_SQL`); aqui só se filtra.
   * A consulta varre a conta inteira e o filtro fica em memória de propósito:
   * parametrizar o SQL por cliente criaria uma segunda versão da definição.
   */
  const idsDoCliente = new Set(sites.map((s) => s.id));
  const { sinais, tarefas, historico } = await withAccount(usuario.accountId, async (db) => ({
    sinais: await listarOtimizacoes(db),
    tarefas: await listarTarefas(db, { apenasAbertas: true, siteIds: [...idsDoCliente] }),
    historico: await listarHistorico(db, { siteIds: [...idsDoCliente], limite: 40 }),
  }));
  const problemas: Otimizacao[] = sinais.filter((o) => idsDoCliente.has(o.siteId));

  const soma = (f: (l: LinhaSite) => number | null) => linhas.reduce((t, l) => t + (f(l) ?? 0), 0);
  const sessoes = soma((l) => l.sessoes);
  const convertidas = soma((l) => l.convertidas);
  // Σ numeradores ÷ Σ denominadores. Média das taxas dos sites daria outro número.
  const taxa = sessoes > 0 ? convertidas / sessoes : null;

  const indisponivel = <span style={{ color: 'var(--tx3)' }}>Indisponível</span>;
  const colunas: Coluna<LinhaSite>[] = [
    {
      chave: 'site', titulo: 'Site', total: () => 'Total',
      render: (l) => (
        <Link href={`/sites/${l.id}/desempenho?periodo=${periodoInput.key}`}>
          {l.nome}
          <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{l.dominio}</span>
        </Link>
      ),
    },
    { chave: 'estado', titulo: 'Rastreamento',
      render: (l) => <Etiqueta texto={ESTADO_LABEL[l.estado]} tom={ESTADO_TOM[l.estado] === 'ok' ? 'ok' : ESTADO_TOM[l.estado] === 'aguardando' ? 'warn' : 'soft'} /> },
    { chave: 'configuracao', titulo: 'Configuração',
      ajuda: 'Recursos escolhidos para este site que ainda não passaram por verificação.',
      render: (l) => {
        const r = resumos.get(l.id);
        if (!r || r.naoIniciado) {
          return <Link href={`/sites/${l.id}/configurar`}>Configurar →</Link>;
        }
        if (r.pendentes > 0) {
          return <Link href={`/sites/${l.id}/configurar`}>{r.pendentes} pendência(s) →</Link>;
        }
        return <Etiqueta texto="Verificada" tom="ok" />;
      } },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true,
      render: (l) => (l.sessoes === null ? indisponivel : num(l.sessoes)), total: () => num(sessoes) },
    { chave: 'whatsapp', titulo: 'WhatsApp', alinhamento: 'direita', mono: true,
      render: (l) => (l.whatsapp === null ? indisponivel : num(l.whatsapp)), total: () => num(soma((l) => l.whatsapp)) },
    { chave: 'formularios', titulo: 'Formulários', alinhamento: 'direita', mono: true,
      render: (l) => (l.formularios === null ? indisponivel : num(l.formularios)), total: () => num(soma((l) => l.formularios)) },
    { chave: 'leads', titulo: 'Leads', alinhamento: 'direita', mono: true,
      render: (l) => (l.leads === null ? indisponivel : num(l.leads)), total: () => num(soma((l) => l.leads)) },
    { chave: 'conversao', titulo: 'Sessões convertidas', alinhamento: 'direita', mono: true,
      render: (l) => (l.sessoes === null || l.sessoes === 0 ? <span style={{ color: 'var(--tx3)' }}>Sem base</span> : pct((l.convertidas ?? 0) / l.sessoes)),
      total: () => (taxa === null ? 'Sem base' : pct(taxa)) },
  ];

  const TOM_TIPO: Record<string, 'ok' | 'warn' | 'soft'> = {
    tecnico: 'warn', comercial: 'warn', coleta: 'warn', atualizacao: 'soft',
  };
  const colunasProblemas: Coluna<Otimizacao>[] = [
    {
      chave: 'site', titulo: 'Site',
      render: (o) => <Link href={`/sites/${o.siteId}/qualidade`}>{o.site}</Link>,
    },
    {
      chave: 'pagina', titulo: 'Página',
      render: (o) => (o.url ? <PaginaDoSinal url={o.url} dispositivo={o.dispositivo} /> : <SiteInteiro />),
    },
    { chave: 'tipo', titulo: 'Tipo', render: (o) => <Etiqueta texto={TIPO_LABEL[o.tipo]} tom={TOM_TIPO[o.tipo] ?? 'soft'} /> },
    { chave: 'problema', titulo: 'Problema', quebraLinha: true, render: (o) => o.titulo },
    {
      chave: 'situacao', titulo: 'Situação',
      render: (o) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Etiqueta texto={STATUS_LABEL[o.status] ?? o.status} tom={o.status === 'pendente' ? 'warn' : 'soft'} />
          <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>desde {dataHora(o.detectadoEm)}</span>
        </span>
      ),
    },
  ];

  const cartoes: { rotulo: string; valor: string; nota: string; tom?: 'neutro' | 'atencao' }[] = [
    { rotulo: 'Sites do cliente', valor: num(sites.length), nota: `${linhas.filter((l) => l.sessoes !== null).length} com coleta` },
    { rotulo: 'Sessões', valor: num(sessoes), nota: 'somadas entre os sites' },
    { rotulo: 'Cliques no WhatsApp', valor: num(soma((l) => l.whatsapp)), nota: 'clique não é conversa iniciada' },
    { rotulo: 'Leads', valor: num(soma((l) => l.leads)), nota: 'contatos registrados' },
    // Zero aqui é afirmação: os sinais foram derivados e nenhum casou com um
    // site deste cliente. É diferente de "não olhamos".
    {
      rotulo: 'Problemas em aberto', valor: num(problemas.length),
      nota: problemas.length === 0 ? 'nenhum sinal derivado para os sites deste cliente' : 'sinais derivados, não declarados',
      tom: problemas.length > 0 ? 'atencao' : 'neutro',
    },
    {
      rotulo: 'Tarefas abertas', valor: num(tarefas.length),
      nota: tarefas.length === 0 ? 'nenhuma decisão pendente' : 'o que alguém decidiu fazer',
    },
  ];

  return (
    <>
      <Cabecalho
        kicker="CLIENTE"
        titulo={cliente}
        meta={`${sites.length} site(s)`}
        filtros={<SeletorPeriodo atual={periodoInput.key as PeriodKey} />}
      />

      <div className="pagina">
        <p style={{ fontSize: 'var(--tipo-apoio)' }}>
          <Link href={`/visao-geral?periodo=${periodoInput.key}`} style={{ color: 'var(--tx2)' }}>← Voltar para a carteira</Link>
        </p>

        <div className="grade-cartoes">
          {cartoes.map((c) => (
            <CartaoNumero key={c.rotulo} rotulo={c.rotulo} valor={c.valor} nota={c.nota} tom={c.tom} />
          ))}
        </div>

        <Painel
          titulo="Problemas em aberto"
          subtitulo="Os mesmos sinais da tela de Otimizações, só os deste cliente"
          acoes={
            problemas.length > 0 ? (
              <Link href="/otimizacoes" style={{ fontSize: 'var(--tipo-apoio)' }}>
                Acompanhar em Otimizações →
              </Link>
            ) : undefined
          }
        >
          <Tabela
            colunas={colunasProblemas}
            linhas={problemas}
            vazio={
              <EstadoVazio
                icone="tendencia"
                titulo="Nenhum problema derivado para este cliente"
                explicacao="Um sinal aparece aqui quando uma medição o sustenta: nota técnica baixa numa URL monitorada, análise vencida ou coleta interrompida num site que já coletava."
              />
            }
          />
        </Painel>

        <Painel titulo="Tarefas abertas" subtitulo="Concluir oferece a reanálise; a medição é quem fecha o problema">
          <TabelaDeTarefas tarefas={tarefas} comCliente={false} />
        </Painel>

        <Painel titulo="Sites" subtitulo="Os mesmos números que a tela de cada site mostra">
          <Tabela
            colunas={colunas}
            linhas={linhas}
            vazio={
              <EstadoVazio
                icone="globo"
                titulo="Este cliente não tem site cadastrado"
                explicacao="Sem site, não há o que medir: sessões, leads e qualidade técnica pertencem a um site."
                acao={{ rotulo: 'Cadastrar site', href: '/sites' }}
              />
            }
          />
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            Site sem rastreamento instalado aparece como "Indisponível", nunca como zero — zero afirmaria que
            medimos e não houve. A taxa do Total é a soma das sessões convertidas dividida pela soma das
            sessões, não a média das taxas dos sites.
          </p>
        </Painel>

        <Painel
          titulo="Histórico"
          subtitulo="Os 40 acontecimentos mais recentes nos sites deste cliente — derivados, não registrados à mão"
          acoes={<Link href={`/clientes/${clienteId}/relatorio?periodo=${periodoInput.key}`} style={{ fontSize: 'var(--tipo-apoio)' }}>Relatório do cliente →</Link>}
        >
          <Historico eventos={historico} />
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO</Aviso>
        </footer>
      </div>
    </>
  );
}
