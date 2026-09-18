import Link from 'next/link';
import { exigirSessao } from '@/server/contexto';
import { listarAvisos, contarPorGravidade, GRAVIDADE_LABEL, type Aviso } from '@/server/services/avisos';
import { dataHora, num } from '@/lib/formato';
import { Cabecalho } from '@/components/Cabecalho';
import { Painel, CartaoNumero } from '@/components/Cartoes';
import { EstadoVazio } from '@/components/EstadoVazio';
import { Tabela, Etiqueta, type Coluna } from '@/components/Tabela';

export const dynamic = 'force-dynamic';

const TOM: Record<Aviso['gravidade'], 'neg' | 'warn' | 'soft'> = { alta: 'neg', media: 'warn', baixa: 'soft' };

const ORIGEM_LABEL: Record<Aviso['origem'], string> = {
  sinal: 'Sinal de otimização',
  instalacao: 'Instalação',
  configuracao: 'Configuração',
};

/**
 * Central de avisos.
 *
 * Cada linha é um fato derivado do banco — nada aqui foi "enviado" por
 * ninguém, e nada precisa ser "marcado como lido": quando o fato muda, o aviso
 * some sozinho. É por isso que não há botão de dispensar. Dispensar um aviso
 * que continua verdadeiro seria esconder o problema de quem vier depois.
 */
export default async function PaginaAvisos() {
  const usuario = await exigirSessao();
  const avisos = await listarAvisos(usuario.accountId);
  const porGravidade = contarPorGravidade(avisos);

  const colunas: Coluna<Aviso>[] = [
    {
      chave: 'gravidade', titulo: 'Gravidade',
      render: (a) => <Etiqueta texto={GRAVIDADE_LABEL[a.gravidade]} tom={TOM[a.gravidade]} />,
    },
    {
      chave: 'onde', titulo: 'Cliente e site',
      render: (a) => (
        <>
          <Link href={a.href}>{a.site}</Link>
          <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{a.cliente}</span>
        </>
      ),
    },
    {
      chave: 'aviso', titulo: 'Aviso', quebraLinha: true,
      render: (a) => (
        <>
          <span>{a.titulo}</span>
          <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)', lineHeight: 1.5 }}>{a.detalhe}</span>
        </>
      ),
    },
    {
      chave: 'origem', titulo: 'Origem',
      render: (a) => <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{ORIGEM_LABEL[a.origem]}</span>,
    },
    {
      chave: 'desde', titulo: 'Desde',
      render: (a) => (
        <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
          {a.desde ? dataHora(a.desde) : '—'}
        </span>
      ),
    },
    {
      chave: 'acao', titulo: '',
      render: (a) => <Link href={a.href} style={{ fontSize: 'var(--tipo-apoio)', whiteSpace: 'nowrap' }}>Resolver →</Link>,
    },
  ];

  return (
    <>
      <Cabecalho
        kicker="AVISOS"
        titulo="Central de avisos"
        meta={`${num(avisos.length)} aviso(s) pedem ação`}
      />

      <div className="pagina">
        <div className="grade-cartoes">
          <CartaoNumero
            rotulo="Gravidade alta"
            valor={num(porGravidade.alta)}
            nota="nota técnica ruim, erro de configuração"
            tom={porGravidade.alta > 0 ? 'atencao' : 'neutro'}
          />
          <CartaoNumero rotulo="Gravidade média" valor={num(porGravidade.media)} nota="análise vencida, coleta interrompida" />
          <CartaoNumero rotulo="Gravidade baixa" valor={num(porGravidade.baixa)} nota="instalação e verificação pendentes" />
        </div>

        <Painel titulo="O que pede ação" subtitulo="Derivado do banco a cada abertura; some sozinho quando o fato muda">
          <Tabela
            colunas={colunas}
            linhas={avisos}
            vazio={
              <EstadoVazio
                icone="sino"
                titulo="Nenhum aviso pendente"
                explicacao="Todo site com recurso escolhido está verificado, nenhum sinal de otimização está aberto e todo site já recebeu evento. Isso é medido, não declarado."
              />
            }
          />
          <p style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)', marginTop: 10, lineHeight: 1.6 }}>
            Não há &quot;marcar como lido&quot;: um aviso só sai daqui quando o fato que o sustenta deixa de
            existir — o evento chega, a análise sobe a nota, a verificação passa. Os sinais de otimização
            continuam acompanháveis em <Link href="/otimizacoes">Otimizações</Link>.
          </p>
        </Painel>
      </div>
    </>
  );
}
