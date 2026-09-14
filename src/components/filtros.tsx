'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTransition } from 'react';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/periodo';

/**
 * Filtros de site e período.
 *
 * Tudo vive na URL (`?site=&periodo=&de=&ate=`). Isso é o que faz recarregar,
 * abrir link direto e voltar/avançar no navegador funcionarem: o servidor lê os
 * mesmos parâmetros e devolve o mesmo resultado. Trocar o período de fato
 * refaz as consultas — não muda apenas a aparência do botão.
 */

function useAtualizarBusca() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, startTransition] = useTransition();

  const atualizar = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(patch)) {
      if (valor === null) params.delete(chave);
      else params.set(chave, valor);
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  return { atualizar, pendente };
}

const ROTULOS: Record<PeriodKey, string> = {
  hoje: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  personalizado: 'Personalizado',
};

export function SeletorPeriodo({ atual }: { atual: PeriodKey }) {
  const { atualizar, pendente } = useAtualizarBusca();

  return (
    <div role="group" aria-label="Período" style={{ display: 'flex', gap: 6, opacity: pendente ? 0.6 : 1 }}>
      {PERIOD_KEYS.map((chave) => {
        const on = chave === atual;
        return (
          <button
            key={chave}
            type="button"
            aria-pressed={on}
            onClick={() => atualizar({ periodo: chave })}
            style={{
              cursor: 'pointer',
              fontSize: 12.5,
              padding: '8px 12px',
              borderRadius: 8,
              background: on ? 'var(--gold)' : 'var(--elev)',
              color: on ? 'var(--on-gold)' : 'var(--tx2)',
              border: `1px solid ${on ? 'var(--gold)' : 'var(--bd)'}`,
              fontWeight: on ? 600 : 400,
            }}
          >
            {ROTULOS[chave]}
          </button>
        );
      })}
    </div>
  );
}

export function SeletorSite({
  sites,
  atual,
}: {
  sites: { id: string; name: string }[];
  atual: string;
}) {
  const { atualizar, pendente } = useAtualizarBusca();

  return (
    <select
      aria-label="Site em contexto"
      value={atual}
      disabled={pendente}
      onChange={(e) => atualizar({ site: e.target.value })}
      style={{
        background: 'var(--elev)',
        color: 'var(--tx)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        minWidth: 220,
      }}
    >
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function IntervaloPersonalizado({ de, ate }: { de: string; ate: string }) {
  const { atualizar } = useAtualizarBusca();

  const campo = {
    background: 'var(--elev)',
    color: 'var(--tx)',
    border: '1px solid var(--bd)',
    borderRadius: 8,
    padding: '8px 10px',
    fontSize: 12.5,
  } as const;

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--tx2)' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        De
        <input type="date" value={de} max={ate} style={campo} onChange={(e) => atualizar({ de: e.target.value })} />
      </label>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        até
        <input type="date" value={ate} min={de} style={campo} onChange={(e) => atualizar({ ate: e.target.value })} />
      </label>
    </div>
  );
}

/**
 * Seletor de site nas telas do próprio site, onde o id vive no caminho da URL
 * (`/sites/<id>/desempenho`) e não na query. Trocar de site mantém a aba atual
 * e todos os demais filtros.
 */
export function SeletorSiteRota({
  sites,
  atual,
  aba,
}: {
  sites: { id: string; name: string }[];
  atual: string;
  aba: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendente, startTransition] = useTransition();

  return (
    <select
      aria-label="Site em contexto"
      value={atual}
      disabled={pendente}
      onChange={(e) => {
        const busca = searchParams.toString();
        startTransition(() =>
          router.push(`/sites/${e.target.value}/${aba}${busca ? `?${busca}` : ''}`),
        );
      }}
      style={{
        background: 'var(--elev)',
        color: 'var(--tx)',
        border: '1px solid var(--bd)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 13,
        minWidth: 220,
      }}
    >
      {sites.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
