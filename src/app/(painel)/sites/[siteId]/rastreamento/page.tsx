import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { listarSites, obterSite, ESTADO_LABEL } from '@/server/services/sites';
import { dataHora, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { Painel } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { SeletorSiteRota } from '@/components/filtros';
import { Snippet } from './Snippet';
import { EventoTeste } from './EventoTeste';
import { registrarSnippetVisto } from '@/server/services/cadastros';
import { appUrl } from '@/lib/app-url';
import { snippetColetor, snippetBotao, snippetFormulario } from '@/lib/snippets';
import { getInventarioDeBotoes, getTagsDuplicadas } from '@/server/metrics/queries';
import {
  estadoDoBotao,
  ordenarInventario,
  resumirInventario,
  ESTADO_BOTAO_LABEL,
  ESTADO_BOTAO_TOM,
  ESTADO_BOTAO_ACAO,
  type BotaoComEstado,
} from '@/lib/botoes';

export const dynamic = 'force-dynamic';

/**
 * Instalação e verificação do rastreamento.
 *
 * O estado mostrado aqui é sempre derivado do que chegou ao servidor. Salvar um
 * identificador não faz o site aparecer como "coletando" — para isso é preciso
 * um evento real.
 */

const PASSOS: { titulo: string; detalhe: string }[] = [
  { titulo: 'Cliente cadastrado', detalhe: 'Todo site pertence a um cliente.' },
  { titulo: 'Site cadastrado', detalhe: 'Domínio e fuso horário definidos.' },
  { titulo: 'Identificador gerado', detalhe: 'Endereça o site no coletor.' },
  { titulo: 'Script instalado', detalhe: 'Uma linha no HTML de todas as páginas.' },
  { titulo: 'Primeiro evento recebido', detalhe: 'Confirma que a coleta chegou ao servidor.' },
];

type LinhaEvento = {
  tipo: string;
  subtipo: string | null;
  caminho: string | null;
  quando: Date;
  teste: boolean;
};

export default async function PaginaRastreamento({ params }: { params: Promise<{ siteId: string }> }) {
  const usuario = await exigirSessao();
  const { siteId } = await params;

  // Abrir esta tela é o momento em que o operador vê o snippet. A partir daqui
  // o estado deixa de ser "aguardando instalação" e passa a "aguardando
  // primeiro evento" — uma distinção honesta, não um upgrade de status.
  //
  // A marcação vem ANTES da leitura, de propósito: marcar depois faria esta
  // renderização mostrar o estado anterior, e o operador veria "aguardando
  // instalação" na própria tela que acabou de lhe entregar o snippet.
  //
  // Grava direto pelo serviço, sem passar pela Server Action: `revalidatePath`
  // não pode ser chamado durante o render de uma página, e a escrita é
  // idempotente (coalesce), então não há o que revalidar.
  await registrarSnippetVisto(usuario.accountId, siteId);

  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();

  const sites = await listarSites(usuario.accountId);

  const endpoint = appUrl();

  const recentes = await withAccount(usuario.accountId, async (db) =>
    db.query<LinhaEvento>(
      `select e.type as tipo, e.subtype as subtipo, p.path as caminho,
              e.occurred_at as quando, e.is_test as teste
         from events e
         left join pages p on p.id = e.page_id
        where e.site_id = $1
        order by e.occurred_at desc
        limit 12`,
      [site.id],
    ),
  );

  /**
   * O inventário, numa transação só e sequencial.
   *
   * `Queryable` serializa as consultas de uma mesma transação, então mesmo um
   * `Promise.all` aqui esperaria — escrever sequencial deixa isso explícito.
   */
  const { inventarioBruto, duplicadas } = await withAccount(usuario.accountId, async (db) => {
    const inventarioBruto = await getInventarioDeBotoes(db, site.id);
    const duplicadas = await getTagsDuplicadas(db, site.id);
    return { inventarioBruto, duplicadas };
  });

  /**
   * "Site ativo" decide se faz sentido afirmar que um botão sumiu.
   *
   * Se a coleta inteira parou, TODOS os botões parecem sumidos — a lista
   * apontaria para sete problemas onde existe um só, e no lugar errado. O corte
   * é o mesmo que a aba usa para o estado do site: evento recente.
   */
  const siteAtivo =
    !!site.ultimoEvento &&
    Date.now() - new Date(site.ultimoEvento).getTime() < 7 * 86_400_000;

  const agora = new Date();
  const inventario: BotaoComEstado[] = ordenarInventario(
    inventarioBruto.map((b) => ({ ...b, estado: estadoDoBotao(b, { agora, siteAtivo }) })),
  );
  const resumo = resumirInventario(inventario);

  const passoAtual =
    site.totalEventos > 0 ? 5 : site.snippetSeenAt ? 4 : 3;

  const snippet = snippetColetor(endpoint, site.publicId);
  const exemploBotao = snippetBotao();
  const exemploFormulario = snippetFormulario(endpoint, site.publicId);

  const colunasBotoes: Coluna<BotaoComEstado>[] = [
    {
      chave: 'botao', titulo: 'Botão',
      render: (b) => (
        <span>
          <span style={{ display: 'block' }}>{b.texto}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>{b.buttonId}</span>
        </span>
      ),
    },
    { chave: 'subtipo', titulo: 'Tipo', mono: true, render: (b) => b.subtipo },
    {
      chave: 'onde', titulo: 'Onde',
      render: (b) => (
        <span>
          <span style={{ display: 'block' }}>{b.posicao ?? '—'}</span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--tx3)' }}>
            {b.paginas > 1 ? `${num(b.paginas)} páginas` : (b.exemploPagina ?? '—')}
          </span>
        </span>
      ),
    },
    {
      chave: 'cliques', titulo: 'Cliques', alinhamento: 'direita', mono: true,
      ajuda: 'Total histórico, sem recorte de período. O inventário responde o que existe, não o que performou nesta semana.',
      render: (b) => num(b.cliques),
    },
    {
      chave: 'visto', titulo: 'Último clique', mono: true,
      render: (b) => dataHora(b.ultimoEm, site.timezone),
    },
    {
      chave: 'estado', titulo: 'Situação',
      // A ação é uma FRASE. Sem quebra, ela sai para fora da tabela e é cortada
      // sem reticências nem pista de que há mais texto.
      quebraLinha: true,
      render: (b) => (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <Etiqueta texto={ESTADO_BOTAO_LABEL[b.estado]} tom={ESTADO_BOTAO_TOM[b.estado]} />
          {/* Estado sem próxima ação é só um rótulo bonito. */}
          {b.estado !== 'medindo' && b.estado !== 'novo' && (
            <span style={{ fontSize: 11, color: 'var(--tx3)', lineHeight: 1.5 }}>
              {ESTADO_BOTAO_ACAO[b.estado]}
            </span>
          )}
        </span>
      ),
    },
  ];

  const colunasEventos: Coluna<LinhaEvento>[] = [
    { chave: 'quando', titulo: 'Quando', mono: true, render: (l) => dataHora(l.quando, site.timezone) },
    { chave: 'tipo', titulo: 'Evento', mono: true,
      render: (l) => (l.subtipo ? `${l.tipo} · ${l.subtipo}` : l.tipo) },
    { chave: 'caminho', titulo: 'Página', mono: true, render: (l) => l.caminho ?? '—' },
    { chave: 'teste', titulo: 'Escopo',
      render: (l) =>
        l.teste
          ? <Etiqueta texto="Teste (fora das métricas)" tom="warn" />
          : <Etiqueta texto="Contabilizado" tom="ok" /> },
  ];

  return (
    <>
      <Cabecalho
        kicker="RASTREAMENTO"
        titulo={site.name}
        estado={{
          tipo: site.estado,
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento, site.timezone)}` : undefined,
        }}
        meta={`${num(site.totalEventos)} evento(s) recebido(s) desde o cadastro`}
        filtros={<SeletorSiteRota sites={sites} atual={site.id} aba="rastreamento" />}
      />

      <div className="abas">
        <Abas siteId={site.id} />
      </div>

      <div className="pagina">
        <Painel
          titulo="Situação da instalação"
          subtitulo={`Estado atual: ${ESTADO_LABEL[site.estado]}`}
        >
          <ol style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PASSOS.map((passo, i) => {
              const numero = i + 1;
              const concluido = numero < passoAtual || (numero === 5 && site.totalEventos > 0);
              const atual = numero === passoAtual && !concluido;
              return (
                <li key={passo.titulo} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span
                    className="mono"
                    aria-hidden="true"
                    style={{
                      flex: 'none',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      border: `1px solid ${concluido ? 'var(--gold)' : atual ? 'var(--warn-tx)' : 'var(--bd)'}`,
                      background: concluido ? 'var(--gold-fill)' : 'transparent',
                      color: concluido ? 'var(--gold-tx)' : atual ? 'var(--warn-tx)' : 'var(--tx3)',
                    }}
                  >
                    {concluido ? '✓' : numero}
                  </span>
                  <span>
                    <span style={{ fontSize: 13.5, color: concluido ? 'var(--tx)' : 'var(--tx2)' }}>
                      {passo.titulo}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx3)' }}>{passo.detalhe}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </Painel>

        <Painel
          titulo="Script de coleta"
          subtitulo="Uma linha, antes de fechar o </head> de todas as páginas do site"
        >
          <Snippet codigo={snippet} rotulo={`Endpoint configurado: ${endpoint}`} />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            O script registra visualizações sozinho, e detecta cliques em links de WhatsApp, telefone e e-mail sem
            marcação adicional. Ele nunca lê campos de formulário.
          </p>
        </Painel>

        <Painel
          titulo="Verificar a coleta"
          subtitulo="Duas formas de confirmar que os eventos chegam ao servidor"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <EventoTeste publicId={site.publicId} />
            <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
              Ou abra a{' '}
              <Link href={`/teste/${site.publicId}`} target="_blank">
                página de teste deste site
              </Link>
              , que carrega o coletor de verdade e traz um botão de WhatsApp e um formulário funcionando. Os eventos
              dela contam como coleta real.
            </p>
          </div>
        </Painel>

        <Painel
          titulo="Inventário de tags e botões"
          subtitulo={
            inventario.length === 0
              ? 'Nada clicado até agora — o inventário se preenche sozinho conforme os cliques chegam'
              : `${resumo.total} botão(ões) já clicado(s) · ${resumo.medindo} bem marcado(s)` +
                (resumo.semNome > 0 ? ` · ${resumo.semNome} sem nome` : '') +
                (resumo.sumiram > 0 ? ` · ${resumo.sumiram} parou de aparecer` : '')
          }
        >
          {duplicadas.length > 0 && (
            <div
              role="alert"
              style={{
                border: '1px solid var(--neg)',
                borderRadius: 10,
                background: 'var(--card)',
                padding: '12px 14px',
                marginBottom: 14,
              }}
            >
              <strong style={{ fontSize: 13.5, color: 'var(--neg-tx)' }}>
                Coletor instalado mais de uma vez
              </strong>
              <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.7, margin: '6px 0' }}>
                Estas páginas registraram duas visualizações da mesma sessão separadas por menos de dois
                segundos, nos últimos 7 dias. É o sintoma de duas tags na mesma página — e ele é caro em
                silêncio: as visualizações dobram, páginas por sessão dobra, e a taxa de conversão cai pela
                metade sem nada ter piorado no site. Ninguém desconfia de um número que só subiu.
              </p>
              <ul className="mono" style={{ fontSize: 12, color: 'var(--tx2)', paddingLeft: 20 }}>
                {duplicadas.map((d) => (
                  <li key={d.caminho}>
                    {d.caminho} — {num(d.ocorrencias)} ocorrência(s)
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6, marginTop: 6 }}>
                Procure por <span className="mono">t.js</span> no HTML publicado. O caso comum é o script no
                layout do tema E num plugin de inserção de código.
              </p>
            </div>
          )}

          {inventario.length > 0 && (
            <>
              <Tabela colunas={colunasBotoes} linhas={inventario} vazio="Nenhum botão clicado ainda." />
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
                Esta lista é construída a partir do que o coletor <strong>recebeu</strong>, e por isso tem um
                limite que vale dizer: um botão que existe na página e nunca foi clicado não aparece aqui.
                Ela responde &quot;de tudo o que já foi clicado, o que está bem marcado&quot; — não &quot;quantos
                botões o site tem&quot;.
              </p>
            </>
          )}

          <div style={{ marginTop: inventario.length > 0 ? 16 : 0 }}>
            <Snippet codigo={exemploBotao} rotulo="Exemplo de CTA marcado" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Sem <span className="mono">data-track-id</span>, cliques em WhatsApp, telefone e e-mail ainda são
            contados — aparecem agrupados como <span className="mono">auto:whatsapp</span> e afins. Para abertura de
            formulário, chame <span className="mono">painel.evento(&apos;form_open&apos;)</span>: um clique que abre um
            formulário não é um envio, e o painel não trata como se fosse.
            </p>
          </div>
        </Painel>

        <Painel
          titulo="Recebimento de formulários"
          subtitulo="O envio é validado e gravado no servidor antes de qualquer confirmação"
        >
          <Snippet codigo={exemploFormulario} rotulo="Endpoint de formulários" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            O exemplo funciona como está: gera a chave de idempotência uma vez por formulário preenchido e só a
            renova depois de um envio confirmado pelo servidor. Visitante e idempotência são opcionais no
            endpoint — sem eles o contato ainda é aceito, porque recusar um lead legítimo por causa do analytics
            seria o pior resultado possível.
          </p>
        </Painel>

        <Painel titulo="Últimos eventos recebidos" subtitulo="Diagnóstico bruto, incluindo eventos de teste">
          <Tabela
            colunas={colunasEventos}
            linhas={recentes}
            vazio="Nenhum evento recebido até agora. Instale o script e abra o site uma vez."
          />
        </Painel>
      </div>
    </>
  );
}
