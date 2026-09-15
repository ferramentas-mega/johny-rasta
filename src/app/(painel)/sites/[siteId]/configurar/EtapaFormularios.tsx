'use client';

import { useActionState } from 'react';
import { BotaoSubmeter, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { MODO_FORMULARIO_LABEL, type ModoFormulario } from '@/lib/recursos';
import { salvarFormulario, iniciarDiagnostico, conferirDiagnostico, type EstadoDiagnostico } from './acoes';
import { Snippet } from '../rastreamento/Snippet';
import { snippetFormulario, snippetFormularioAutomatico } from '@/lib/snippets';

/**
 * Etapa 5 — formulários.
 *
 * A distinção que esta etapa existe para manter, e que a maioria dos painéis
 * perde: **quatro coisas diferentes**, que o produto nunca trata como uma só.
 *
 *  1. Clique para abrir o formulário — interesse.
 *  2. Tentativa de envio — o navegador disparou o submit.
 *  3. Submissão recebida — o servidor validou e gravou.
 *  4. Lead registrado — o contato foi criado ou associado.
 *
 * Só a 3 confirma recebimento, e só a 4 vira lead. O evento de submit do
 * navegador, sozinho, não prova que nada chegou: a requisição pode ter falhado
 * no caminho.
 */
export function EtapaFormularios({
  siteId,
  modo,
  endpoint,
  publicId,
  verificado,
  urlBase,
  sessaoAberta,
}: {
  siteId: string;
  modo: ModoFormulario | null;
  endpoint: string;
  publicId: string;
  verificado: boolean;
  urlBase: string;
  sessaoAberta: { token: string; url: string; expiraEm: string } | null;
}) {
  const [estado, acao] = useActionState(salvarFormulario, ESTADO_VAZIO);

  const snippet = snippetFormulario(endpoint, publicId);
  const automatico = snippetFormularioAutomatico(endpoint, publicId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="hidden" name="siteId" value={siteId} />

        <fieldset
          style={{
            border: '1px solid var(--bd)', borderRadius: 10, padding: 16,
            background: 'var(--elev)', display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 600 }}>
            Como o formulário deste site funciona?
          </legend>

          {(Object.keys(MODO_FORMULARIO_LABEL) as ModoFormulario[]).map((opcao) => (
            <label key={opcao} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="radio"
                name="modo"
                value={opcao}
                defaultChecked={modo === opcao}
                style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--gold)' }}
              />
              <span>
                <span style={{ fontSize: 13.5 }}>{MODO_FORMULARIO_LABEL[opcao]}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--tx2)', marginTop: 2 }}>
                  {opcao === 'proprio' && 'O HTML do formulário está no site e pode apontar para o painel.'}
                  {opcao === 'externo' && 'RD Station, HubSpot, Typeform e afins. Veja a limitação abaixo.'}
                  {opcao === 'sem' && 'O site não tem formulário. Esta etapa passa a não se aplicar.'}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <Retorno estado={estado} />
        <div>
          <BotaoSubmeter>Salvar</BotaoSubmeter>
        </div>
      </form>

      {modo === 'proprio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
            <strong>Cole esta linha e pronto.</strong> Ela escuta o formulário que o site já tem e manda
            uma cópia dos campos de contato para o painel. Não renomeia campo, não troca o{' '}
            <span className="mono">action</span> e não cancela o envio — o que já funciona continua
            funcionando, inclusive se este script falhar. Serve para formulário em popup e para
            formulário que só aparece depois de um clique.
          </p>
          <Snippet codigo={automatico} rotulo="Coletor de formulários deste site" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            Só saem daqui <strong>nome, e-mail, telefone e mensagem</strong>, reconhecidos pelo tipo e pelo
            nome do campo — nenhum campo desconhecido é enviado. Formulário que tenha campo de senha é
            ignorado por inteiro: login não é contato. Para excluir um formulário específico, ponha{' '}
            <span className="mono">data-painel-ignorar</span> nele.
          </p>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--tx2)' }}>
              Não tenho formulário neste site — me dê um pronto
            </summary>
            <p style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.6, marginTop: 8 }}>
              Este é um formulário completo, que já envia direto para o painel. Use só se a página ainda
              não tiver um: se já tiver, prefira a linha acima e <strong>não troque o destino</strong> do
              que existe.
            </p>
            <Snippet codigo={snippet} rotulo="Formulário completo, pronto para colar" />
          </details>
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            O exemplo acima funciona como está — não há campo para preencher à mão. Ele gera a chave de
            idempotência uma vez por formulário preenchido (é ela que faz um reenvio não virar um segundo lead)
            e só a renova depois de um envio confirmado pelo servidor. O identificador de visitante vai junto
            quando o coletor está na página, e vai vazio quando não está: <strong>quem bloqueia analytics
            precisa conseguir mandar a mensagem do mesmo jeito.</strong>
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            Se o formulário do site já envia para um CRM, planilha ou e-mail, <strong>não troque o destino</strong>.
            O caminho é um envio adicional para este endereço, preservando o que já funciona.
          </p>
        </div>
      )}

      {modo === 'externo' && (
        <div
          role="alert"
          style={{
            border: '1px solid var(--warn-tx)', borderRadius: 10, padding: 14,
            background: 'var(--warn-bg)', fontSize: 13, lineHeight: 1.7,
          }}
        >
          <strong>Nenhum conector para serviço externo está implementado.</strong>
          <p style={{ marginTop: 6, color: 'var(--tx2)' }}>
            Prometer integração automática com qualquer plataforma seria prometer o que não existe. O que funciona
            hoje: o serviço externo precisa entregar o envio ao endpoint de formulários acima — por webhook, quando a
            plataforma oferecer, ou por um passo intermediário que faça esse POST.
          </p>
          <p style={{ marginTop: 6, color: 'var(--tx2)' }}>
            Enquanto isso não existir, o clique que abre o formulário continua sendo medido (é um{' '}
            <span className="mono">cta_click</span> com subtipo <span className="mono">form_open</span>), e o painel
            não conta isso como envio nem como lead.
          </p>
        </div>
      )}

      {modo === 'sem' && (
        <p style={{ fontSize: 13, color: 'var(--tx2)' }}>
          Sem formulário. Esta etapa aparece como <strong>Não se aplica</strong> no resumo, e não conta como pendência.
        </p>
      )}

      {verificado ? (
        <p role="status" style={{ fontSize: 13, color: 'var(--ok-tx)' }}>
          Já recebemos um envio gravado por este site. O recebimento está verificado.
        </p>
      ) : (
        modo &&
        modo !== 'sem' && (
          <FaltaOEnvio siteId={siteId} urlBase={urlBase} sessaoAberta={sessaoAberta} />
        )
      )}
    </div>
  );
}

/**
 * O que ainda falta para a etapa fechar — e como fazer, aqui mesmo.
 *
 * Antes, escolher o modo e salvar era tudo o que esta tela oferecia, e a etapa
 * continuava pendente: ela só fecha quando o endpoint RECEBE um envio de
 * verdade. Nada na tela dizia isso, e o aviso de próxima ação repetia "diga como
 * o formulário deste site funciona" — exatamente o que a pessoa acabara de
 * fazer. Salvava de novo, nada mudava, e a conclusão razoável era que o
 * assistente estava quebrado.
 *
 * O caminho de verificação é o MESMO da etapa 4 — a sessão de diagnóstico é uma
 * só por site, e o envio precisa chegar com o token para não confundir o teste
 * do operador com um lead de verdade. Por isso aqui reaproveita as mesmas
 * Actions em vez de inventar um segundo mecanismo: dois caminhos divergiriam na
 * primeira correção feita só num deles.
 */
function FaltaOEnvio({
  siteId,
  urlBase,
  sessaoAberta,
}: {
  siteId: string;
  urlBase: string;
  sessaoAberta: { token: string; url: string; expiraEm: string } | null;
}) {
  const [inicio, acaoIniciar] = useActionState(iniciarDiagnostico, {} as EstadoDiagnostico);
  const [conferencia, acaoConferir] = useActionState(conferirDiagnostico, {} as EstadoDiagnostico);

  const token = conferencia.token ?? inicio.token ?? sessaoAberta?.token;
  const url = inicio.url ?? sessaoAberta?.url;

  return (
    <div
      style={{
        border: '1px solid var(--bdc)', borderRadius: 10, padding: 14,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div>
        <strong style={{ fontSize: 13.5 }}>Falta o principal: receber um envio.</strong>
        <p style={{ fontSize: 12.5, color: 'var(--tx2)', marginTop: 6, lineHeight: 1.7 }}>
          O modo está salvo, e isso é configuração — não é recebimento. Esta etapa só fecha quando o
          endpoint gravar uma submissão de verdade, porque &quot;alguém clicou em enviar&quot; e &quot;o
          servidor gravou um lead&quot; são fatos diferentes, e só o segundo vira contato.
        </p>
      </div>

      {!url ? (
        <form action={acaoIniciar} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input type="hidden" name="siteId" value={siteId} />
          <input type="hidden" name="base" value={urlBase} />
          <div>
            <BotaoSubmeter ocupado="Abrindo…">Abrir modo de diagnóstico</BotaoSubmeter>
          </div>
          {inicio.erro && (
            <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>{inicio.erro}</p>
          )}
        </form>
      ) : (
        <>
          <ol style={{ paddingLeft: 20, fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.9, margin: 0 }}>
            <li>Abra o site por este link (é ele que marca o envio como teste):</li>
          </ol>
          <a
            className="mono"
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, wordBreak: 'break-all' }}
          >
            {url}
          </a>
          <ol
            start={2}
            style={{ paddingLeft: 20, fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.9, margin: 0 }}
          >
            <li>Preencha e envie o formulário do site.</li>
            <li>Volte aqui e confira.</li>
          </ol>

          <form action={acaoConferir} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="hidden" name="siteId" value={siteId} />
            <input type="hidden" name="token" value={token ?? ''} />
            <div>
              <BotaoSubmeter ocupado="Consultando o servidor…">Conferir envios recebidos</BotaoSubmeter>
            </div>

            {conferencia.erro && (
              <p role="alert" style={{ fontSize: 12.5, color: 'var(--neg)' }}>{conferencia.erro}</p>
            )}

            {conferencia.conferidoEm && (
              <p role="status" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
                {(conferencia.formularios ?? 0) > 0 ? (
                  <span style={{ color: 'var(--ok-tx)' }}>
                    {conferencia.formularios} envio(s) gravado(s). O recebimento está verificado.
                  </span>
                ) : (
                  <span style={{ color: 'var(--tx2)' }}>
                    Nenhum envio gravado ainda neste diagnóstico. Se você enviou e não apareceu, o{' '}
                    <span className="mono">action</span> do formulário provavelmente não aponta para o
                    endereço acima — ou a resposta do servidor foi erro, e o site engoliu.
                  </span>
                )}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
