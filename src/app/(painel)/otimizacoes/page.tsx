import Link from 'next/link';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarOtimizacoes, TIPO_LABEL, STATUS_LABEL, type Otimizacao } from '@/server/qualidade/otimizacoes';
import { dataHora, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, Aviso } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';

export const dynamic = 'force-dynamic';

const TOM: Record<string, 'ok' | 'warn' | 'soft'> = {
  tecnico: 'warn', comercial: 'warn', coleta: 'warn', atualizacao: 'soft',
};

export default async function PaginaOtimizacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const busca = await searchParams;
  const tipoFiltro = typeof busca.tipo === 'string' ? busca.tipo : '';
  const usuario = await exigirSessao();

  const todas = await withAccount(usuario.accountId, (db) => listarOtimizacoes(db));
  const itens = tipoFiltro ? todas.filter((o) => o.tipo === tipoFiltro) : todas;

  const porTipo = (t: string) => todas.filter((o) => o.tipo === t).length;

  const colunas: Coluna<Otimizacao>[] = [
    {
      chave: 'prioridade', titulo: '!', alinhamento: 'direita', mono: true,
      render: (o) => <span style={{ color: o.prioridade === 1 ? 'var(--neg)' : 'var(--tx3)' }}>{o.prioridade === 1 ? 'Alta' : 'Média'}</span>,
    },
    {
      chave: 'onde', titulo: 'Cliente e site',
      render: (o) => (
        <>
          <Link href={`/sites/${o.siteId}/qualidade`}>{o.site}</Link>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--tx3)' }}>{o.cliente}</span>
        </>
      ),
    },
    {
      chave: 'pagina', titulo: 'Página',
      render: (o) => (o.url
        ? <span className="mono" style={{ fontSize: 11.5 }}>{o.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
        : <span style={{ color: 'var(--tx3)', fontSize: 11.5 }}>site inteiro</span>),
    },
    { chave: 'tipo', titulo: 'Tipo', render: (o) => <Etiqueta texto={TIPO_LABEL[o.tipo]} tom={TOM[o.tipo] ?? 'soft'} /> },
    { chave: 'problema', titulo: 'Problema', render: (o) => o.titulo },
    { chave: 'evidencia', titulo: 'Evidência', render: (o) => <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{o.evidencia}</span> },
    { chave: 'acao', titulo: 'Próxima ação', render: (o) => <span style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{o.proximaAcao}</span> },
    { chave: 'status', titulo: 'Situação', render: (o) => <Etiqueta texto={STATUS_LABEL[o.status] ?? o.status} tom={o.status === 'pendente' ? 'soft' : 'ok'} /> },
    { chave: 'quando', titulo: 'Desde', render: (o) => <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{dataHora(o.detectadoEm)}</span> },
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
                  fontSize: 12.5, padding: '6px 11px', borderRadius: 999,
                  border: `1px solid ${on ? 'var(--gold)' : 'var(--bd)'}`,
                  color: on ? 'var(--gold)' : 'var(--tx2)', textDecoration: 'none',
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
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            A lista não conclui que o rastreamento quebrou porque um site ficou sem eventos: site de pouco
            tráfego passa dias sem visita, e isso é normal. O aviso de coleta só aparece em site que já
            coletava com regularidade e parou. Também não afirma que lentidão causou queda de conversão —
            os dois sinais aparecem separados, e a conclusão é de quem investiga.
            Marcar um item como resolvido <strong>não altera nenhuma medição</strong>: a nota só muda quando
            uma nova análise é executada.
          </p>
        </Painel>

        <footer style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Aviso tom="ok">DERIVADO DOS DADOS, NÃO DE UM SCORE</Aviso>
        </footer>
      </div>
    </>
  );
}
