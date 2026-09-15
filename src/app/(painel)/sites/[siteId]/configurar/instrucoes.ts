import type { Plataforma } from '@/lib/recursos';

/**
 * Instruções de instalação, por plataforma.
 *
 * Mostrar as cinco versões para todo mundo é o que fazia a tela de rastreamento
 * antiga virar um paredão de código antes de qualquer explicação. Aqui a
 * plataforma escolhida na etapa 1 decide o que aparece.
 *
 * Duas coisas valem para todas as plataformas e estão escritas em cada uma, em
 * vez de numa nota de rodapé que ninguém lê:
 *
 *  - **Instalação global.** Colar só numa página mede só aquela página, e o
 *    relatório fica parecendo que o site inteiro tem uma página só.
 *  - **Uma vez só.** O coletor se protege de instalação dupla (o segundo
 *    carregamento desiste), mas duas tags é sinal de que alguém instalou em dois
 *    lugares — e um deles vai ser esquecido na próxima manutenção.
 */

export type Instrucao = {
  onde: string;
  passos: string[];
  publicar: string;
  observacao?: string;
};

export function instrucaoDaPlataforma(plataforma: Plataforma): Instrucao {
  switch (plataforma) {
    case 'wordpress':
      return {
        onde: 'No tema, dentro do <head> — ou por um plugin de inserção de código.',
        passos: [
          'Abra Aparência › Editor de temas, ou instale um plugin do tipo "inserir cabeçalho e rodapé".',
          'Cole o código na área de CABEÇALHO do site inteiro, não de uma página específica.',
          'Se o tema for próprio, o lugar é o header.php, antes de </head>.',
        ],
        publicar: 'Salve e limpe o cache do site e do plugin de cache, se houver. Cache antigo serve HTML sem o script.',
        observacao:
          'Editar o header.php de um tema que recebe atualização faz a alteração ser perdida na próxima versão. Um tema filho ou um plugin de inserção de código resolvem isso.',
      };

    case 'react_next':
      return {
        onde: 'No layout raiz, para valer em todas as rotas.',
        passos: [
          'No App Router, coloque a tag no app/layout.tsx. No Pages Router, em pages/_document.tsx.',
          'Em Next.js, prefira <Script src="…" strategy="afterInteractive" /> em vez de <script> puro.',
          'Não coloque numa página só: o layout é o que garante cobertura em todas as rotas.',
        ],
        publicar: 'Faça o deploy e confirme que o script aparece no HTML servido em produção, não apenas no ambiente local.',
        observacao:
          'Navegação entre rotas não recarrega a página. O coletor já cobre isso: ele observa pushState, replaceState e o botão voltar, e conta uma visualização por rota — sem duplicar quando só o hash muda.',
      };

    case 'html':
    case 'desconhecida':
    default:
      return {
        onde: 'Antes de fechar o </head>, em todas as páginas.',
        passos: [
          'Abra o HTML de cada página, ou o arquivo de cabeçalho compartilhado, se existir.',
          'Cole o código imediatamente antes de </head>.',
          'Repita em todas as páginas que não usem esse cabeçalho compartilhado — página sem o script não é medida.',
        ],
        publicar: 'Envie os arquivos para o servidor e abra o site numa aba anônima para ver o HTML já publicado.',
        observacao:
          'Se você não sabe qual é a plataforma, esta instrução funciona em qualquer uma: é HTML puro. Volte à etapa 1 e ajuste depois, se descobrir.',
      };
  }
}
