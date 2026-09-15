import Link from 'next/link';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { ESTADO_LABEL, ESTADO_TOM, type Site } from '@/server/services/sites';
import { dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
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

  const colunas: Coluna<Site>[] = [
    { chave: 'nome', titulo: 'Site',
      render: (s) => <Link href={`/sites/${s.id}/desempenho`}>{s.name}</Link> },
    { chave: 'dominio', titulo: 'Domínio', mono: true, render: (s) => s.domain },
    { chave: 'cliente', titulo: 'Cliente',
      render: (s) => <Link href={`/sites?cliente=${s.clientId}`}>{s.clienteNome}</Link> },
    { chave: 'publicId', titulo: 'Identificador público', mono: true,
      ajuda: 'Endereça o site no coletor. Aparece no HTML de quem instalar, então não funciona como credencial.',
      render: (s) => s.publicId },
    { chave: 'estado', titulo: 'Rastreamento',
      ajuda: 'Derivado dos eventos realmente recebidos, nunca do cadastro.',
      render: (s) => (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 3 }}>
          <Etiqueta
            texto={ESTADO_LABEL[s.estado]}
            tom={ESTADO_TOM[s.estado] === 'ok' ? 'ok' : ESTADO_TOM[s.estado] === 'aguardando' ? 'warn' : 'soft'}
          />
          {s.ultimoEvento && (
            <span style={{ fontSize: 10.5, color: 'var(--tx3)' }}>último: {dataHora(s.ultimoEvento)}</span>
          )}
        </span>
      ) },
    { chave: 'configuracao', titulo: 'Configuração',
      ajuda: 'Recursos escolhidos e verificados. "Não iniciada" significa que ninguém escolheu o que este site deve medir.',
      render: (s) => {
        const r = resumos.get(s.id);
        if (!r || r.naoIniciado) return <Etiqueta texto="Não iniciada" tom="soft" />;
        if (r.pendentes > 0) {
          return <Etiqueta texto={`${r.pendentes} pendência(s)`} tom="warn" />;
        }
        return <Etiqueta texto={`${r.verificados} verificado(s)`} tom="ok" />;
      } },
    { chave: 'acoes', titulo: '', alinhamento: 'direita',
      render: (s) => {
        const r = resumos.get(s.id);
        const falta = !r || r.naoIniciado || r.pendentes > 0;
        return (
          <span style={{ display: 'inline-flex', gap: 12, whiteSpace: 'nowrap' }}>
            <Link href={`/sites?editar=${s.id}`}>Editar</Link>
            {/* Ação clara e única por linha: enquanto houver pendência, o
                caminho é continuar a configuração. Sem ela, é o painel. */}
            <Link href={`/sites/${s.id}/configurar`}>
              {falta ? 'Continuar configuração →' : 'Configuração'}
            </Link>
          </span>
        );
      } },
  ];

  return (
    <>
      <Cabecalho
        kicker="SITES"
        titulo={filtrado ? `Sites de ${filtrado.name}` : 'Sites e landing pages'}
        meta={`${ctx.sites.length} site(s) ativo(s)`}
      />

      <div className="pagina">
        {filtrado && (
          <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
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
          <Tabela
            colunas={colunas}
            linhas={ctx.sites}
            vazio={ctx.clientes.length === 0
              ? 'Cadastre um cliente primeiro, em Clientes.'
              : 'Nenhum site cadastrado para este filtro.'}
          />
          <p style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 10 }}>
            Cadastrar o domínio e gerar o identificador não instala o rastreamento. O estado só muda quando um
            evento real chega ao servidor.
          </p>
        </Painel>
      </div>
    </>
  );
}
