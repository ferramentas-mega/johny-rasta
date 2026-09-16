'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';
import { Campo, Selecao, BotaoSubmeter, BotaoSecundario, Retorno, ESTADO_VAZIO } from '@/components/Formulario';
import { salvarSite, removerSite } from './acoes';
import { FUSOS } from '@/lib/fusos';

export type SiteEditavel = { id: string; name: string; domain: string; timezone: string; clientId: string };


export function FormularioSite({
  clientes,
  emEdicao,
}: {
  clientes: { id: string; name: string }[];
  emEdicao?: SiteEditavel;
}) {
  const [estado, acao] = useActionState(salvarSite, ESTADO_VAZIO);
  const [aberto, setAberto] = useState(!!emEdicao);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok && !emEdicao) formRef.current?.reset();
  }, [estado.ok, emEdicao]);

  if (clientes.length === 0) {
    return (
      <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
        Cadastre um cliente antes: todo site pertence a um cliente.
      </p>
    );
  }

  if (!aberto) {
    return <BotaoSecundario onClick={() => setAberto(true)}>+ Novo site</BotaoSecundario>;
  }

  return (
    <form
      ref={formRef}
      action={acao}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        border: '1px solid var(--bd)',
        borderRadius: 'var(--raio-m)',
        padding: 16,
        background: 'var(--elev)',
        minWidth: 300,
      }}
    >
      {emEdicao && <input type="hidden" name="id" value={emEdicao.id} />}
      <Selecao
        nome="clienteId"
        rotulo="Cliente"
        padrao={emEdicao?.clientId}
        erro={estado.campos?.clienteId}
        opcoes={clientes.map((c) => ({ valor: c.id, texto: c.name }))}
      />
      <Campo nome="nome" rotulo="Nome do site" required defaultValue={emEdicao?.name} erro={estado.campos?.nome} />
      <Campo
        nome="dominio"
        rotulo="Domínio"
        required
        placeholder="meucliente.com.br"
        defaultValue={emEdicao?.domain}
        dica="Sem http:// e sem barra final. Só este domínio pode enviar eventos."
        erro={estado.campos?.dominio}
      />
      <Selecao
        nome="fuso"
        rotulo="Fuso horário"
        padrao={emEdicao?.timezone ?? 'America/Sao_Paulo'}
        erro={estado.campos?.fuso}
        opcoes={FUSOS.map((f) => ({ valor: f, texto: f }))}
      />
      <Retorno estado={estado} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <BotaoSubmeter>{emEdicao ? 'Salvar alterações' : 'Cadastrar site'}</BotaoSubmeter>
        {emEdicao ? (
          /*
           * Em edição a saída é um LINK, não um botão de estado local.
           *
           * O alvo da edição vem da URL (`?editar=<id>`), então fechar só no
           * cliente não resolve: bastaria recarregar para o formulário reabrir
           * no mesmo site. Pior, era assim que a tela ficava depois de salvar —
           * a mensagem de sucesso aparecia e o formulário continuava aberto no
           * mesmo lugar, sem nada para clicar. Parecia que a edição não tinha
           * pegado.
           */
          <Link href="/sites" style={{ fontSize: 'var(--tipo-corpo)', color: 'var(--tx2)' }}>
            {estado.ok ? 'Voltar para a lista' : 'Cancelar'}
          </Link>
        ) : (
          <BotaoSecundario onClick={() => setAberto(false)}>Cancelar</BotaoSecundario>
        )}
      </div>

      {emEdicao && <Arquivar site={emEdicao} />}
    </form>
  );
}

/**
 * Arquivar um site.
 *
 * `removerSite` existia desde o começo e **nenhum componente a importava** —
 * recurso inteiro no servidor, sem porta na interface. Mesma família do que
 * acontecia com a própria edição.
 *
 * Duas decisões sobre o desenho:
 *
 * 1. **Não fica no cartão.** O cartão é um resumo denso, lido de relance; um
 *    controle destrutivo ali é fácil de acertar sem querer. Aqui dentro, quem
 *    chega abriu a edição de propósito.
 * 2. **Dois passos, com o nome à vista.** Sem `confirm()` do navegador — ele é
 *    bloqueável, não estiliza e não diz o que vai acontecer. O primeiro clique
 *    revela a consequência; o segundo executa.
 *
 * E a consequência é dita inteira. "Arquivar" soa como esconder da lista, e
 * para de coletar: as políticas dos papéis públicos casam por site não
 * arquivado, então o `t.js` continua na página do cliente e os eventos passam a
 * ser recusados. Quem não souber disso vai procurar o defeito no site.
 */
function Arquivar({ site }: { site: SiteEditavel }) {
  const [estado, acao] = useActionState(removerSite, ESTADO_VAZIO);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        style={{
          alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0,
          fontSize: 'var(--tipo-apoio)', color: 'var(--tx3)', cursor: 'pointer', textDecoration: 'underline',
        }}
      >
        Arquivar este site
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--neg)', borderRadius: 'var(--raio-p)', padding: 12,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <p style={{ fontSize: 'var(--tipo-apoio)', lineHeight: 1.7, margin: 0 }}>
        Arquivar <strong>{site.name}</strong>?
        <span style={{ display: 'block', color: 'var(--tx2)', marginTop: 4 }}>
          O histórico é preservado e nada é apagado. Mas a <strong>coleta para</strong>: o script
          continua na página do cliente e os eventos passam a ser recusados, porque só site ativo
          recebe. O site sai das listas e dos relatórios.
        </span>
      </p>
      {estado.erro && (
        <p role="alert" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--neg-tx)', margin: 0 }}>{estado.erro}</p>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          type="submit"
          formAction={acao}
          // Sem isto, um campo obrigatório vazio do formulário de EDIÇÃO
          // bloquearia o arquivamento, que não depende de nenhum deles.
          formNoValidate
          name="id"
          value={site.id}
          style={{
            background: 'var(--neg)', color: 'var(--card)', border: 'none', borderRadius: 'var(--raio-p)',
            padding: '8px 12px', fontSize: 'var(--tipo-apoio)', cursor: 'pointer',
          }}
        >
          Arquivar mesmo assim
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          style={{ background: 'none', border: 'none', fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)', cursor: 'pointer' }}
        >
          Manter o site
        </button>
      </div>
    </div>
  );
}
