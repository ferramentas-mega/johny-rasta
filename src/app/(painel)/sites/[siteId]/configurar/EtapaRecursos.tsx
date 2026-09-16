'use client';

import { useActionState } from 'react';
import { BotaoSubmeter, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import {
  RECURSOS,
  RECURSO_LABEL,
  RECURSO_EXPLICACAO,
  RECURSOS_DO_COLETOR,
  type Recurso,
} from '@/lib/recursos';
import { salvarEscolhaDeRecursos } from './acoes';

/**
 * Etapa 2 — o que este site precisa medir.
 *
 * Nada aqui é obrigatório. Um site institucional sem formulário não deve ser
 * empurrado a configurar formulário para "completar" a configuração: recurso
 * não selecionado vira "Não se aplica", e some das pendências.
 *
 * A separação entre os dois caminhos é explícita na tela, porque ela é a coisa
 * que mais confunde: **a análise técnica não depende do rastreamento**. Dá para
 * medir a qualidade de um site onde ninguém instalou nada — e o PageSpeed nunca
 * vira fonte de visitas ou de leads.
 */
export function EtapaRecursos({
  siteId,
  selecionados,
}: {
  siteId: string;
  selecionados: Recurso[];
}) {
  const [estado, acao] = useActionState(salvarEscolhaDeRecursos, ESTADO_VAZIO);

  const grupo = (titulo: string, subtitulo: string, itens: Recurso[]) => (
    <fieldset
      style={{
        border: '1px solid var(--bd)',
        borderRadius: 'var(--raio-m)',
        padding: 16,
        background: 'var(--elev)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <legend style={{ padding: '0 6px', fontSize: 'var(--tipo-corpo)', fontWeight: 600 }}>{titulo}</legend>
      <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)', lineHeight: 1.6, marginTop: -4 }}>{subtitulo}</p>

      {itens.map((recurso) => {
        const info = RECURSO_EXPLICACAO[recurso];
        return (
          <label
            key={recurso}
            style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              name={`recurso:${recurso}`}
              defaultChecked={selecionados.includes(recurso)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--gold)' }}
            />
            <span>
              <span style={{ fontSize: 'var(--tipo-corpo)', color: 'var(--tx)' }}>{RECURSO_LABEL[recurso]}</span>
              <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)', marginTop: 3, lineHeight: 1.6 }}>
                <strong>Mede:</strong> {info.mede}
                <br />
                <strong>Precisa de:</strong> {info.exige}
                <br />
                <strong>Verificação:</strong> {info.verificacao}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );

  return (
    <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="siteId" value={siteId} />

      {grupo(
        'Medir visitas e contatos',
        'Precisa do script de coleta instalado no site, e de uma verificação com um gesto real.',
        RECURSOS.filter((r) => RECURSOS_DO_COLETOR.includes(r)),
      )}

      {grupo(
        'Analisar qualidade técnica',
        'Caminho independente: funciona com a URL pública, sem instalar nada no site. Não mede visitas nem leads.',
        RECURSOS.filter((r) => !RECURSOS_DO_COLETOR.includes(r)),
      )}

      <Retorno estado={estado} />
      <div>
        <BotaoSubmeter>Salvar seleção</BotaoSubmeter>
      </div>
    </form>
  );
}
