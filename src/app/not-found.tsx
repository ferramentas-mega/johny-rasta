import Link from 'next/link';
import { TelaDeErro } from '@/components/TelaDeErro';
import { estiloAcao } from '@/components/estilosDeErro';

/**
 * 404.
 *
 * Antes disto existir, um endereço errado caía na página padrão do Next —
 * branca, em inglês, sem nenhuma relação com o painel. Ela também é o destino
 * do `notFound()` chamado de propósito: é o que responde quando alguém tenta
 * abrir, pela URL, um site ou cliente **de outra conta**. Nesse caso o 404 é a
 * resposta certa e deliberada: dizer "403 — existe, mas não é seu" confirmaria
 * a existência do registro para quem não deveria saber.
 *
 * Por isso o texto não promete que a página "foi movida" nem sugere procurar em
 * outro lugar: às vezes ela existe e simplesmente não é de quem está olhando.
 */
export default function NaoEncontrado() {
  return (
    <TelaDeErro
      codigo="404"
      titulo="Esta tela não existe aqui"
      descricao={
        <>
          O endereço não corresponde a nenhuma tela do painel — ou aponta para um registro que não
          pertence à sua conta. Confira o link e tente de novo pelo menu.
        </>
      }
      acoes={
        <>
          <Link href="/visao-geral" style={estiloAcao(true)}>
            Ir para a visão geral
          </Link>
          <Link href="/sites" style={estiloAcao(false)}>
            Ver os sites
          </Link>
        </>
      }
    />
  );
}
