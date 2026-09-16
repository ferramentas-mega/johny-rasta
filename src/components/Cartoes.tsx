import Link from 'next/link';
import { Icone, type IconeNome } from '@/components/icones';
import { Minigrafico } from '@/components/Minigrafico';
import { Sobrelinha } from '@/components/Sobrelinha';
import type { Ponto } from '@/lib/evidencias';
import type { Variacao } from '@/lib/formato';

/**
 * Cartão de indicador.
 *
 * Recebe valor e variação já calculados pela camada de métricas. Não faz conta
 * nenhuma: se este componente pudesse calcular, dois cartões poderiam discordar.
 */
export function CartaoIndicador({
  chave,
  rotulo,
  valor,
  ajuda,
  icone,
  variacao,
  destaque = false,
  href,
}: {
  /** Chave do indicador em METRICS. Vira identificador estável para os testes. */
  chave: string;
  rotulo: string;
  valor: string;
  ajuda: string;
  icone: IconeNome;
  variacao: Variacao;
  destaque?: boolean;
  href?: string;
}) {
  const cor =
    variacao.tom === 'alta' ? 'var(--pos)' : variacao.tom === 'baixa' ? 'var(--neg)' : 'var(--tx3)';

  const conteudo = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--tx2)', fontSize: 'var(--tipo-corpo)' }}>
        {/* Ladrilho, e não ícone solto. Na referência todo ícone vive num
            quadrado com preenchimento e borda de acento em alfa baixo — é o que
            dá peso ao canto do cartão sem competir com o número. */}
        <span
          style={{
            flex: 'none',
            width: 26,
            height: 26,
            borderRadius: 'var(--raio-p)',
            background: 'var(--ok-bg)',
            border: '1px solid var(--gold-bd)',
            color: 'var(--gold-tx)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icone nome={icone} tamanho={14} />
        </span>
        <span>{rotulo}</span>
        <span
          title={ajuda}
          // `role="img"` não é decoração: `aria-label` NÃO é válido num `<span>`
          // sem papel — a função implícita é `generic`, que não aceita nome do
          // autor, e o leitor de tela pode descartar o rótulo inteiro. O efeito
          // seria a definição não chegar a ninguém, sem nada aparecer errado na
          // tela. `img` aceita nome, e o crachá é de fato um glifo.
          role="img"
          aria-label={`Definição: ${ajuda}`}
          tabIndex={0}
          style={{
            marginLeft: 'auto',
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1px solid var(--bd)',
            fontSize: 'var(--tipo-micro)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--tx3)',
            cursor: 'help',
            flex: 'none',
          }}
        >
          ?
        </span>
      </div>
      <div
        className="mono"
        data-testid={`kpi-valor-${chave}`}
        /* A receita literal da referência:
             text-7xl font-light tracking-tighter text-emerald-400 leading-none
             drop-shadow-[0_0_12px_rgba(52,211,153,.6)]
           Peso 300 com trilha fechada — em peso leve a letra solta desmancha o
           número. O verde com brilho já era nosso; o que faltava era o peso. */
        style={{
          fontSize: 'var(--tipo-numero)',
          fontWeight: 'var(--peso-leve)',
          letterSpacing: 'var(--trilha-fechada)',
          lineHeight: 1,
          margin: '14px 0 8px',
          color: 'var(--gold-tx)',
          // Só o cartão em destaque brilha — ver a nota sobre hierarquia acima.
          textShadow: destaque ? 'var(--glow)' : 'none',
        }}
      >
        {valor}
      </div>
      <div className="mono" style={{ fontSize: 'var(--tipo-legenda)', color: cor }}>
        {variacao.texto}
      </div>
    </>
  );

  const estilo = {
    display: 'block',
    padding: '18px 18px 16px',
    // Raio e borda vêm da classe `.cartao`; o destaque só REFORÇA a borda.
    ...(destaque ? { border: '1px solid var(--gold)' } : null),
    // `var(--gold-fill)`, e não a cor escrita à mão que estava aqui
    // (`rgba(112,255,139,.10)`): aquele é o verde do tema ESCURO, e ele não
    // trocava no claro — o cartão de destaque puxava para um verde que não é o
    // da paleta clara. Não dava erro, e o verificador não pegava: ele conferia
    // hexadecimal, e isto é `rgba`. Hoje confere os dois.
    ...(destaque
      ? { background: 'linear-gradient(180deg, var(--gold-fill), var(--card) 62%)' }
      : null),
    textDecoration: 'none',
    color: 'inherit',
  } as const;

  // A classe existe só pelo que estilo inline não faz: `:hover`. O cartão que
  // LEVA a algum lugar sobe ao nível 2 quando apontado; o que não leva fica
  // parado, porque movimento sem destino promete clique que não existe.
  return href ? (
    <Link href={href} className="cartao cartao-elevado" data-testid={`kpi-${chave}`} style={estilo}>
      {conteudo}
    </Link>
  ) : (
    <div className="cartao" data-testid={`kpi-${chave}`} style={estilo}>
      {conteudo}
    </div>
  );
}

/**
 * Cartão de número simples: rótulo, valor e uma nota que diz o que ele NÃO é.
 *
 * Existia desenhado à mão dentro das páginas — quatro `div` com o mesmo
 * `padding/raio/borda/fundo` repetidos —, e foi exatamente por isso que ele
 * ficou de fora quando o tratamento de cartão mudou: quem procura componente
 * não encontra o que não é componente. É o mesmo defeito que este projeto já
 * registrou para Server Action sem porta na tela, aplicado ao visual.
 *
 * A nota não é enfeite. "clique não é conversa iniciada" é o que impede o
 * número de ser lido como outra coisa, e há prova de navegador exigindo essas
 * frases.
 */
export function CartaoNumero({
  rotulo,
  valor,
  nota,
  tom = 'neutro',
  serie,
  variacao,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  tom?: 'neutro' | 'atencao';
  /**
   * A série por trás do número, quando ela EXISTE.
   *
   * Opcional de propósito, e a ausência não é falha de preenchimento: dos sete
   * indicadores da Visão geral, quatro são estado de AGORA ("sites com coleta",
   * "precisam de atenção") e não têm histórico diário em lugar nenhum. Desenhar
   * um gráfico ali seria inventar a medição — que é a regra que este projeto
   * mais protege. Sem série, o cartão é o mesmo, sem a faixa do gráfico.
   */
  serie?: Ponto[];
  /** Texto da variação, já calculado pela camada de métricas. */
  variacao?: string;
}) {
  return (
    <div className="cartao" style={{ padding: '16px 18px', overflow: 'hidden' }}>
      <div style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)' }}>{rotulo}</div>
      {/* A receita do número da referência: peso leve, trilha fechada, verde
          com brilho. */}
      <div
        className="mono"
        style={{
          fontSize: 'var(--tipo-numero)',
          fontWeight: 'var(--peso-leve)',
          letterSpacing: 'var(--trilha-fechada)',
          lineHeight: 1,
          margin: '10px 0 6px',
          /* Brilho é HIERARQUIA, não decoração. Na rodada passada eu pus em
             todo número, e com todos brilhando nenhum se destaca — o efeito
             líquido é o mesmo de não ter. Fica só onde o número PEDE atenção;
             o verde da marca já basta para distinguir um indicador normal. */
          color: tom === 'atencao' ? 'var(--warn-tx)' : 'var(--gold-tx)',
          textShadow: tom === 'atencao' ? 'var(--glow)' : 'none',
        }}
      >
        {valor}
      </div>
      <div style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx3)' }}>{nota}</div>

      {variacao && (
        <div className="mono" style={{ fontSize: 'var(--tipo-legenda)', color: 'var(--tx2)', marginTop: 'var(--esp-1)' }}>
          {variacao}
        </div>
      )}

      {serie && serie.length > 0 && (
        // Sangrando até a borda: a faixa do gráfico é o rodapé do cartão, e um
        // respiro lateral aqui faria a área parecer um segundo cartão dentro do
        // primeiro. O `overflow: hidden` do contêiner é o que a contém.
        <div style={{ margin: 'var(--esp-3) -18px -16px', opacity: 0.9 }}>
          <Minigrafico
            pontos={serie}
            id={`spark-${rotulo.replace(/[^a-zA-Z]/g, '')}`}
            cor={tom === 'atencao' ? 'var(--warn-tx)' : 'var(--gold)'}
          />
        </div>
      )}
    </div>
  );
}

export function Painel({
  titulo,
  subtitulo,
  kicker,
  acoes,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  kicker?: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="cartao" style={{ padding: '18px 18px 20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          {kicker && <Sobrelinha tom="discreto">{kicker}</Sobrelinha>}
          <h2 style={{ fontSize: 'var(--tipo-secao)', fontWeight: 600, margin: '2px 0 0' }}>{titulo}</h2>
          {subtitulo && <p style={{ fontSize: 'var(--tipo-apoio)', color: 'var(--tx2)', marginTop: 4 }}>{subtitulo}</p>}
        </div>
        {acoes && <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Aviso({ children, tom = 'soft' }: { children: React.ReactNode; tom?: 'soft' | 'ok' | 'warn' }) {
  const fundo = tom === 'ok' ? 'var(--ok-bg)' : tom === 'warn' ? 'var(--warn-bg)' : 'var(--soft-bg)';
  const cor = tom === 'ok' ? 'var(--ok-tx)' : tom === 'warn' ? 'var(--warn-tx)' : 'var(--soft-tx)';
  return (
    <div
      className="mono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 'var(--raio-pilula)',
        background: fundo,
        /* A pílula da referência tem SEMPRE borda de acento em alfa baixo
           (`border-<cor>-500/20`) por cima do preenchimento. Preenchimento
           sozinho vira mancha; a borda é o que dá a aresta. */
        border: `1px solid ${tom === 'ok' ? 'var(--gold-bd)' : 'var(--bd)'}`,
        color: cor,
        fontSize: 'var(--tipo-legenda)',
        letterSpacing: 'var(--trilha-media)',
      }}
    >
      {children}
    </div>
  );
}
