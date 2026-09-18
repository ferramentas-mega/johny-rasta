import Link from 'next/link';
import { withAccount } from '@/server/db';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel } from '@/components/Cartoes';
import { CartaoSite } from '@/components/CartaoSite';
import { Avatar } from '@/components/Avatar';
import { Etiqueta } from '@/components/Tabela';
import { EstadoVazio } from '@/components/EstadoVazio';
import { FiltroSaude, Busca } from '@/components/filtros';
import { resumoDeConfiguracao } from '@/server/services/onboarding';
import { listarOtimizacoes } from '@/server/qualidade/otimizacoes';
import { agruparSitesPorCliente } from '@/lib/clientes';
import { estadoDaConfiguracao } from '@/lib/recursos';
import {
  saudeDoSite,
  agregarSaude,
  contarSaude,
  casaBusca,
  ehFiltroSaude,
  SAUDE_LABEL,
  SAUDE_TOM,
  type FiltroSaude as Filtro,
} from '@/lib/saude';
import { FormularioSite } from './FormularioSite';

export const dynamic = 'force-dynamic';

export default async function PaginaSites({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const busca = await searchParams;
  const ctx = await contextoPainel(busca);
  const filtrado = ctx.clientes.find((c) => c.id === ctx.clienteId);
  const termo = typeof busca.q === 'string' ? busca.q : '';
  const filtro: Filtro = ehFiltroSaude(typeof busca.saude === 'string' ? busca.saude : null)
    ? (busca.saude as Filtro)
    : 'todos';

  // A edição vive na URL, como os demais filtros: recarregar mantém o formulário
  // aberto no site certo, e o link é compartilhável.
  const editandoId = typeof busca.editar === 'string' ? busca.editar : null;
  const emEdicao = ctx.sites.find((s) => s.id === editandoId);

  // Uma consulta para todos os sites da tela, não uma por linha.
  const resumos = await resumoDeConfiguracao(
    ctx.usuario.accountId,
    ctx.sites.map((s) => s.id),
  );
  // Os sinais da conta, uma vez; a saúde de cada site sai daqui em memória.
  const sinais = await withAccount(ctx.usuario.accountId, (db) => listarOtimizacoes(db));

  const saudes = new Map(
    ctx.sites.map((s) => [
      s.id,
      saudeDoSite({
        totalEventos: s.totalEventos,
        estado: s.estado,
        resumo: resumos.get(s.id),
        sinais: sinais.filter((o) => o.siteId === s.id),
      }),
    ]),
  );

  // A unidade de trabalho é o CLIENTE. Cada grupo diz a saúde agregada (a
  // pior página manda) e quantos sites pedem ação — tudo derivado, nada gravado.
  const todosOsGrupos = agruparSitesPorCliente(ctx.sites).map((g) => ({
    ...g,
    saude: agregarSaude(g.sites.map((s) => saudes.get(s.id)!.saude)),
    contagem: contarSaude(g.sites.map((s) => saudes.get(s.id)!.saude)),
    pendentes: g.sites.filter((s) => estadoDaConfiguracao(resumos.get(s.id)) !== 'completa').length,
  }));
  const contagemClientes = contarSaude(todosOsGrupos.map((g) => g.saude));

  /**
   * Busca e filtro RESPEITAM o agrupamento.
   *
   * Buscar "/contato" devolve a página DENTRO do cliente dela — nunca solta.
   * Buscar o nome do cliente devolve o cliente com todas as páginas. O filtro
   * de saúde mantém o cliente cuja pior página casa, e dentro dele mostra só
   * as páginas que casam: é a página responsável pelo estado que interessa.
   */
  const grupos = todosOsGrupos
    .map((g) => {
      const casaCliente = casaBusca(termo, g.clienteNome);
      const sites = g.sites.filter((s) => {
        const casaTexto = casaCliente || casaBusca(termo, s.name, s.domain);
        const casaSaude = filtro === 'todos' || saudes.get(s.id)!.saude === filtro;
        return casaTexto && casaSaude;
      });
      return { ...g, sites };
    })
    .filter((g) => g.sites.length > 0);

  const filtrando = termo !== '' || filtro !== 'todos';

  return (
    <>
      <Cabecalho
        kicker="SITES"
        titulo={filtrado ? `Sites de ${filtrado.name}` : 'Sites e landing pages'}
        meta={`${todosOsGrupos.length} cliente(s) · ${ctx.sites.length} site(s) ativo(s) · ${contagemClientes.critico} crítico(s), ${contagemClientes.atencao} em atenção`}
        filtros={<Busca valor={termo} rotulo="Buscar cliente ou página" placeholder="Cliente, site ou domínio…" />}
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
          subtitulo="Agrupados por cliente; a saúde do cliente é a da pior página dele"
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
          {ctx.sites.length > 0 && (
            <div style={{ marginBottom: 'var(--esp-5)' }}>
              <FiltroSaude atual={filtro} contagens={contarSaude([...saudes.values()].map((d) => d.saude))} />
            </div>
          )}

          {ctx.sites.length === 0 ? (
            <EstadoVazio
              icone="globo"
              titulo={ctx.clientes.length === 0 ? 'Cadastre um cliente primeiro' : 'Nenhum site cadastrado'}
              explicacao={
                ctx.clientes.length === 0
                  ? 'Todo site pertence a um cliente. Sem cliente, não há a quem atribuir a medição.'
                  : 'Cadastre o primeiro site pelo botão acima; ele já abre o assistente de configuração.'
              }
              acao={ctx.clientes.length === 0 ? { rotulo: 'Cadastrar cliente', href: '/clientes' } : undefined}
            />
          ) : grupos.length === 0 ? (
            <EstadoVazio
              icone="globo"
              titulo="Nenhum site casa com a busca ou o filtro"
              explicacao={filtrando ? 'A busca procura no nome do cliente, no nome do site e no domínio. O filtro de saúde é derivado dos sinais e do rastreamento.' : undefined}
              acao={filtrando ? { rotulo: 'Limpar filtros', href: '/sites' } : undefined}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--esp-7)' }}>
              {grupos.map((g) => (
                <section key={g.clienteId} aria-labelledby={`cliente-${g.clienteId}`} data-saude={g.saude}>
                  <header className="grupo-cliente-topo">
                    <Avatar nome={g.clienteNome} tamanho={28} />
                    <h3 id={`cliente-${g.clienteId}`} className="grupo-cliente-nome">
                      {/* O nome leva ao PAINEL do cliente, não ao filtro desta
                          tela: quem clica no cliente quer o cliente inteiro. */}
                      <Link href={`/clientes/${g.clienteId}`}>{g.clienteNome}</Link>
                    </h3>
                    <Etiqueta texto={SAUDE_LABEL[g.saude]} tom={SAUDE_TOM[g.saude]} />
                    <span className="mono grupo-cliente-meta">
                      {g.sites.length === g.contagem.critico + g.contagem.atencao + g.contagem.saudavel + g.contagem.sem_medicao
                        ? `${g.sites.length} site(s)`
                        : `${g.sites.length} de ${g.contagem.critico + g.contagem.atencao + g.contagem.saudavel + g.contagem.sem_medicao} site(s)`}
                      {g.contagem.critico > 0 && <span style={{ color: 'var(--neg-tx)' }}> · {g.contagem.critico} crítico(s)</span>}
                      {g.contagem.atencao > 0 && <span style={{ color: 'var(--warn-tx)' }}> · {g.contagem.atencao} em atenção</span>}
                      {g.pendentes > 0 && <span> · {g.pendentes} pede(m) ação</span>}
                    </span>
                  </header>
                  <div className="grade-sites">
                    {g.sites.map((site) => (
                      <CartaoSite key={site.id} site={site} resumo={resumos.get(site.id)} saude={saudes.get(site.id)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 14, lineHeight: 1.6 }}>
            <strong>Saúde</strong> é derivada na hora: crítico com nota técnica ruim ou erro de configuração;
            atenção com análise vencida, coleta interrompida ou recurso sem verificação; sem medição quando
            nada chegou nem foi analisado — não é saudável, é desconhecido. A cor da faixa é o estado da{' '}
            <strong>configuração</strong>; a etiqueta do rodapé é o <strong>rastreamento</strong>, derivado dos
            eventos recebidos. Cadastrar o domínio e gerar o identificador não instala nada.
          </p>
        </Painel>
      </div>
    </>
  );
}
