import Link from 'next/link';
import { dataHora } from '@/lib/formato';
import {
  ESTADO_CONFIG_LABEL,
  RECURSO_LABEL,
  estadoDaConfiguracao,
  type EstadoDaConfiguracao,
  type ResumoDeConfiguracao,
} from '@/lib/recursos';
import { ESTADO_LABEL, ESTADO_TOM, type Site } from '@/server/services/sites';
import { Etiqueta } from '@/components/Tabela';

/**
 * Um site como cartão.
 *
 * A tabela anterior tinha sete colunas e rolava na horizontal mesmo no
 * computador — e no celular era ilegível. Aqui cada site é um bloco que cabe na
 * largura de um telefone.
 *
 * **A cor é o estado da configuração**, e é a informação principal do cartão:
 * é ela que responde "onde eu preciso mexer?" sem ler nada. A barra de
 * progresso é verificados ÷ escolhidos — uma conta real, não um percentual
 * decorativo, e ela some quando nada foi escolhido, porque não há denominador.
 *
 * O visual veio de um componente pronto (Tailwind, com classes de cor
 * `green`/`orange`/`red`/`blue`). O que foi adotado é a estrutura — faixa de
 * cor, cabeçalho, progresso, rodapé com a próxima ação. As cores saem dos
 * tokens do tema, e significam estado; no original elas eram só variedade.
 */

/** Cada estado tem uma cor, e a cor quer dizer uma coisa só. */
const CORES: Record<EstadoDaConfiguracao, { traco: string; texto: string; fundo: string }> = {
  // Cinza: ninguém disse ainda o que este site deve medir. Não é problema,
  // é ausência de decisão.
  nao_iniciada: { traco: 'var(--tx3)', texto: 'var(--soft-tx)', fundo: 'var(--soft-bg)' },
  // Vermelho: alguma verificação falhou com motivo registrado. Vence a
  // pendência simples — é o que exige ação agora.
  com_erro: { traco: 'var(--neg)', texto: 'var(--neg)', fundo: 'rgba(255,133,133,.12)' },
  // Âmbar: escolhido e esperando verificação.
  pendente: { traco: 'var(--warn-tx)', texto: 'var(--warn-tx)', fundo: 'var(--warn-bg)' },
  // Verde: tudo o que foi escolhido está verificado.
  completa: { traco: 'var(--gold)', texto: 'var(--ok-tx)', fundo: 'var(--ok-bg)' },
};

export function CartaoSite({
  site,
  resumo,
}: {
  site: Site;
  resumo: ResumoDeConfiguracao | undefined;
}) {
  const estado = estadoDaConfiguracao(resumo);
  const cor = CORES[estado];

  const escolhidos = (resumo?.verificados ?? 0) + (resumo?.pendentes ?? 0);
  const progresso = escolhidos > 0 ? (resumo!.verificados / escolhidos) * 100 : null;
  const faltando = resumo?.faltando ?? [];
  const falta = estado !== 'completa';

  return (
    <article
      className="cartao-site"
      // A faixa de cor é `inset`, e não uma borda: borda mudaria a caixa e
      // desalinharia os cartões vizinhos por 3px.
      style={{ boxShadow: `inset 3px 0 0 ${cor.traco}` }}
    >
      <header className="cartao-site-topo">
        <Link href={`/sites?cliente=${site.clientId}`} className="cartao-site-cliente">
          {site.clienteNome}
        </Link>
        <span
          className="cartao-site-estado"
          style={{ background: cor.fundo, color: cor.texto }}
        >
          {ESTADO_CONFIG_LABEL[estado]}
        </span>
      </header>

      <div>
        <h3 className="cartao-site-nome">
          <Link href={`/sites/${site.id}/desempenho`}>{site.name}</Link>
        </h3>
        <p className="mono cartao-site-dominio">{site.domain}</p>
      </div>

      {progresso !== null ? (
        <div>
          <div className="cartao-site-progresso-rotulo">
            <span>Recursos verificados</span>
            <span className="mono">
              {resumo!.verificados}/{escolhidos}
            </span>
          </div>
          <div
            className="cartao-site-barra"
            role="img"
            aria-label={`${resumo!.verificados} de ${escolhidos} recursos verificados`}
          >
            <span style={{ width: `${progresso}%`, background: cor.traco }} />
          </div>
        </div>
      ) : (
        <p className="cartao-site-vazio">
          Nenhum recurso escolhido ainda. Sem isso, não há o que medir — nem o que cobrar como
          pendência.
        </p>
      )}

      {faltando.length > 0 && (
        <p className="cartao-site-falta">
          <span style={{ color: cor.texto }}>Falta verificar:</span>{' '}
          {faltando.map((r) => RECURSO_LABEL[r]).join(' · ')}
        </p>
      )}

      <footer className="cartao-site-rodape">
        <span className="cartao-site-coleta">
          <Etiqueta
            texto={ESTADO_LABEL[site.estado]}
            tom={ESTADO_TOM[site.estado] === 'ok' ? 'ok' : ESTADO_TOM[site.estado] === 'aguardando' ? 'warn' : 'soft'}
          />
          {/* Último evento é atividade recente, e é diferente de "verificado".
              Um site de pouco tráfego pode passar dias sem visita sem estar
              quebrado. */}
          {site.ultimoEvento && (
            <span className="cartao-site-ultimo">último: {dataHora(site.ultimoEvento)}</span>
          )}
        </span>

        <Link href={`/sites/${site.id}/configurar`} className="cartao-site-acao">
          {falta ? 'Continuar configuração →' : 'Ver configuração'}
        </Link>
      </footer>
    </article>
  );
}
