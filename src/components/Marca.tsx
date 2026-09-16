/**
 * Marca do painel.
 *
 * O glifo `>_` é o que existe hoje: nenhum arquivo de logo foi fornecido.
 * Está isolado aqui de propósito — trocar por uma imagem é mexer só neste
 * componente, sem tocar no layout do menu.
 */
export function Marca({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--raio-m)',
        border: '1px solid var(--bd)',
        padding: compacto ? '12px 8px' : '14px 14px',
        background: 'var(--brand-bg)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        className="mono"
        aria-hidden="true"
        style={{
          flex: 'none',
          width: 28,
          height: 28,
          border: '1px solid var(--gold)',
          borderRadius: 'var(--raio-p)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 'var(--tipo-corpo)',
          color: 'var(--gold-tx)',
          textShadow: 'var(--glow)',
        }}
      >
        &gt;_
      </span>
      {!compacto && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--tipo-secao)', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            Painel de Sites
          </div>
          <div style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)' }}>Análise de desempenho</div>
        </div>
      )}
    </div>
  );
}
