'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Marca } from '@/components/Marca';
import { Icone, type IconeNome } from '@/components/icones';
import { TextoMatrix } from '@/components/TextoMatrix';

/**
 * Menu lateral.
 *
 * O item ativo é derivado do pathname real. No protótipo o destaque vinha de um
 * estado próprio, que podia discordar da tela mostrada — era exatamente o
 * defeito em que "Leads" aparecia selecionado enquanto o conteúdo era
 * Desempenho. Aqui isso não tem como acontecer: existe uma fonte só.
 */

type ItemMenu = { href: string; label: string; icone: IconeNome; prefixos?: string[] };

const ITENS: ItemMenu[] = [
  { href: '/visao-geral', label: 'Visão geral', icone: 'grafico' },
  { href: '/clientes', label: 'Clientes', icone: 'clientes' },
  { href: '/sites', label: 'Sites', icone: 'globo', prefixos: ['/sites'] },
  { href: '/leads', label: 'Leads', icone: 'caixa' },
  { href: '/otimizacoes', label: 'Otimizações', icone: 'ajustes' },
  { href: '/configuracoes', label: 'Configurações', icone: 'ajustes' },
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

  const iniciais = usuarioNome
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  return (
    // Layout em CSS, não inline: no celular a barra lateral vira uma faixa
    // horizontal no topo, e isso é uma media query — que estilo inline não tem.
    <aside className="lateral">
      <div className="lateral-marca">
        <Marca />
      </div>

      <nav aria-label="Seções do painel" className="lateral-nav">
        {ITENS.map((item) => {
          const on = ativo(item);
          const contagem =
            item.href === '/clientes' ? contagens.clientes
            : item.href === '/sites' ? contagens.sites
            : item.href === '/leads' ? contagens.leads
            : null;

          return (
            <Link
              key={item.href}
              href={`${item.href}${busca}`}
              aria-current={on ? 'page' : undefined}
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
              <TextoMatrix texto={item.label} disparo={disparos[item.href] ?? 0} />
              {contagem !== null && (
                <span
                  className="mono"
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10.5,
                    letterSpacing: '.04em',
                    color: on ? 'var(--gold)' : 'var(--tx3)',
                  }}
                >
                  {contagem}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="lateral-rodape">
        <span
          className="mono"
          aria-hidden="true"
          style={{
            flex: 'none',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--elev)',
            border: '1px solid var(--bd)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: 'var(--gold)',
          }}
        >
          {iniciais || '·'}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{contaNome}</div>
          <form action="/api/sair" method="post">
            <button
              type="submit"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 11.5,
                color: 'var(--gold-tx)',
              }}
            >
              Sair
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
