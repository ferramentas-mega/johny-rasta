'use client';

import { useFormStatus } from 'react-dom';

/** Primitivos de formulário, para que todos os cadastros tenham o mesmo comportamento. */

export type EstadoFormulario = {
  ok?: boolean;
  erro?: string;
  campos?: Record<string, string>;
  mensagem?: string;
};

export const ESTADO_VAZIO: EstadoFormulario = {};

const ESTILO_CAMPO: React.CSSProperties = {
  width: '100%',
  background: 'var(--elev)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--raio-p)',
  padding: '10px 12px',
  fontSize: 'var(--tipo-corpo)',
  color: 'var(--tx)',
};

export function Campo({
  nome,
  rotulo,
  erro,
  dica,
  children,
  ...resto
}: {
  nome: string;
  rotulo: string;
  erro?: string;
  dica?: string;
  children?: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const idErro = `${nome}-erro`;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>
      {rotulo}
      {children ?? (
        <input
          name={nome}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          style={{ ...ESTILO_CAMPO, borderColor: erro ? 'var(--neg)' : 'var(--bd)' }}
          {...resto}
        />
      )}
      {dica && !erro && <span style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{dica}</span>}
      {erro && (
        <span id={idErro} role="alert" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--neg-tx)' }}>
          {erro}
        </span>
      )}
    </label>
  );
}

export function Selecao({
  nome,
  rotulo,
  erro,
  padrao,
  opcoes,
}: {
  nome: string;
  rotulo: string;
  erro?: string;
  padrao?: string;
  opcoes: { valor: string; texto: string }[];
}) {
  return (
    <Campo nome={nome} rotulo={rotulo} erro={erro}>
      <select name={nome} defaultValue={padrao} style={ESTILO_CAMPO}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/**
 * Botão de envio.
 *
 * Desabilita durante o envio e troca o texto. É o que impede o clique duplo de
 * virar dois cadastros — e o rótulo só muda porque há operação em curso.
 */
export function BotaoSubmeter({ children, ocupado }: { children: React.ReactNode; ocupado?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        cursor: pending ? 'progress' : 'pointer',
        background: 'var(--gold)',
        color: 'var(--on-gold)',
        border: 'none',
        borderRadius: 'var(--raio-p)',
        padding: '10px 16px',
        fontWeight: 600,
        fontSize: 'var(--tipo-corpo)',
        opacity: pending ? 0.7 : 1,
      }}
    >
      {pending ? (ocupado ?? 'Salvando…') : children}
    </button>
  );
}

export function BotaoSecundario({
  children,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      style={{
        cursor: 'pointer',
        background: 'var(--elev)',
        color: 'var(--tx2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--raio-p)',
        padding: '10px 14px',
        fontSize: 'var(--tipo-corpo)',
      }}
      {...resto}
    >
      {children}
    </button>
  );
}

export function Retorno({ estado }: { estado: EstadoFormulario }) {
  if (!estado.erro && !estado.mensagem) return null;
  const erro = !!estado.erro;
  return (
    <p
      role={erro ? 'alert' : 'status'}
      style={{
        fontSize: 'var(--tipo-apoio)',
        color: erro ? 'var(--neg-tx)' : 'var(--ok-tx)',
        background: erro ? 'transparent' : 'var(--ok-bg)',
        padding: erro ? 0 : '8px 12px',
        borderRadius: 'var(--raio-p)',
      }}
    >
      {estado.erro ?? estado.mensagem}
    </p>
  );
}
