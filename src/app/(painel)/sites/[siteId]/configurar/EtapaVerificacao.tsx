'use client';

import { useActionState } from 'react';
import { BotaoSubmeter } from '@/components/Formulario';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { dataHora } from '@/lib/formato';
import {
  RECURSO_LABEL,
  MINUTOS_DE_DIAGNOSTICO,
  minutosRestantes,
  type Recurso,
  type EventoDiagnostico,
} from '@/lib/recursos';
import type { Diagnostico as DiagnosticoDeInstalacao } from '@/lib/instalacao';
import { iniciarDiagnostico, conferirDiagnostico, type EstadoDiagnostico } from './acoes';

/**
 * Etapa 4 — a verificação de verdade.
 *
 * O que esta tela NÃO faz, e é o motivo dela existir:
 *
 *  - **Não confirma por tempo.** Nenhum "aguarde 10 segundos e pronto". A
 *    confirmação é uma consulta ao banco.
 *  - **Não confirma por o script aparecer no HTML.** Um script presente e
 *    bloqueado por consentimento, por CSP ou por bloqueador não mede nada.
 *  - **Não confunde o teste com tráfego alheio.** O link carrega um token de
 *    diagnóstico; só os eventos que voltam com ele contam. Um visitante que
 *    clicou no WhatsApp no mesmo minuto não verifica a instalação de ninguém.
 *
 * Os eventos de diagnóstico nascem marcados como teste, no servidor, e ficam
 * fora de todos os relatórios comerciais.
 */
export function EtapaVerificacao({
  siteId,
  urlBase,
  selecionados,
  jaVerificados,
  sessaoAberta,
}: {
  siteId: string;
  urlBase: string;
  /** Recursos do coletor escolhidos na etapa 2. */
  selecionados: Recurso[];
  jaVerificados: Recurso[];
  /**
   * A sessão de diagnóstico já aberta para este site, lida do banco.
   *
   * É o que torna a etapa retomável: sem ela, recarregar a página perdia o
   * token, e o operador precisava abrir um diagnóstico novo — descartando os
   * eventos que ele acabou de gerar no site.
   */
  sessaoAberta: { token: string; url: string; expiraEm: string } | null;
}) {
  const [inicio, acaoIniciar] = useActionState(iniciarDiagnostico, {} as EstadoDiagnostico);
  const [conferencia, acaoConferir] = useActionState(conferirDiagnostico, {} as EstadoDiagnostico);

  // Ordem de precedência: o que esta conferência usou, o que este clique abriu,
  // e por fim o que já estava aberto no banco.
  const token = conferencia.token ?? inicio.token ?? sessaoAberta?.token;
  const url = inicio.url ?? sessaoAberta?.url;
  const eventos = conferencia.eventos ?? [];

  /**
   * Quanto tempo o diagnóstico ainda vale.
   *
   * O prazo existe porque o token viaja na URL do site do cliente, e todo
   * evento que chega com ele nasce marcado como TESTE. Um link esquecido numa
   * aba, ou colado num grupo, faria visitas reais sumirem dos relatórios — em
   * silêncio, até o fechamento do mês.
   *
   * Mostrar o prazo não é enfeite: sem ele, o operador que voltasse meia hora
   * depois clicaria em "Conferir" e veria zero eventos, sem entender por quê.
   */
  const expiraEm = inicio.expiraEm ?? sessaoAberta?.expiraEm;
  const restantes = expiraEm ? minutosRestantes(new Date(expiraEm)) : null;
  const vencido = restantes !== null && restantes === 0;

  const colunas: Coluna<EventoDiagnostico>[] = [
    { chave: 'quando', titulo: 'Recebido em', mono: true, render: (e) => dataHora(e.quando) },
    {
      chave: 'evento', titulo: 'Evento', mono: true,
      render: (e) => (e.subtipo ? `${e.tipo} · ${e.subtipo}` : e.tipo),
    },
    { chave: 'caminho', titulo: 'Página', mono: true, render: (e) => e.caminho ?? '—' },
    { chave: 'botao', titulo: 'Botão', mono: true, render: (e) => e.botao ?? '—' },
    {
      chave: 'validacao', titulo: 'Validação',
      render: (e) =>
        e.tipo === 'page_view'
          ? <Etiqueta texto="Visita confirmada" tom="ok" />
          : <Etiqueta texto={`Clique confirmado (${e.subtipo})`} tom="ok" />,
    },
  ];

  const faltando = selecionados.filter((r) => !jaVerificados.includes(r));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <ol style={{ paddingLeft: 20, fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.9 }}>
        <li>Abra o link de diagnóstico abaixo — ele abre o seu site com o teste ligado.</li>
        <li>Navegue por mais uma página do site.</li>
        <li>Clique no botão que você quer medir (WhatsApp, telefone ou e-mail).</li>
        <li>Volte aqui e clique em <strong>Conferir o que chegou</strong>.</li>
      </ol>

      {!url || vencido ? (
        <form action={acaoIniciar} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="base" value={urlBase} />
          {vencido && (
            <p role="status" style={{ fontSize: 12.5, color: 'var(--warn-tx)', lineHeight: 1.6 }}>
              O diagnóstico anterior venceu. Abrir outro gera um link novo — e o antigo para de marcar
              qualquer coisa como teste, que é o motivo de ele ter prazo.
            </p>
          )}
          <div>
            <BotaoSubmeter ocupado="Abrindo…">
              {vencido ? 'Abrir um diagnóstico novo' : 'Abrir modo de diagnóstico'}
            </BotaoSubmeter>
          </div>
          {inicio.erro && (
            <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>
              {inicio.erro}
            </p>
          )}
        </form>
      ) : (
        <div
          style={{
            border: '1px solid var(--bdc)', borderRadius: 10, padding: 14,
            background: 'var(--elev)', display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
            Abra este endereço no navegador. O token sobrevive à navegação entre as páginas do site, então dá
            para percorrer o site inteiro sem repetir o link.
          </span>
          {restantes !== null && (
            <span
              className="mono"
              data-testid="prazo-diagnostico"
              style={{ fontSize: 11.5, color: 'var(--warn-tx)' }}
            >
              VÁLIDO POR MAIS {restantes} MIN
            </span>
          )}
          <a
            className="mono"
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12.5, wordBreak: 'break-all' }}
          >
            {url}
          </a>
          {/* Dizer o PORQUÊ do prazo evita que ele pareça burocracia. */}
          <span style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            O prazo é de {MINUTOS_DE_DIAGNOSTICO} minutos porque este link marca como teste tudo o que
            chegar por ele. Sem vencimento, um endereço esquecido numa aba tiraria visitas reais dos
            relatórios sem ninguém notar.
          </span>
        </div>
      )}

      {token && !vencido && (
        <form action={acaoConferir} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="token" value={token} />
          <div>
            <BotaoSubmeter ocupado="Consultando o servidor…">Conferir o que chegou</BotaoSubmeter>
          </div>

          {conferencia.erro && (
            <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>
              {conferencia.erro}
            </p>
          )}

          {conferencia.conferidoEm && (
            <div role="status" style={{ fontSize: 13, lineHeight: 1.7 }}>
              {eventos.length === 0 ? (
                conferencia.diagnostico ? (
                  <Diagnostico diagnostico={conferencia.diagnostico} consoleTexto={conferencia.consoleTexto} />
                ) : (
                  <strong>Ainda não recebemos nenhum evento deste diagnóstico.</strong>
                )
              ) : (
                <>
                  <strong>
                    {eventos.length} evento(s) recebido(s) neste diagnóstico.
                  </strong>
                  {conferencia.verificados && conferencia.verificados.length > 0 && (
                    <p style={{ color: 'var(--ok-tx)', marginTop: 6 }}>
                      Verificado agora: {conferencia.verificados.map((r) => RECURSO_LABEL[r]).join(', ')}.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </form>
      )}

      {eventos.length > 0 && (
        <Tabela colunas={colunas} linhas={eventos} vazio="Nenhum evento neste diagnóstico." />
      )}

      {faltando.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
          Ainda sem verificação: <strong>{faltando.map((r) => RECURSO_LABEL[r]).join(', ')}</strong>. Faça o gesto
          correspondente no site com o diagnóstico aberto e confira de novo.
        </p>
      )}

      <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
        Tudo o que chega por este link nasce marcado como teste no servidor e fica fora dos relatórios comerciais —
        inclusive um envio de formulário feito durante o diagnóstico.
      </p>
    </div>
  );
}

/**
 * O diagnóstico da espera.
 *
 * Três blocos, nesta ordem, e a ordem é o ponto: **o que medimos**, depois a
 * causa provável, depois o que fazer. Começar pela causa seria dar palpite com
 * cara de certeza; quem lê precisa ver primeiro em cima de qual fato o palpite
 * foi construído, para poder discordar dele.
 *
 * A conferência pelo console só aparece quando ajuda. Oferecê-la no caso "faltou
 * abrir pelo link" mandaria a pessoa depurar uma instalação que está funcionando.
 */
function Diagnostico({
  diagnostico,
  consoleTexto,
}: {
  diagnostico: DiagnosticoDeInstalacao;
  consoleTexto?: string;
}) {
  const cor =
    diagnostico.tom === 'ok' ? 'var(--ok-tx)' : diagnostico.tom === 'warn' ? 'var(--tx)' : 'var(--neg)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <strong style={{ color: cor }}>{diagnostico.titulo}</strong>

      <p style={{ color: 'var(--tx2)', margin: 0 }}>{diagnostico.oQueSabemos}</p>

      {diagnostico.causaProvavel && (
        <p style={{ color: 'var(--tx2)', margin: 0 }}>
          <span style={{ color: 'var(--tx3)' }}>Causa mais provável: </span>
          {diagnostico.causaProvavel}
        </p>
      )}

      <p style={{ margin: 0 }}>
        <span style={{ color: 'var(--tx3)' }}>Próximo passo: </span>
        {diagnostico.proximaAcao}
      </p>

      {diagnostico.ofereceConsole && consoleTexto && (
        <details style={{ marginTop: 2 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--tx2)' }}>
            Conferir pelo navegador (descobre se a tag está lá e se ela roda)
          </summary>
          <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6, marginTop: 8 }}>
            Abra o site do cliente, pressione F12, vá em <span className="mono">Console</span> e cole o
            texto abaixo. Ele só lê a página — não envia evento nenhum, então não suja o relatório.
            Rodar aí é o que distingue &quot;a tag não está na página&quot; de &quot;está e foi
            bloqueada&quot;, que é uma diferença que nenhuma consulta feita daqui enxerga.
          </p>
          <pre
            className="mono"
            data-testid="conferencia-console"
            style={{
              fontSize: 11.5,
              lineHeight: 1.5,
              background: 'var(--elev)',
              border: '1px solid var(--bd)',
              borderRadius: 8,
              padding: 12,
              overflowX: 'auto',
              whiteSpace: 'pre',
              color: 'var(--tx2)',
            }}
          >
            {consoleTexto}
          </pre>
        </details>
      )}
    </div>
  );
}
