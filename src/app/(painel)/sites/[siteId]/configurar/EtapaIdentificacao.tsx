'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Campo, Selecao, BotaoSubmeter, BotaoSecundario, Retorno } from '@/components/Formulario';
import { PLATAFORMA_LABEL, type Plataforma } from '@/lib/recursos';
import { salvarIdentificacao, criarClienteRapido, type EstadoIdentificacao } from './acoes';
import type { EstadoFormulario } from '@/components/Formulario';

/** O retorno de `criarClienteRapido`, que traz o id do cliente recém-criado. */
type EstadoCliente = EstadoFormulario & { clienteId?: string };
const CLIENTE_VAZIO: EstadoCliente = {};

/** Fusos do Brasil. Lista curta de propósito: cobre os casos reais sem virar um seletor de 400 itens. */
const FUSOS = [
  'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza', 'America/Recife',
  'America/Belem', 'America/Manaus', 'America/Cuiaba', 'America/Campo_Grande',
  'America/Porto_Velho', 'America/Rio_Branco', 'America/Noronha', 'UTC',
];

const ESTADO_INICIAL: EstadoIdentificacao = {};

/**
 * Etapa 1 — quem é este site.
 *
 * Duas coisas que esta etapa faz e o cadastro antigo não fazia:
 *
 * 1. **Detecta domínio duplicado** e oferece o registro existente, em vez de
 *    criar um segundo site em silêncio. Dois cadastros do mesmo domínio partem
 *    a medição em dois lugares sem ninguém perceber.
 * 2. **Permite criar o cliente aqui**, sem sair da tela. Mandar o operador para
 *    a tela de clientes faria ele perder o que já digitou sobre o site.
 */
export function EtapaIdentificacao({
  siteId,
  clientes,
  atual,
}: {
  siteId: string;
  clientes: { id: string; name: string }[];
  atual: {
    clienteId: string;
    nome: string;
    dominio: string;
    fuso: string;
    plataforma: Plataforma;
    urlPrincipal: string | null;
  };
}) {
  const [estado, acao] = useActionState(salvarIdentificacao, ESTADO_INICIAL);
  const [novoCliente, setNovoCliente] = useState(false);
  const [estadoCliente, acaoCliente] = useActionState(criarClienteRapido, CLIENTE_VAZIO);

  // O cliente recém-criado passa a ser o selecionado. Os demais campos do
  // formulário principal não são tocados: eles vivem em outro <form>, e o React
  // não os remonta.
  const clienteSelecionado = estadoCliente.clienteId ?? atual.clienteId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13.5, color: 'var(--tx2)', lineHeight: 1.6 }}>
        O domínio define qual origem pode enviar eventos, e o fuso define onde começa o dia nos relatórios.
        A plataforma decide quais instruções de instalação você verá na etapa 3.
      </p>

      {novoCliente ? (
        <form
          action={acaoCliente}
          style={{
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end',
            border: '1px solid var(--bd)', borderRadius: 10, padding: 14, background: 'var(--elev)',
          }}
        >
          <div style={{ flex: '1 1 220px' }}>
            <Campo nome="nome" rotulo="Nome do novo cliente" required autoFocus />
          </div>
          <BotaoSubmeter>Criar cliente</BotaoSubmeter>
          <BotaoSecundario onClick={() => setNovoCliente(false)}>Cancelar</BotaoSecundario>
          <div style={{ flexBasis: '100%' }}>
            <Retorno estado={estadoCliente} />
          </div>
        </form>
      ) : null}

      <form action={acao} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input type="hidden" name="siteId" value={siteId} />

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <Selecao
              nome="clienteId"
              rotulo="Cliente responsável"
              // A chave remonta o seletor quando um cliente é criado, para que o
              // novo apareça já escolhido em vez de exigir um recarregamento.
              key={clienteSelecionado}
              padrao={clienteSelecionado}
              erro={estado.campos?.clienteId}
              opcoes={clientes.map((c) => ({ valor: c.id, texto: c.name }))}
            />
          </div>
          {!novoCliente && (
            <BotaoSecundario onClick={() => setNovoCliente(true)}>+ Novo cliente</BotaoSecundario>
          )}
        </div>

        <Campo nome="nome" rotulo="Nome do site" required defaultValue={atual.nome} erro={estado.campos?.nome} />

        <Campo
          nome="dominio"
          rotulo="Domínio"
          required
          placeholder="meucliente.com.br"
          defaultValue={atual.dominio}
          dica="Sem http:// e sem barra final. Só este domínio pode enviar eventos."
          erro={estado.campos?.dominio}
        />

        <Campo
          nome="urlPrincipal"
          rotulo="URL principal"
          type="url"
          placeholder="https://meucliente.com.br/"
          defaultValue={atual.urlPrincipal ?? ''}
          dica="É a página que o modo de diagnóstico abre e a primeira candidata à análise técnica."
          erro={estado.campos?.urlPrincipal}
        />

        <Selecao
          nome="plataforma"
          rotulo="Plataforma"
          padrao={atual.plataforma}
          erro={estado.campos?.plataforma}
          opcoes={(Object.keys(PLATAFORMA_LABEL) as Plataforma[]).map((p) => ({
            valor: p,
            texto: PLATAFORMA_LABEL[p],
          }))}
        />

        <Selecao
          nome="fuso"
          rotulo="Fuso horário"
          padrao={atual.fuso}
          erro={estado.campos?.fuso}
          opcoes={FUSOS.map((f) => ({ valor: f, texto: f }))}
        />

        {estado.duplicado && (
          <div
            role="alert"
            style={{
              border: '1px solid var(--warn-tx)', borderRadius: 10, padding: 14,
              background: 'var(--warn-bg)', fontSize: 13, lineHeight: 1.6,
            }}
          >
            <strong>Este domínio já está cadastrado.</strong>
            <p style={{ marginTop: 6, color: 'var(--tx2)' }}>
              O site <strong>{estado.duplicado.name}</strong> (cliente {estado.duplicado.clienteNome}) já usa{' '}
              <span className="mono">{estado.duplicado.domain}</span>. Dois cadastros do mesmo domínio partem a
              medição em dois lugares, e nenhum dos dois mostra o total.
            </p>
            <p style={{ marginTop: 8 }}>
              <Link href={`/sites/${estado.duplicado.id}/configurar`}>Abrir a configuração do site existente →</Link>
            </p>
          </div>
        )}

        <Retorno estado={estado} />
        <div>
          <BotaoSubmeter>Salvar e continuar</BotaoSubmeter>
        </div>
      </form>
    </div>
  );
}
