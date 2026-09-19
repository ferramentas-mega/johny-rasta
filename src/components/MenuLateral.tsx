'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marca } from '@/components/Marca';
import { Icone, type IconeNome } from '@/components/icones';
import { TextoMatrix } from '@/components/TextoMatrix';
import { BotaoRecolher } from '@/components/BotaoRecolher';
import { Avatar } from '@/components/Avatar';
import { MenuInferior } from '@/components/MenuInferior';
import { ControlesAparencia } from '@/components/ControlesAparencia';

/**
 * Menu lateral.
 *
 * O item ativo é derivado do pathname real. No protótipo o destaque vinha de um
 * estado próprio, que podia discordar da tela mostrada — era exatamente o
 * defeito em que "Leads" aparecia selecionado enquanto o conteúdo era
 * Desempenho. Aqui isso não tem como acontecer: existe uma fonte só.
 */

type ItemMenu = {
  href: string;
  label: string;
  /** Rótulo curto da barra de rodapé do celular. Veja `MenuInferior`. */
  curto?: string;
  icone: IconeNome;
  prefixos?: string[];
};

const ITENS: ItemMenu[] = [
  { href: '/visao-geral', label: 'Visão geral', curto: 'Geral', icone: 'grafico' },
  { href: '/clientes', label: 'Clientes', icone: 'clientes' },
  { href: '/sites', label: 'Sites', icone: 'globo', prefixos: ['/sites'] },
  { href: '/leads', label: 'Leads', icone: 'caixa' },
  /**
   * Otimizações usa `tendencia`, e não `ajustes`.
   *
   * Os dois destinos vinham com a MESMA engrenagem. Na barra lateral o rótulo
   * salva a leitura; na barra do celular o ícone é a pista principal, e dois
   * ícones idênticos lado a lado transformam a escolha em tentativa e erro.
   *
   * A seta ascendente também diz melhor o que a tela é: onde atuar para
   * melhorar resultado, não um painel de preferências.
   */
  { href: '/otimizacoes', label: 'Otimizações', curto: 'Otimizar', icone: 'tendencia' },
  { href: '/configuracoes', label: 'Configurações', curto: 'Ajustes', icone: 'ajustes' },
];

export function MenuLateral({
  contagens,
  contaNome,
  usuarioNome,
  busca,
}: {
  contagens: { clientes: number; sites: number; leads: number };
  contaNome: string;
  usuarioNome: string;
  /** Filtros correntes, repassados para que trocar de seção não perca o contexto. */
  busca: string;
}) {
  const pathname = usePathname();

  const ativo = (item: ItemMenu) =>
    pathname === item.href || (item.prefixos ?? []).some((p) => pathname.startsWith(`${p}/`));

  /**
   * Um contador por item. Incrementar dispara a decodificação daquele rótulo —
   * e só dele. Um estado booleano global faria os seis animarem juntos.
   */
  const [disparos, setDisparos] = useState<Record<string, number>>({});
  const decodificar = (href: string) =>
    setDisparos((d) => ({ ...d, [href]: (d[href] ?? 0) + 1 }));

  /**
   * O item que acabou de virar o ativo decodifica sozinho, uma vez. É a
   * confirmação visual da navegação que o usuário acabou de fazer — e por isso
   * anima um item, não os seis.
   */
  const itemAtivo = ITENS.find((i) => ativo(i))?.href;
  useEffect(() => {
    if (itemAtivo) decodificar(itemAtivo);
    // Depende só de qual item está ativo: repetir a animação a cada repintura
    // transformaria o menu num letreiro.
  }, [itemAtivo]);

  const contagemDe = (href: string) =>
    href === '/clientes' ? contagens.clientes
    : href === '/sites' ? contagens.sites
    : href === '/leads' ? contagens.leads
    : null;

  return (
    <>
    {/* Layout em CSS, não inline: no celular a barra lateral vira uma faixa
        horizontal no topo, e isso é uma media query — que estilo inline não tem. */}
    <aside className="lateral">
      <div className="lateral-marca">
        <Marca />
        <BotaoRecolher />
      </div>

      <nav aria-label="Seções do painel" className="lateral-nav">
        {ITENS.map((item) => {
          const on = ativo(item);
          const contagem = contagemDe(item.href);

          return (
            <Link
              key={item.href}
              href={`${item.href}${busca}`}
              aria-current={on ? 'page' : undefined}
              // Alimenta a dica (`::after`) quando a barra está recolhida. O
              // rótulo continua no DOM e no nome acessível; o que some é a
              // pintura dele.
              data-rotulo={item.label}
              // O visual (incluindo o realce ao passar o mouse) vive em
              // `.item-menu`, no CSS: `:hover` não existe em estilo inline, e
              // era por isso que os itens não reagiam ao ponteiro.
              className="item-menu"
              // Ponteiro e teclado disparam igual: quem navega sem mouse vê o
              // mesmo efeito, em vez de um enfeite reservado a quem tem mouse.
              onMouseEnter={() => decodificar(item.href)}
              onFocus={() => decodificar(item.href)}
            >
              <Icone nome={item.icone} />
              <span className="rotulo-menu">
                <TextoMatrix texto={item.label} disparo={disparos[item.href] ?? 0} />
              </span>
              {contagem !== null && (
                <span
                  className="mono contagem-menu"
                  style={{
                    marginLeft: 'auto',
                    fontSize: 'var(--tipo-micro)',
                    letterSpacing: 'var(--trilha-media)',
                    color: on ? 'var(--gold-tx)' : 'var(--tx3)',
                  }}
                >
                  {contagem}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Tema e efeitos vivem no rodapé do menu (desktop). No celular o menu
          não existe, e eles continuam no cabeçalho — `.controles-cabecalho`. */}
      <div className="controles-lateral">
        <ControlesAparencia />
      </div>

      <div className="lateral-rodape">
        {/* Iniciais do USUÁRIO, ao lado do nome da CONTA. São duas informações
            diferentes: o texto diz em que conta você está, o avatar diz quem
            você é — e trocar por iniciais da conta repetiria o texto e perderia
            a única pista de identidade que este rodapé tem. */}
        <Avatar nome={usuarioNome} tamanho={30} />
        <div style={{ minWidth: 0 }}>
          {/* Só o NOME some quando a barra recolhe. O "Sair" continua, porque
              esconder a saída da conta atrás de outra tela é o tipo de coisa
              que ninguém percebe até precisar. */}
          <div
            className="lateral-rodape-texto"
            style={{ fontSize: 'var(--tipo-apoio)', fontWeight: 500, whiteSpace: 'nowrap' }}
          >
            {contaNome}
          </div>
          <form action="/api/sair" method="post">
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 'var(--tipo-legenda)',
                color: 'var(--gold-tx)',
              }}
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </aside>

    {/* No celular a navegação vai para o rodapé, ao alcance do polegar. O CSS
        decide qual das duas aparece — as duas nunca estão visíveis juntas. */}
    <MenuInferior
      itens={ITENS.map((i) => ({ ...i, contagem: contagemDe(i.href) }))}
      busca={busca}
    />
    </>
  );
}
