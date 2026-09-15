import Link from 'next/link';
import { notFound } from 'next/navigation';
import { withAccount } from '@/server/db';
import { exigirSessao } from '@/server/contexto';
import { obterSite, listarClientes } from '@/server/services/sites';
import {
  ETAPAS,
  RECURSO_LABEL,
  RECURSOS_DO_COLETOR,
  ESTADO_RECURSO_LABEL,
  ESTADO_RECURSO_TOM,
  PLATAFORMA_LABEL,
  obterConfiguracao,
  diagnosticoAberto,
  situacaoDasEtapas,
  proximaEtapa,
  proximaAcao,
  type EtapaSlug,
  type Recurso,
} from '@/server/services/onboarding';
import { appUrl } from '@/lib/app-url';
import { dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Abas } from '@/components/Abas';
import { Painel } from '@/components/Cartoes';
import { Etiqueta } from '@/components/Tabela';
import { Snippet } from '../rastreamento/Snippet';
import { PainelDeAnalise } from '../qualidade/PainelDeAnalise';
import { Passos } from './Passos';
import { EtapaIdentificacao } from './EtapaIdentificacao';
import { EtapaRecursos } from './EtapaRecursos';
import { EtapaVerificacao } from './EtapaVerificacao';
import { EtapaFormularios } from './EtapaFormularios';
import { EtapaQualidade } from './EtapaQualidade';
import { instrucaoDaPlataforma } from './instrucoes';
import { instrucaoParaClaudeCode } from '@/lib/snippets';

export const dynamic = 'force-dynamic';

/**
 * Assistente de configuração de um site.
 *
 * Retomável por construção: **não existe rascunho em memória.** Cada etapa
 * grava ao ser submetida, e a etapa em que o operador retoma é DERIVADA do que
 * está salvo — a primeira pendente. Sair no meio e voltar amanhã cai no mesmo
 * lugar, e voltar uma etapa não perde nada.
 *
 * Por isso não há campo `etapa_atual` no banco: um contador mentiria para quem
 * voltasse e desmarcasse um recurso.
 */
export default async function PaginaConfigurar({
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

  const config = await obterConfiguracao(usuario.accountId, siteId);
  if (!config) notFound();

  const situacao = situacaoDasEtapas(config);
  const pedida = typeof busca.etapa === 'string' ? (busca.etapa as EtapaSlug) : null;
  const etapa: EtapaSlug =
    pedida && ETAPAS.some((e) => e.slug === pedida) ? pedida : proximaEtapa(config);

  const clientes = await listarClientes(usuario.accountId);
  const endpoint = appUrl();

  const recurso = (r: Recurso) => config.features.find((f) => f.recurso === r)!;
  const selecionadosDoColetor = config.features
    .filter((f) => f.selecionado && RECURSOS_DO_COLETOR.includes(f.recurso) && f.recurso !== 'formularios')
    .map((f) => f.recurso);
  const verificadosDoColetor = config.features
    .filter((f) => f.estado === 'verificado')
    .map((f) => f.recurso);

  const snippet = `<script async src="${endpoint}/t.js"\n        data-site="${site.publicId}"></script>`;
  const instrucao = instrucaoDaPlataforma(config.plataforma);

  /**
   * A base do diagnóstico: a URL principal, quando existe e é utilizável, senão
   * o domínio.
   *
   * O `canParse` não é zelo excessivo. A validação de entrada passou a exigir um
   * endereço absoluto, mas linhas gravadas ANTES dela continuam no banco — e
   * aqui `new URL()` roda no render de um Server Component, onde uma exceção não
   * é um campo com erro: é a tela inteira fora do ar, justamente a tela onde se
   * corrigiria o valor. Cair para o domínio é o comportamento certo, porque é
   * exatamente o que a tela faz quando não há URL principal nenhuma.
   */
  const urlBase =
    config.urlPrincipal && URL.canParse(config.urlPrincipal)
      ? config.urlPrincipal
      : `https://${site.domain}/`;

  // A sessão de diagnóstico aberta vem do banco, e não do estado do formulário:
  // é o que faz recarregar a etapa 4 preservar o token em vez de descartar os
  // eventos que o operador acabou de gerar.
  const sessao = await diagnosticoAberto(usuario.accountId, siteId);
  const sessaoAberta = sessao
    ? (() => {
        const u = new URL(urlBase);
        u.searchParams.set('painel_diag', sessao.token);
        // A data vai como ISO porque atravessa a fronteira servidor→cliente: um
        // `Date` seria serializado assim mesmo, e declarar o tipo como string
        // deixa explícito que do outro lado é preciso reconstruí-lo.
        return { token: sessao.token, url: u.toString(), expiraEm: sessao.expiraEm.toISOString() };
      })()
    : null;

  const urlsMonitoradas = await withAccount(usuario.accountId, (db) =>
    db.query<{ id: string; url: string; prioritaria: boolean }>(
      'select id, url, prioritaria from monitored_urls where site_id = $1 order by prioritaria desc, url',
      [siteId],
    ),
  );

  const titulo = ETAPAS.find((e) => e.slug === etapa)!.titulo;
  const acao = proximaAcao(config);

  return (
    <>
      <Cabecalho
        kicker="CONFIGURAÇÃO"
        titulo={site.name}
        estado={{
          tipo: site.estado,
          detalhe: site.ultimoEvento ? `último evento em ${dataHora(site.ultimoEvento, site.timezone)}` : undefined,
        }}
        meta={`${site.domain} · ${PLATAFORMA_LABEL[config.plataforma]}`}
      />

      <div className="abas">
        <Abas siteId={site.id} />
      </div>

      <div className="pagina">
        {/*
          O QUE FAZER AGORA, antes da lista de etapas.

          "Etapa 4 de 7" diz a posição e não diz a tarefa. Quem abre esta tela
          no meio do processo tinha de ler as sete para descobrir onde parou.

          Aparece mesmo quando o operador está navegando por outra etapa: nesse
          caso ele vê que está fora do caminho e tem um link de volta. Esconder
          a pendência porque a pessoa foi olhar outra coisa é como o painel
          esquece de cobrar.
        */}
        {/*
          NÃO é `role="status"`.

          Uma região viva anuncia a si mesma a cada renderização, e este bloco
          está sempre na tela — o leitor de tela repetiria a próxima ação a cada
          navegação, competindo com o retorno real dos formulários ("Cliente
          criado", "1 recurso selecionado"), que É um aviso ao vivo e é o que
          precisa ser ouvido naquele instante.

          É conteúdo permanente que descreve o estado: uma seção nomeada, lida
          na ordem do documento.
        */}
        <section
          aria-label="Próxima ação"
          data-testid="proxima-acao"
          style={{
            border: `1px solid ${acao.etapa === 'resumo' ? 'var(--gold)' : 'var(--warn-tx)'}`,
            borderRadius: 12,
            background: acao.etapa === 'resumo' ? 'var(--ok-bg)' : 'var(--warn-bg)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 10.5, letterSpacing: '.12em', color: 'var(--tx3)' }}
          >
            {acao.etapa === 'resumo' ? 'CONFIGURAÇÃO VERIFICADA' : 'PRÓXIMA AÇÃO'}
          </span>
          <strong style={{ fontSize: 14.5, lineHeight: 1.5 }}>{acao.frase}</strong>
          <span style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6 }}>{acao.motivo}</span>
          {acao.etapa !== etapa && (
            <Link
              href={`/sites/${site.id}/configurar?etapa=${acao.etapa}`}
              style={{ fontSize: 13, marginTop: 2 }}
            >
              Ir para {ETAPAS.find((e) => e.slug === acao.etapa)!.titulo.toLowerCase()} →
            </Link>
          )}
        </section>

        <Passos siteId={site.id} atual={etapa} situacao={situacao} />

        <Painel
          titulo={titulo}
          subtitulo={
            etapa === 'resumo'
              ? 'O que está verificado, o que falta e o que não se aplica'
              : `Etapa ${ETAPAS.find((e) => e.slug === etapa)!.numero} de ${ETAPAS.length}`
          }
        >
          {etapa === 'identificacao' && (
            <EtapaIdentificacao
              siteId={site.id}
              clientes={clientes.map((c) => ({ id: c.id, name: c.name }))}
              atual={{
                clienteId: site.clientId,
                nome: site.name,
                dominio: site.domain,
                fuso: site.timezone,
                plataforma: config.plataforma,
                urlPrincipal: config.urlPrincipal,
              }}
            />
          )}

          {etapa === 'recursos' && (
            <EtapaRecursos
              siteId={site.id}
              selecionados={config.features.filter((f) => f.selecionado).map((f) => f.recurso)}
            />
          )}

          {etapa === 'instalacao' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* A explicação vem ANTES do bloco de código, de propósito: um
                  paredão de código antes de dizer o que fazer com ele é o jeito
                  mais rápido de perder quem está instalando. */}
              <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.7 }}>
                <strong>Onde vai:</strong> {instrucao.onde}
              </p>
              <ol style={{ paddingLeft: 20, fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.9 }}>
                {instrucao.passos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
              <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.7 }}>
                <strong>Para publicar:</strong> {instrucao.publicar}
              </p>

              <Snippet codigo={snippet} rotulo={`Código deste site · endpoint ${endpoint}`} />
              <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
                Copiar confirma a cópia, e só isso. A instalação é confirmada na etapa seguinte, por um evento que
                chegue ao servidor.
              </p>

              {/*
                Instalação assistida (§5).
                Não é "conectar o GitHub": não há OAuth aqui, e fingir que há
                seria pior que não oferecer nada. O que existe é o caminho que
                de fato funciona hoje — levar a instrução para onde o
                repositório está aberto.

                O texto leva APENAS dado público: domínio, identificador e
                endereço do coletor. Nenhum token. Isso é requisito, não zelo:
                ele nasce para ser colado num chat, e chat é colado no lugar
                errado com frequência.
              */}
              <details
                style={{
                  border: '1px solid var(--bd)',
                  borderRadius: 10,
                  padding: '12px 14px',
                  background: 'var(--card)',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 13.5, color: 'var(--tx)' }}>
                  Prefere que outra pessoa — ou o Claude Code — instale para você?
                </summary>
                <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.7, margin: '10px 0' }}>
                  Copie o texto abaixo e cole numa sessão aberta no repositório do site. Ele manda
                  <strong> inspecionar antes de editar</strong>, não instalar duas vezes, preservar o banner de
                  consentimento e — se houver formulário — <strong>não substituir</strong> o destino atual.
                </p>
                <Snippet
                  codigo={instrucaoParaClaudeCode({
                    endpoint,
                    publicId: site.publicId,
                    dominio: site.domain,
                    plataforma: PLATAFORMA_LABEL[config.plataforma],
                    comFormulario: recurso('formularios').selecionado,
                  })}
                  rotulo="Instrução para colar no repositório do site"
                />
                <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6, marginTop: 10 }}>
                  Só dado público vai neste texto: domínio, identificador do site e endereço do coletor. Nenhum
                  token, nenhuma senha. E instalar por este caminho também não conclui a etapa — quem conclui é a
                  verificação, na etapa seguinte.
                </p>
              </details>

              {instrucao.observacao && (
                <p style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.7 }}>{instrucao.observacao}</p>
              )}

              {site.totalEventos > 0 && (
                <p role="status" style={{ fontSize: 13, color: 'var(--ok-tx)' }}>
                  Este site já recebeu {site.totalEventos} evento(s). O rastreamento está de pé — não instale de novo,
                  duas tags em lugares diferentes viram manutenção esquecida.
                </p>
              )}

              <p>
                <Link href={`/sites/${site.id}/configurar?etapa=verificacao`}>Ir para a verificação →</Link>
              </p>
            </div>
          )}

          {etapa === 'verificacao' && (
            <EtapaVerificacao
              siteId={site.id}
              fuso={site.timezone}
              urlBase={urlBase}
              selecionados={selecionadosDoColetor}
              jaVerificados={verificadosDoColetor}
              sessaoAberta={sessaoAberta}
            />
          )}

          {etapa === 'formularios' && (
            <EtapaFormularios
              siteId={site.id}
              modo={config.modoFormulario}
              endpoint={endpoint}
              publicId={site.publicId}
              verificado={recurso('formularios').estado === 'verificado'}
              urlBase={urlBase}
              sessaoAberta={sessaoAberta}
            />
          )}

          {etapa === 'qualidade' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.7 }}>
                Este caminho é <strong>independente do rastreamento</strong>: funciona com a URL pública, sem instalar
                nada no site. Também não mede visitas nem leads — nota de desempenho não é audiência.
              </p>
              <PainelDeAnalise
                siteId={site.id}
                urls={urlsMonitoradas}
                configurada={config.pagespeedConfigurado}
                dominio={site.domain}
              />
              <EtapaQualidade siteId={site.id} configurada={config.pagespeedConfigurado} />
            </div>
          )}

          {etapa === 'resumo' && (
            <Resumo
              siteId={site.id}
              fuso={site.timezone}
              completo={situacao.resumo === 'concluida'}
              linhas={config.features.map((f) => ({
                recurso: f.recurso,
                estado: f.estado,
                verificadoEm: f.verificadoEm,
                erro: f.erro,
              }))}
            />
          )}
        </Painel>

        {etapa !== 'resumo' && (
          <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
            <Link href={`/sites/${site.id}/configurar?etapa=resumo`}>Ver o resumo da configuração</Link>
            {' · '}
            <Link href="/sites">Voltar à lista de sites</Link>
          </p>
        )}
      </div>
    </>
  );
}

/** Etapa 7 — o que está pronto, o que falta, e o que não se aplica. */
function Resumo({
  siteId,
  completo,
  linhas,
  fuso,
}: {
  siteId: string;
  completo: boolean;
  /** Fuso do site: a data de verificação pertence a ele, não ao servidor. */
  fuso: string;
  linhas: {
    recurso: Recurso;
    estado: keyof typeof ESTADO_RECURSO_LABEL;
    verificadoEm: Date | null;
    erro: string | null;
  }[];
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {linhas.map((l) => (
          <li
            key={l.recurso}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}
          >
            <span style={{ flex: '1 1 240px', fontSize: 13.5 }}>{RECURSO_LABEL[l.recurso]}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
              <Etiqueta texto={ESTADO_RECURSO_LABEL[l.estado]} tom={ESTADO_RECURSO_TOM[l.estado]} />
              {l.verificadoEm && (
                <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>
                  verificado em {dataHora(l.verificadoEm, fuso)}
                </span>
              )}
              {l.erro && <span style={{ fontSize: 11, color: 'var(--neg)', maxWidth: 380 }}>{l.erro}</span>}
            </span>
          </li>
        ))}
      </ul>

      {/*
        "Tudo pronto" só aparece quando todo recurso ESCOLHIDO está verificado.
        Enquanto houver um selecionado sem verificação, a tela diz o que falta —
        dizer "tudo pronto" com pendência aberta é o tipo de mensagem que faz o
        operador descobrir o problema só no relatório do mês seguinte.
      */}
      <p
        role="status"
        style={{ fontSize: 13.5, color: completo ? 'var(--ok-tx)' : 'var(--warn-tx)', lineHeight: 1.7 }}
      >
        {completo
          ? 'Tudo o que você selecionou está verificado.'
          : 'Ainda há recursos selecionados sem verificação. Eles continuam na lista até funcionarem de verdade.'}
      </p>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5 }}>
        <Link href={`/sites/${siteId}/desempenho`}>Abrir painel do site →</Link>
        {!completo && <Link href={`/sites/${siteId}/configurar`}>Resolver pendências</Link>}
        <Link href="/sites">Voltar à lista de sites</Link>
      </div>
    </div>
  );
}
