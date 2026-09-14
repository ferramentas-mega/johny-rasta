import Link from 'next/link';
import { contextoPainel, type ParametrosBusca } from '@/server/contexto';
import { ESTADO_LABEL, ESTADO_TOM, type Site } from '@/server/services/sites';
import { dataHora } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel } from '@/components/Cartoes';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';
import { FormularioSite } from './FormularioSite';

export const dynamic = 'force-dynamic';

export default async function PaginaSites({ searchParams }: { searchParams: Promise<ParametrosBusca> }) {
  const ctx = await contextoPainel(await searchParams);
  const filtrado = ctx.clientes.find((c) => c.id === ctx.clienteId);

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
    { chave: 'acoes', titulo: '', alinhamento: 'direita',
      render: (s) => <Link href={`/sites/${s.id}/rastreamento`}>Instalação →</Link> },
  ];

  return (
    <>
      <Cabecalho
        kicker="SITES"
        titulo={filtrado ? `Sites de ${filtrado.name}` : 'Sites e landing pages'}
        meta={`${ctx.sites.length} site(s) ativo(s)`}
      />

      <div className="pagina" style={{ padding: '22px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {filtrado && (
          <p style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
            Filtrando por <strong>{filtrado.name}</strong>. <Link href="/sites">Ver todos os sites</Link>
          </p>
        )}

        <Painel
          titulo="Sites cadastrados"
          subtitulo="Cada site pertence a um cliente e recebe um identificador público próprio"
          acoes={<FormularioSite clientes={ctx.clientes.map((c) => ({ id: c.id, name: c.name }))} />}
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
