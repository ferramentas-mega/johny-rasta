import Link from 'next/link';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import {
  listarOtimizacoes,
  resolvidasPorVerificacao,
  DISPOSITIVO_LABEL,
  TIPO_LABEL,
  type Dispositivo,
  type Otimizacao,
  type ResolvidaPorVerificacao,
} from '@/server/qualidade/otimizacoes';
import { Situacao } from './Situacao';
import { dataHora, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';

export const dynamic = 'force-dynamic';

const TOM: Record<string, 'ok' | 'warn' | 'soft'> = {
  tecnico: 'warn', comercial: 'warn', coleta: 'warn', atualizacao: 'soft',
};

/** Janela da lista de resolvidas. */
const DIAS_DE_RESOLVIDAS = 30;

/** Teto da lista de resolvidas. O total vem junto, e a tela diz quando corta. */
const RESOLVIDAS_NA_TELA = 20;

function Pagina({ url, dispositivo }: { url: string; dispositivo: Dispositivo | null }) {
  return (
    <>
      <span className="mono" style={{ fontSize: 'var(--tipo-legenda)' }}>
        {url.replace(/^https?:\/\/[^/]+/, '') || '/'}
      </span>
      {dispositivo && (
        <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
          no {DISPOSITIVO_LABEL[dispositivo]}
        </span>
      )}
    </>
  );
}

function SiteInteiro() {
  return <span style={{ color: 'var(--tx3)', fontSize: 'var(--tipo-legenda)' }}>site inteiro</span>;
}

export default async function PaginaOtimizacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const busca = await searchParams;
  const tipoFiltro = typeof busca.tipo === 'string' ? busca.tipo : '';
  const usuario = await exigirSessao();

  const { todas, resolvidas } = await withAccount(usuario.accountId, async (db) => ({
    todas: await listarOtimizacoes(db),
    // Trinta dias: prazo suficiente para a análise semanal de uma URL
    // prioritária ter rodado pelo menos quatro vezes desde a correção.
    resolvidas: await resolvidasPorVerificacao(db, DIAS_DE_RESOLVIDAS, RESOLVIDAS_NA_TELA),
  }));
  const itens = tipoFiltro ? todas.filter((o) => o.tipo === tipoFiltro) : todas;

  const porTipo = (t: string) => todas.filter((o) => o.tipo === t).length;

  const colunas: Coluna<Otimizacao>[] = [
    {
      chave: 'prioridade', titulo: '!', alinhamento: 'direita', mono: true,
      render: (o) => <span style={{ color: o.prioridade === 1 ? 'var(--neg-tx)' : 'var(--tx3)' }}>{o.prioridade === 1 ? 'Alta' : 'Média'}</span>,
    },
    {
      chave: 'onde', titulo: 'Cliente e site',
      render: (o) => (
        <>
          <Link href={`/sites/${o.siteId}/qualidade`}>{o.site}</Link>
          <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{o.cliente}</span>
        </>
      ),
    },
    {
      chave: 'pagina', titulo: 'Página',
      // A nota técnica pertence a uma URL E A UM DISPOSITIVO: sem o dispositivo
      // à vista, duas linhas da mesma página pareceriam a mesma pendência
      // repetida.
      render: (o) => (o.url ? <Pagina url={o.url} dispositivo={o.dispositivo} /> : <SiteInteiro />),
    },
    { chave: 'tipo', titulo: 'Tipo', render: (o) => <Etiqueta texto={TIPO_LABEL[o.tipo]} tom={TOM[o.tipo] ?? 'soft'} /> },
    { chave: 'problema', titulo: 'Problema', render: (o) => o.titulo },
    { chave: 'evidencia', titulo: 'Evidência', render: (o) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{o.evidencia}</span> },
    { chave: 'acao', titulo: 'Próxima ação', render: (o) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{o.proximaAcao}</span> },
    { chave: 'status', titulo: 'Situação', quebraLinha: true, render: (o) => <Situacao item={o} /> },
    { chave: 'quando', titulo: 'Desde', render: (o) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{dataHora(o.detectadoEm)}</span> },
  ];

  const colunasResolvidas: Coluna<ResolvidaPorVerificacao>[] = [
    { chave: 'site', titulo: 'Site', render: (r) => r.site },
    {
      chave: 'pagina', titulo: 'Página',
      render: (r) => (r.url ? <Pagina url={r.url} dispositivo={r.dispositivo} /> : <SiteInteiro />),
    },
    { chave: 'problema', titulo: 'Problema', render: (r) => r.titulo },
    {
      chave: 'antes', titulo: 'Quando foi marcado',
      render: (r) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>{r.antes ?? '—'}</span>,
    },
    {
      chave: 'depois', titulo: 'Na medição que fechou', mono: true,
      // Nulo aparece como "sem nota", e não como zero: o sinal de coleta vale
      // para o site inteiro e não tem nota nenhuma a mostrar. Zero afirmaria
      // uma medição que não houve.
      render: (r) => (r.notaDepois === null
        ? <span style={{ color: 'var(--tx3)', fontSize: 'var(--tipo-legenda)' }}>sem nota</span>
        : <span style={{ color: 'var(--pos-tx)' }}>{r.notaDepois}/100</span>),
    },
    {
      chave: 'quando', titulo: 'Fechado em',
      render: (r) => (
        <>
          <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{dataHora(r.resolvidoEm)}</span>
          {/* "nova medição" e "varredura diária" não são a mesma afirmação: a
              primeira diz que uma análise daquele site mostrou a ausência; a
              segunda, que a ausência foi NOTADA naquele dia — o dado pode ter
              mudado antes. Guardar a diferença e esconder seria inútil. */}
          {r.resolvidoPor && (
            <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
              por {r.resolvidoPor}
            </span>
          )}
        </>
      ),
    },
  ];

  const filtros: { chave: string; rotulo: string; n: number }[] = [
    { chave: '', rotulo: 'Todos', n: todas.length },
    { chave: 'tecnico', rotulo: 'Técnicos', n: porTipo('tecnico') },
    { chave: 'comercial', rotulo: 'Comerciais', n: porTipo('comercial') },
    { chave: 'coleta', rotulo: 'Coleta', n: porTipo('coleta') },
    { chave: 'atualizacao', rotulo: 'Atualização', n: porTipo('atualizacao') },
  ];

  return (
    <>
      <Cabecalho
        kicker="OTIMIZAÇÕES"
        titulo="Onde atuar primeiro"
        meta={`${num(todas.length)} item(ns) em aberto`}
      />

      <div className="pagina">
        <nav aria-label="Filtrar por tipo" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {filtros.map((f) => {
            const on = tipoFiltro === f.chave;
            return (
              <Link
                key={f.chave || 'todos'}
                href={f.chave ? `/otimizacoes?tipo=${f.chave}` : '/otimizacoes'}
                aria-current={on ? 'page' : undefined}
                style={{
                  fontSize: 'var(--tipo-apoio)', padding: '6px 11px', borderRadius: 'var(--raio-pilula)',
                  border: `1px solid ${on ? 'var(--gold)' : 'var(--bd)'}`,
                  color: on ? 'var(--gold-tx)' : 'var(--tx2)', textDecoration: 'none',
                  background: on ? 'var(--elev)' : 'transparent',
                }}
              >
                {f.rotulo} <span className="mono" style={{ color: 'var(--tx3)' }}>{f.n}</span>
              </Link>
            );
          })}
        </nav>

        <Painel titulo="Prioridades" subtitulo="Cada linha diz o problema, a evidência que o sustenta e o que fazer a seguir">
          <Tabela
            colunas={colunas}
            linhas={itens}
            vazio={tipoFiltro ? 'Nenhum item deste tipo.' : 'Nenhuma pendência encontrada.'}
          />
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            A lista não conclui que o rastreamento quebrou porque um site ficou sem eventos: site de pouco
            tráfego passa dias sem visita, e isso é normal. O aviso de coleta só aparece em site que já
            coletava com regularidade e parou. Também não afirma que lentidão causou queda de conversão —
            os dois sinais aparecem separados, e a conclusão é de quem investiga.
            Marcar um item como resolvido <strong>não altera nenhuma medição</strong>: a nota só muda quando
            uma nova análise é executada.
          </p>
        </Painel>

        {resolvidas.total > 0 && (
          <Painel
            titulo="Fechadas pela medição"
            subtitulo={`Itens cujo sinal deixou de ser detectado numa análise nova, nos últimos ${DIAS_DE_RESOLVIDAS} dias`}
          >
            <Tabela colunas={colunasResolvidas} linhas={resolvidas.itens} vazio="" />
            {resolvidas.total > resolvidas.itens.length && (
              <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10 }}>
                Mostrando {num(resolvidas.itens.length)} de {num(resolvidas.total)} — a tela mostra
                as mais recentes.
              </p>
            )}
            <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
              Estas saíram da lista acima porque a <strong>próxima medição não encontrou mais o
              problema</strong> — não porque alguém declarou resolvido. As duas notas são as duas
              medições: a de quando o item foi marcado e a que fechou. O painel guarda o par e a
              data; <strong>não afirma que a correção causou a melhora</strong>, porque daqui não dá
              para saber o que mais mudou na página nesse intervalo.
            </p>
          </Painel>
        )}

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">DERIVADO DOS DADOS, NÃO DE UM SCORE</Aviso>
        </footer>
      </div>
    </>
  );
}
