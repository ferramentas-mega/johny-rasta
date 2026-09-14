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
import { marcarSnippetVisto } from '../../acoes';

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

  const site = await obterSite(usuario.accountId, siteId);
  if (!site) notFound();

  const sites = await listarSites(usuario.accountId);

  // Abrir esta tela é o momento em que o operador vê o snippet. A partir daqui
  // o estado deixa de ser "aguardando instalação" e passa a "aguardando
  // primeiro evento" — uma distinção honesta, não um upgrade de status.
  await marcarSnippetVisto(site.id);

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

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

  const passoAtual =
    site.totalEventos > 0 ? 5 : site.snippetSeenAt ? 4 : 3;

  const snippet = `<script async src="${appUrl}/t.js"\n        data-site="${site.publicId}"></script>`;

  const snippetBotao = `<a href="https://wa.me/5511999999999"\n   data-track-id="cta-whatsapp-hero"\n   data-track-sub="whatsapp"\n   data-track-pos="Hero">Falar no WhatsApp</a>`;

  const snippetFormulario = `<form method="post"\n      action="${appUrl}/api/forms/${site.publicId}">\n  <input name="nome" required>\n  <input name="email" type="email">\n  <input name="telefone">\n  <input type="hidden" name="formulario" value="Fale conosco">\n  <input type="hidden" name="visitante" value="PREENCHER_COM_painel.visitante()">\n  <input type="hidden" name="idempotencia" value="PREENCHER_COM_crypto.randomUUID()">\n  <button type="submit">Enviar</button>\n</form>`;

  const colunasEventos: Coluna<LinhaEvento>[] = [
    { chave: 'quando', titulo: 'Quando', mono: true, render: (l) => dataHora(l.quando) },
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
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento)}` : undefined,
        }}
        meta={`${num(site.totalEventos)} evento(s) recebido(s) desde o cadastro`}
        filtros={<SeletorSiteRota sites={sites} atual={site.id} aba="rastreamento" />}
      />

      <div style={{ padding: '0 32px' }}>
        <Abas siteId={site.id} />
      </div>

      <div className="pagina" style={{ padding: '22px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
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
                      color: concluido ? 'var(--gold)' : atual ? 'var(--warn-tx)' : 'var(--tx3)',
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
          <Snippet codigo={snippet} rotulo={`Endpoint configurado: ${appUrl}`} />
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
          titulo="Marcação de botões"
          subtitulo="Opcional: nomeia o botão nos relatórios em vez de agrupá-lo como automático"
        >
          <Snippet codigo={snippetBotao} rotulo="Exemplo de CTA marcado" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Sem <span className="mono">data-track-id</span>, cliques em WhatsApp, telefone e e-mail ainda são
            contados — aparecem agrupados como <span className="mono">auto:whatsapp</span> e afins. Para abertura de
            formulário, chame <span className="mono">painel.evento(&apos;form_open&apos;)</span>: um clique que abre um
            formulário não é um envio, e o painel não trata como se fosse.
          </p>
        </Painel>

        <Painel
          titulo="Recebimento de formulários"
          subtitulo="O envio é validado e gravado no servidor antes de qualquer confirmação"
        >
          <Snippet codigo={snippetFormulario} rotulo="Endpoint de formulários" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            A chave de idempotência precisa ser gerada uma vez por formulário preenchido, não por tentativa de envio:
            é ela que impede que um reenvio crie um segundo lead.
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
