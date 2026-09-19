/**
 * Marcas de um eixo de contagem.
 *
 * O defeito que isto corrige: o gráfico desenhava linhas igualmente espaçadas e
 * rotulava cada uma com `topo × [0, .25, .5, .75, 1]`, enquanto o topo vinha de
 * uma escala que devolvia 1, 2, 5, 25, 250 — nenhum deles divisível por quatro.
 * O resultado era uma régua cujas marcas mentiam sobre o próprio espaçamento:
 *
 *     máximo 1  →  0, 0, 1, 1, 1      (dois zeros e três uns, em cinco linhas)
 *     máximo 4  →  0, 1, 3, 4, 5      (passos de 1, 2, 1, 1)
 *     máximo 23 →  0, 6, 13, 19, 25
 *
 * Quem lê um gráfico lê a distância entre as linhas, não cada número. O caso
 * ruim caía justamente no site pequeno, que é onde cada visita conta.
 *
 * Aqui o PASSO é escolhido primeiro, entre valores redondos, e o topo é
 * `passo × intervalos`. Assim toda marca é inteira e a distância entre duas
 * marcas é sempre a mesma.
 *
 * **O número de intervalos é fixo, e isso é deliberado.** Deixá-lo variar com os
 * dados aperta melhor a escala, mas o gráfico tem DOIS eixos sobre as mesmas
 * linhas: se a contagem seguisse a série da esquerda, trocar a métrica
 * principal mudaria as linhas e, com elas, o topo da direita — a série de
 * formulários mudaria de altura sem que nenhum formulário tivesse entrado. Foi
 * o que uma prova de navegador pegou, e é exatamente o tipo de confusão que o
 * eixo próprio existe para eliminar. Contagem fixa custa alguma altura
 * desperdiçada num caso ou noutro; contagem variável custa credibilidade.
 *
 * São contagens: o passo nunca é fracionário. Meia visita não existe.
 */

/** Valores redondos aceitáveis para um passo, dentro de cada ordem de grandeza. */
const PASSOS_REDONDOS = [1, 2, 5, 10] as const;

/**
 * Espaços entre linhas.
 *
 * Cinco não é gosto: com passos redondos e rótulos inteiros, o número de
 * intervalos decide quanta altura sobra acima do maior valor. Medido sobre
 * máximos de 1 a 1000, o aproveitamento médio da altura foi 66% com 3
 * intervalos, 68,5% com 4, **74,3% com 5**, 70,8% com 6 e 69,9% com 8. Cinco
 * ganha, e o pior caso (máximo 1, régua de 0 a 5) é onde qualquer eixo de
 * inteiros fica largo de qualquer jeito.
 */
export const INTERVALOS_PADRAO = 5;

/** O menor valor redondo maior ou igual a `bruto`, nunca abaixo de 1. */
function passoRedondo(bruto: number): number {
  if (!Number.isFinite(bruto) || bruto <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const escolhido = (PASSOS_REDONDOS.find((p) => bruto <= p * magnitude) ?? 10) * magnitude;
  // Contagem não tem passo fracionário, e arredondar para cima nunca esconde
  // valor: o topo só cresce.
  return Math.max(1, Math.ceil(escolhido));
}

export type Eixo = {
  /** Valor da linha mais alta. Sempre ≥ o maior valor da série. */
  topo: number;
  /** Distância entre duas linhas. */
  passo: number;
  /** Quantos espaços entre linhas. As linhas são `intervalos + 1`. */
  intervalos: number;
  /** Os números de cada linha, de baixo para cima. Todos inteiros. */
  marcas: number[];
};

/**
 * Eixo para uma série de contagens.
 *
 * Série toda zerada (ou vazia) ainda devolve uma régua: o gráfico precisa de um
 * topo para desenhar a linha rente ao chão, e um topo zero seria uma divisão
 * por zero.
 *
 * O resultado depende SÓ do máximo da própria série. Duas séries desenhadas
 * sobre as mesmas linhas continuam independentes uma da outra.
 */
export function eixoDeContagem(maximo: number, intervalos = INTERVALOS_PADRAO): Eixo {
  const n = Math.max(1, Math.round(intervalos));
  const passo = Number.isFinite(maximo) && maximo > 0 ? passoRedondo(maximo / n) : 1;
  return {
    topo: passo * n,
    passo,
    intervalos: n,
    marcas: Array.from({ length: n + 1 }, (_, i) => i * passo),
  };
}

/**
 * As duas escalas do gráfico de evolução, decididas fora do componente.
 *
 * Existe para que a regra que importa seja testável: **a escala da série de
 * formulários não pode depender da série principal.** Esse foi o defeito do
 * protótipo — a linha de formulários era normalizada contra o eixo de visitas e
 * sugeria centenas onde o cartão dizia dezenas.
 *
 * Provar isso na tela renderizada não funciona de forma confiável: quando as
 * duas séries têm ordens de grandeza próximas, os dois eixos caem no mesmo topo
 * e as duas implementações — a certa e a errada — desenham exatamente a mesma
 * curva. Medido, com a massa de navegador: reintroduzi a normalização e a prova
 * de tela continuou passando. Aqui os números são escolhidos, então a diferença
 * aparece.
 */
export function escalasDoGrafico(
  principal: readonly number[],
  formularios: readonly number[],
): { esquerda: Eixo; direita: Eixo } {
  return {
    esquerda: eixoDeContagem(Math.max(...principal, 0)),
    direita: eixoDeContagem(Math.max(...formularios, 0)),
  };
}

/**
 * Quais dias ganham rótulo no eixo X: um a cada `ceil(n / 7)` a partir de 12
 * dias, sempre com o primeiro e o último — e sem um penúltimo colado no último,
 * que viraria dois números sobrepostos. Em 30 dias mostrar todo dia vira borrão.
 */
export function diasRotulados(n: number): number[] {
  if (n <= 0) return [];
  const passo = n > 12 ? Math.ceil(n / 7) : 1;
  const dias: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const ultimo = i === n - 1;
    const colado = !ultimo && n - 1 - i < Math.ceil(passo / 2);
    if (ultimo || (i % passo === 0 && !colado)) dias.push(i);
  }
  return dias;
}
