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

    case 'vite_spa':
      return {
        onde: 'No index.html da raiz do projeto, dentro do <head>.',
        passos: [
          'Abra o index.html que o Vite usa como entrada (fica na raiz, ao lado do vite.config).',
          'Cole o código antes de </head>. Numa SPA há UM documento só, então isto cobre todas as rotas.',
          'Não importe o script dentro de um componente: ele carregaria de novo a cada montagem e o coletor desistiria da segunda cópia — mas a primeira montagem já teria contado.',
        ],
        publicar: 'Rode o build e publique a pasta gerada. Confira o HTML servido em produção: o index.html do build precisa trazer a tag.',
        observacao:
          'A navegação por rotas (React Router, Vue Router) não recarrega a página. O coletor já trata isso: observa pushState, replaceState e o botão voltar, e conta uma visualização por rota.',
      };

    case 'gtm':
      return {
        onde: 'No Google Tag Manager, como uma tag "HTML personalizado", disparada em todas as páginas.',
        passos: [
          'No contêiner do site, crie uma tag do tipo HTML personalizado e cole o código inteiro nela.',
          'Acionador: "All Pages" (visualização de página). Não use um acionador de clique — o coletor mede os cliques sozinho.',
          'Se o contêiner usa o modo de consentimento, associe a tag à categoria de análise para que ela só dispare com consentimento.',
          'Publique o contêiner. Uma tag salva e não publicada não existe para o visitante.',
        ],
        publicar: 'Publique a versão do contêiner e confira no modo de visualização do GTM que a tag disparou na página inicial.',
        observacao:
          'Se o GTM já está no site, este caminho não mexe no código do site — o que é a vantagem. O risco é o inverso: instalar aqui E no tema é instalar duas vezes. Confira o inventário de tags depois.',
      };

    case 'construtor':
      return {
        onde: 'No campo de "código personalizado no <head>" do construtor, aplicado ao site inteiro.',
        passos: [
          'Wix: Configurações › Código personalizado › Adicionar código, em "Head", para "Todas as páginas".',
          'Webflow: Site settings › Custom code › Head code. Framer: Site settings › General › Custom code › Start of <head>.',
          'Squarespace: Settings › Advanced › Code injection › Header. Em outros construtores, procure por "head", "código" ou "scripts".',
        ],
        publicar: 'Publique o site pelo construtor. Alterar o campo sem publicar deixa o visitante com a versão anterior.',
        observacao:
          'Alguns planos gratuitos de construtor não permitem código no head. Nesse caso o caminho é o Google Tag Manager, se o construtor o aceitar — ou o plano que libera o campo.',
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
