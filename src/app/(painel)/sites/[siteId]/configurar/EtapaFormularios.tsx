'use client';

import { useActionState } from 'react';
import { BotaoSubmeter, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { MODO_FORMULARIO_LABEL, type ModoFormulario } from '@/lib/recursos';
import { salvarFormulario } from './acoes';
import { Snippet } from '../rastreamento/Snippet';

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
}: {
  siteId: string;
  modo: ModoFormulario | null;
  endpoint: string;
  publicId: string;
  verificado: boolean;
}) {
  const [estado, acao] = useActionState(salvarFormulario, ESTADO_VAZIO);

  const snippet = [
    `<form method="post" action="${endpoint}/api/forms/${publicId}">`,
    '  <input name="nome" required>',
    '  <input name="email" type="email">',
    '  <input name="telefone">',
    '  <input type="hidden" name="formulario" value="Fale conosco">',
    '  <!-- Gere UMA vez por formulário preenchido, não por tentativa de envio: -->',
    '  <input type="hidden" name="idempotencia" value="PREENCHER_COM_crypto.randomUUID()">',
    '  <input type="hidden" name="visitante" value="PREENCHER_COM_painel.visitante()">',
    '  <button type="submit">Enviar</button>',
    '</form>',
  ].join('\n');

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
            Aponte o <span className="mono">action</span> do formulário para o endpoint do painel. O servidor valida
            os campos, grava a submissão, cria ou associa o lead e só então confirma. Se a gravação falhar, a resposta
            é erro — nunca uma confirmação sem lead correspondente.
          </p>
          <Snippet codigo={snippet} rotulo="Endpoint de formulários deste site" />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.6 }}>
            A chave de idempotência é gerada uma vez por formulário preenchido. É ela que faz o reenvio da mesma
            submissão não criar um segundo lead.
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

      {verificado && (
        <p role="status" style={{ fontSize: 13, color: 'var(--ok-tx)' }}>
          Já recebemos um envio gravado por este site. O recebimento está verificado.
        </p>
      )}
    </div>
  );
}
