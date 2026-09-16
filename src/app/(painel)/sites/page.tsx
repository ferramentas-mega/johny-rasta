import Link from 'next/link';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel } from '@/components/Cartoes';
import { CartaoSite } from '@/components/CartaoSite';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { FormularioSite } from './FormularioSite';

export const dynamic = 'force-dynamic';

export default async function PaginaSites({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const busca = await searchParams;
  const ctx = await contextoPainel(busca);
  const filtrado = ctx.clientes.find((c) => c.id === ctx.clienteId);

  // A edição vive na URL, como os demais filtros: recarregar mantém o formulário
  // aberto no site certo, e o link é compartilhável.
  const editandoId = typeof busca.editar === 'string' ? busca.editar : null;
  const emEdicao = ctx.sites.find((s) => s.id === editandoId);

  // Uma consulta para todos os sites da tela, não uma por linha.
  const resumos = await resumoDeConfiguracao(
    ctx.usuario.accountId,
    ctx.sites.map((s) => s.id),
  );

  return (
    <>
      <Cabecalho
        kicker="SITES"
        titulo={filtrado ? `Sites de ${filtrado.name}` : 'Sites e landing pages'}
        meta={`${ctx.sites.length} site(s) ativo(s)`}
      />

      <div className="pagina">
        {busca.arquivado && (
          <p role="status" style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--ok-tx)' }}>
            Site arquivado. O histórico foi preservado, e a coleta dele parou.
          </p>
        )}

        {filtrado && (
          <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
            Filtrando por <strong>{filtrado.name}</strong>. <Link href="/sites">Ver todos os sites</Link>
          </p>
        )}

        <Painel
          titulo="Sites cadastrados"
          subtitulo="Cada site pertence a um cliente e recebe um identificador público próprio"
          acoes={
            <FormularioSite
              // A chave força a remontagem ao trocar o alvo da edição: sem ela o
              // componente cliente sobrevive à navegação e mantém o estado antigo.
              key={emEdicao?.id ?? 'novo'}
              clientes={ctx.clientes.map((c) => ({ id: c.id, name: c.name }))}
              emEdicao={
                emEdicao
                  ? {
                      id: emEdicao.id,
                      name: emEdicao.name,
                      domain: emEdicao.domain,
                      timezone: emEdicao.timezone,
                      clientId: emEdicao.clientId,
                    }
                  : undefined
              }
            />
          }
        >
          {ctx.sites.length === 0 ? (
            <p style={{ fontSize: 'var(--tipo-corpo)', color: 'var(--tx2)' }}>
              {ctx.clientes.length === 0
                ? 'Cadastre um cliente primeiro, em Clientes.'
                : 'Nenhum site cadastrado para este filtro.'}
            </p>
          ) : (
            <div className="grade-sites">
              {ctx.sites.map((site) => (
                <CartaoSite key={site.id} site={site} resumo={resumos.get(site.id)} />
              ))}
            </div>
          )}
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 14, lineHeight: 1.6 }}>
            A cor da faixa é o estado da <strong>configuração</strong>: cinza não iniciada, âmbar com recurso
            escolhido esperando verificação, vermelho com erro registrado, verde tudo verificado. A etiqueta do
            rodapé é outra coisa — o <strong>rastreamento</strong>, derivado dos eventos recebidos. Cadastrar o
            domínio e gerar o identificador não instala nada.
          </p>
        </Painel>
      </div>
    </>
  );
}
