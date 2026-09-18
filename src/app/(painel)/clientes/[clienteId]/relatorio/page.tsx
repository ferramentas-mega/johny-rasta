import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarSites } from '@/server/services/sites';
import { getKpis, resolvePeriod } from '@/server/metrics/queries';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { listarOtimizacoes } from '@/server/qualidade/otimizacoes';
import { listarTarefas } from '@/server/services/tarefas';
import { listarHistorico } from '@/server/services/historico';
import { saudeDoSite, agregarSaude, SAUDE_LABEL, SAUDE_TOM } from '@/lib/saude';
import { num, pct, dataHora } from '@/lib/formato';
import { periodLabel, parsePeriodParams, type PeriodKey } from '@/lib/periodo';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso, CartaoNumero } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { PaginaDoSinal, SiteInteiro } from '@/components/PaginaDoSinal';
import { Historico } from '@/components/Historico';
import { SeletorPeriodo } from '@/components/filtros';
import { BotaoImprimir } from '@/components/BotaoImprimir';

export const dynamic = 'force-dynamic';

type LinhaSite = {
  id: string; nome: string; dominio: string;
  saude: ReturnType<typeof saudeDoSite>;
  sessoes: number | null; leads: number | null; whatsapp: number | null; convertidas: number | null;
  sessoesAnterior: number | null;
  problemas: number;
};

/**
 * Relatório do cliente: o período, a saúde, os números que importam, o que
 * foi encontrado, o que foi resolvido e o que ainda pede ação — tudo saído das
 * MESMAS funções das telas (`getKpis`, `SINAIS_SQL`, `saudeDoSite`,
 * `listarHistorico`). Um relatório com fonte própria discordaria do painel na
 * primeira correção feita só num dos dois.
 *
 * Não há PDF gerado no servidor: o botão imprime a página com o CSS de
 * impressão. O documento é a tela — o que se vê é o que se envia.
 */
export default async function PaginaRelatorio({
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

  const sites = await listarSites(usuario.accountId, clienteId);
  if (sites.length === 0) notFound();
  const cliente = sites[0]!.clienteNome;
  const ids = sites.map((s) => s.id);

  const resumos = await resumoDeConfiguracao(usuario.accountId, ids);

  const { linhas, sinais, tarefas, historico, rotuloPeriodo, periodoDe, periodoAte } = await withAccount(usuario.accountId, async (db) => {
    const sinais = (await listarOtimizacoes(db)).filter((o) => ids.includes(o.siteId));
    const tarefas = await listarTarefas(db, { siteIds: ids });
    const historico = await listarHistorico(db, { siteIds: ids, limite: 200 });

    const linhas: LinhaSite[] = [];
    let rotuloPeriodo = '';
    let periodoDe: Date | null = null;
    let periodoAte: Date | null = null;
    for (const site of sites) {
      const periodo = await resolvePeriod(db, site.timezone, periodoInput);
      if (!rotuloPeriodo) { rotuloPeriodo = periodLabel(periodo); periodoDe = periodo.from; periodoAte = periodo.to; }
      const doSite = sinais.filter((o) => o.siteId === site.id);
      const saude = saudeDoSite({ totalEventos: site.totalEventos, estado: site.estado, resumo: resumos.get(site.id), sinais: doSite });
      const base = { id: site.id, nome: site.name, dominio: site.domain, saude, problemas: doSite.filter((o) => o.status !== 'resolvida_manual').length };
      if (site.totalEventos === 0) {
        linhas.push({ ...base, sessoes: null, leads: null, whatsapp: null, convertidas: null, sessoesAnterior: null });
        continue;
      }
      const k = await getKpis(db, site, periodo);
      linhas.push({
        ...base,
        sessoes: k.atual.sessoes, leads: k.atual.leads, whatsapp: k.atual.cliquesWhatsapp,
        convertidas: k.atual.sessoesConvertidasAbs, sessoesAnterior: k.anterior.sessoes,
      });
    }
    return { linhas, sinais, tarefas, historico, rotuloPeriodo, periodoDe, periodoAte };
  });

  const noPeriodo = (d: Date) => (!periodoDe || d >= periodoDe) && (!periodoAte || d < periodoAte);
  const resolvidosNoPeriodo = historico.filter((e) => e.tipo === 'problema_resolvido' && noPeriodo(e.quando));
  const tarefasConcluidas = tarefas.filter((t) => t.status === 'concluida' && t.concluidaEm && noPeriodo(t.concluidaEm));
  const tarefasAbertas = tarefas.filter((t) => t.status === 'aberta' || t.status === 'em_andamento');
  const medicoesNoPeriodo = historico.filter((e) => e.tipo === 'analise' && noPeriodo(e.quando));
  const saudeCliente = agregarSaude(linhas.map((l) => l.saude.saude));
  const pedemAtencao = linhas.filter((l) => l.saude.saude === 'critico' || l.saude.saude === 'atencao');

  const soma = (f: (l: LinhaSite) => number | null) => linhas.reduce((t, l) => t + (f(l) ?? 0), 0);
  const sessoes = soma((l) => l.sessoes);
  const sessoesAnterior = soma((l) => l.sessoesAnterior);
  const convertidas = soma((l) => l.convertidas);

  const indisponivel = <span style={{ color: 'var(--tx3)' }}>Indisponível</span>;
  const colunas: Coluna<LinhaSite>[] = [
    { chave: 'site', titulo: 'Site', total: () => 'Total', render: (l) => (<><span>{l.nome}</span><span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{l.dominio}</span></>) },
    { chave: 'saude', titulo: 'Saúde', render: (l) => (<><Etiqueta texto={SAUDE_LABEL[l.saude.saude]} tom={SAUDE_TOM[l.saude.saude]} /><span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{l.saude.motivo}</span></>) },
    { chave: 'sessoes', titulo: 'Sessões', alinhamento: 'direita', mono: true, render: (l) => (l.sessoes === null ? indisponivel : num(l.sessoes)), total: () => num(sessoes) },
    { chave: 'evolucao', titulo: 'vs. anterior', alinhamento: 'direita', mono: true,
      render: (l) => (l.sessoes === null || !l.sessoesAnterior ? <span style={{ color: 'var(--tx3)' }}>Sem base</span> : pct((l.sessoes - l.sessoesAnterior) / l.sessoesAnterior)),
      total: () => (sessoesAnterior ? pct((sessoes - sessoesAnterior) / sessoesAnterior) : 'Sem base') },
    { chave: 'whatsapp', titulo: 'WhatsApp', alinhamento: 'direita', mono: true, render: (l) => (l.whatsapp === null ? indisponivel : num(l.whatsapp)), total: () => num(soma((l) => l.whatsapp)) },
    { chave: 'leads', titulo: 'Leads', alinhamento: 'direita', mono: true, render: (l) => (l.leads === null ? indisponivel : num(l.leads)), total: () => num(soma((l) => l.leads)) },
    { chave: 'conversao', titulo: 'Conversão', alinhamento: 'direita', mono: true,
      render: (l) => (!l.sessoes ? <span style={{ color: 'var(--tx3)' }}>Sem base</span> : pct((l.convertidas ?? 0) / l.sessoes)),
      total: () => (sessoes ? pct(convertidas / sessoes) : 'Sem base') },
    { chave: 'problemas', titulo: 'Problemas', alinhamento: 'direita', mono: true, render: (l) => num(l.problemas), total: () => num(soma((l) => l.problemas)) },
  ];

  const colunasProblemas: Coluna<(typeof sinais)[number]>[] = [
    { chave: 'site', titulo: 'Site', render: (o) => o.site },
    { chave: 'pagina', titulo: 'Página', render: (o) => (o.url ? <PaginaDoSinal url={o.url} dispositivo={o.dispositivo} /> : <SiteInteiro />) },
    { chave: 'problema', titulo: 'Problema', quebraLinha: true, render: (o) => (<><span>{o.titulo}</span><span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{o.evidencia}</span></>) },
    { chave: 'acao', titulo: 'Próxima ação', quebraLinha: true, render: (o) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{o.proximaAcao}</span> },
    { chave: 'desde', titulo: 'Desde', render: (o) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{dataHora(o.detectadoEm)}</span> },
  ];

  return (
    <>
      <Cabecalho
        kicker="RELATÓRIO DO CLIENTE"
        titulo={cliente}
        meta={`${rotuloPeriodo} · ${sites.length} site(s) · gerado em ${dataHora(new Date())}`}
        filtros={<><SeletorPeriodo atual={periodoInput.key as PeriodKey} /><BotaoImprimir /></>}
      />

      <div className="pagina relatorio">
        <p className="nao-imprime" style={{ fontSize: 'var(--tipo-apoio)' }}>
          <Link href={`/clientes/${clienteId}?periodo=${periodoInput.key}`} style={{ color: 'var(--tx2)' }}>← Voltar ao painel do cliente</Link>
        </p>

        <div className="grade-cartoes">
          <CartaoNumero rotulo="Saúde do cliente" valor={SAUDE_LABEL[saudeCliente]} nota="a pior página manda" tom={saudeCliente === 'critico' || saudeCliente === 'atencao' ? 'atencao' : 'neutro'} />
          <CartaoNumero rotulo="Sessões no período" valor={num(sessoes)} nota={sessoesAnterior ? `${pct((sessoes - sessoesAnterior) / sessoesAnterior)} vs. período anterior` : 'sem base de comparação'} />
          <CartaoNumero rotulo="Leads" valor={num(soma((l) => l.leads))} nota="contatos registrados no período" />
          <CartaoNumero rotulo="Problemas em aberto" valor={num(sinais.filter((o) => o.status !== 'resolvida_manual').length)} nota="sinais derivados hoje" tom={sinais.length > 0 ? 'atencao' : 'neutro'} />
          <CartaoNumero rotulo="Resolvidos no período" valor={num(resolvidosNoPeriodo.length)} nota="fechados por medição, não por declaração" />
          <CartaoNumero rotulo="Tarefas concluídas" valor={num(tarefasConcluidas.length)} nota={`${tarefasAbertas.length} ainda aberta(s)`} />
          <CartaoNumero rotulo="Medições no período" valor={num(medicoesNoPeriodo.length)} nota="análises Lighthouse concluídas" />
        </div>

        <Painel titulo="Sites" subtitulo="Saúde, números do período e problemas por site — os mesmos das telas">
          <Tabela colunas={colunas} linhas={linhas} />
        </Painel>

        {pedemAtencao.length > 0 && (
          <Painel titulo="Páginas que precisam de atenção" subtitulo="Onde olhar primeiro, com o motivo">
            <ul style={{ paddingLeft: 20, fontSize: 'var(--tipo-corpo)', lineHeight: 1.8 }}>
              {pedemAtencao.map((l) => (
                <li key={l.id}><strong>{l.nome}</strong> — <Etiqueta texto={SAUDE_LABEL[l.saude.saude]} tom={SAUDE_TOM[l.saude.saude]} /> {l.saude.motivo}</li>
              ))}
            </ul>
          </Painel>
        )}

        <Painel titulo="Problemas em aberto" subtitulo="Cada um com a evidência que o sustenta e a próxima ação">
          <Tabela colunas={colunasProblemas} linhas={sinais.filter((o) => o.status !== 'resolvida_manual')} vazio="Nenhum sinal aberto nos sites deste cliente." />
        </Painel>

        {(resolvidosNoPeriodo.length > 0 || tarefasConcluidas.length > 0) && (
          <Painel titulo="O que foi resolvido no período" subtitulo="Problemas fechados por medição e tarefas concluídas">
            <ul style={{ paddingLeft: 20, fontSize: 'var(--tipo-corpo)', lineHeight: 1.8 }}>
              {resolvidosNoPeriodo.map((e, i) => (
                <li key={`r${i}`}>{dataHora(e.quando)} — <strong>{e.site}</strong>: {e.titulo} {e.url && <span className="mono" style={{ fontSize: 'var(--tipo-legenda)' }}>({e.url.replace(/^https?:\/\/[^/]+/, '') || '/'})</span>} <span style={{ color: 'var(--tx3)' }}>{e.detalhe}</span></li>
              ))}
              {tarefasConcluidas.map((t) => (
                <li key={t.id}>{dataHora(t.concluidaEm!)} — <strong>{t.site}</strong>: tarefa &quot;{t.titulo}&quot; concluída{t.sinal ? ` (${t.sinal.titulo})` : ''}</li>
              ))}
            </ul>
          </Painel>
        )}

        {tarefasAbertas.length > 0 && (
          <Painel titulo="Pendências" subtitulo="Tarefas abertas ou em andamento">
            <ul style={{ paddingLeft: 20, fontSize: 'var(--tipo-corpo)', lineHeight: 1.8 }}>
              {tarefasAbertas.map((t) => (
                <li key={t.id}><strong>{t.site}</strong>: {t.titulo}{t.prazo ? ` · prazo ${t.prazo.split('-').reverse().join('/')}` : ''}</li>
              ))}
            </ul>
          </Painel>
        )}

        <Painel titulo="Evolução" subtitulo="Medições e acontecimentos, do mais recente ao mais antigo">
          <Historico eventos={historico.filter((e) => noPeriodo(e.quando)).slice(0, 60)} />
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">FONTE: RASTREAMENTO PRÓPRIO + PAGESPEED INSIGHTS</Aviso>
          <Aviso>NADA AQUI AFIRMA CAUSA: OS SINAIS SÃO MOSTRADOS SEPARADOS</Aviso>
        </footer>
      </div>
    </>
  );
}
