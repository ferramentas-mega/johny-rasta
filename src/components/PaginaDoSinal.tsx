import { DISPOSITIVO_LABEL, type Dispositivo } from '@/lib/otimizacoes';

/**
 * A página de um sinal, com o dispositivo à vista.
 *
 * A nota técnica pertence a uma URL E a um dispositivo: sem o dispositivo,
 * duas linhas da mesma página pareceriam a mesma pendência repetida. Vivia
 * dentro da tela de Otimizações; virou componente quando o painel do cliente
 * passou a mostrar os mesmos sinais — duas cópias divergiriam na primeira
 * correção feita só numa.
 */
export function PaginaDoSinal({ url, dispositivo }: { url: string; dispositivo: Dispositivo | null }) {
  return (
    <>
      <span className="mono" style={{ fontSize: 'var(--tipo-legenda)' }}>
        {url.replace(/^https?:\/\/[^/]+/, '') || '/'}
      </span>
      {dispositivo && (
        <span style={{ display: 'block', fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>
          no {DISPOSITIVO_LABEL[dispositivo]}
        </span>
      )}
    </>
  );
}

/** Sinal sem página: vale para o site inteiro (o de coleta, por exemplo). */
export function SiteInteiro() {
  return <span style={{ color: 'var(--tx3)', fontSize: 'var(--tipo-legenda)' }}>site inteiro</span>;
}
