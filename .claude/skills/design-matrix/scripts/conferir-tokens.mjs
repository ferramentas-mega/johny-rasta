#!/usr/bin/env node
/**
 * Confere o sistema visual contra `src/styles/theme.css`.
 *
 * Adaptado de uma skill genérica de design system que GERAVA paleta a partir de
 * uma cor de marca. Aqui isso não serve: os tokens deste projeto são os valores
 * exatos do protótipo exportado do Claude Design, preservados de propósito para
 * que a aparência não mudasse ao trocar de tecnologia. Gerar uma paleta nova
 * seria jogar fora a decisão que o arquivo inteiro existe para manter.
 *
 * O que ESTE projeto precisa é do contrário: um guarda que avise quando alguém
 * sair do sistema sem querer. São três perguntas, todas respondidas por leitura
 * de arquivo — nada roda navegador, nada precisa de banco.
 *
 *   1. Os dois temas definem o MESMO conjunto de tokens?
 *      Um token que existe só no escuro não dá erro: no claro ele cai no valor
 *      do `:root`, que é o escuro — e a tela fica com texto quase preto sobre
 *      fundo quase preto, sem nenhum aviso.
 *
 *   2. Algum componente escreve cor crua em vez de `var(--token)`?
 *      Nem toda ocorrência é defeito, e o script distingue: `manifest.ts` e as
 *      meta tags de `theme-color` NÃO PODEM ler CSS, então ali a cor crua é
 *      obrigatória — e é exatamente por isso que ela precisa ser vigiada.
 *
 *   3. Todo par texto-sobre-fundo alcança 4,5:1?
 *      É o mínimo da WCAG para texto de corpo, e este painel é feito de
 *      legenda pequena. Medido antes de existir esta conferência: o tema CLARO
 *      reprovava em sete pares — `--tx3` sobre `--elev` dava 3,78:1, e `--tx3`
 *      é justamente o token de toda legenda da interface.
 *
 *   4. As cores cruas que copiam um token ainda BATEM com ele?
 *      É o defeito silencioso de verdade: mudar `--side` no tema e esquecer o
 *      manifesto deixa a barra do navegador com a cor antiga. Nada quebra,
 *      ninguém vê, e a identidade fica meio velha e meio nova.
 *
 * Uso:  node .claude/skills/design-matrix/scripts/conferir-tokens.mjs
 * Sai com código 1 se achar divergência, para poder entrar no CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = process.cwd();
const TEMA = join(RAIZ, 'src/styles/theme.css');

/** Onde a cor crua é OBRIGATÓRIA, com o motivo. Nada aqui é tolerância vaga. */
const FORA_DO_ALCANCE_DO_CSS = {
  'src/app/manifest.ts': 'manifesto PWA: o Chrome lê JSON, não folha de estilo',
  'src/app/layout.tsx': 'meta theme-color: pinta a barra do navegador antes do CSS existir',
  'src/lib/snippets.ts': 'texto para o console do navegador do CLIENTE, fora da nossa interface',
  'src/components/ChuvaMatrix.tsx': 'canvas: `ctx.fillStyle` não resolve `var(--token)`',
};

function lerTokens(css, seletor) {
  const bloco = css.slice(css.indexOf(seletor));
  const corpo = bloco.slice(bloco.indexOf('{') + 1, bloco.indexOf('}'));
  const tokens = new Map();
  for (const linha of corpo.split('\n')) {
    const m = linha.match(/^\s*(--[\w-]+)\s*:\s*(.+?);\s*$/);
    if (m) tokens.set(m[1], m[2].trim());
  }
  return tokens;
}

function arquivos(dir, achados = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, achados);
    else if (/\.(ts|tsx)$/.test(caminho)) achados.push(caminho);
  }
  return achados;
}

const css = readFileSync(TEMA, 'utf8');
const escuro = lerTokens(css, "[data-tema='escuro']");
const claro = lerTokens(css, "[data-tema='claro']");

const problemas = [];
const avisos = [];

// ── 1. Paridade entre os temas ───────────────────────────────────────────────
for (const token of escuro.keys()) {
  if (!claro.has(token)) {
    problemas.push(`${token} existe no tema escuro e NÃO no claro — no claro ele herda o valor escuro, em silêncio.`);
  }
}
for (const token of claro.keys()) {
  if (!escuro.has(token)) {
    problemas.push(`${token} existe no tema claro e NÃO no escuro.`);
  }
}

// ── 2 e 3. Cor crua fora do tema ─────────────────────────────────────────────
const porValor = new Map();
for (const [tema, tokens] of [['escuro', escuro], ['claro', claro]]) {
  for (const [token, valor] of tokens) {
    const hex = valor.trim().toLowerCase();
    if (/^#[0-9a-f]{3,8}$/.test(hex)) {
      porValor.set(hex, [...(porValor.get(hex) ?? []), `${token} (${tema})`]);
    }
  }
}

for (const caminho of arquivos(join(RAIZ, 'src'))) {
  const rel = relative(RAIZ, caminho);
  const conteudo = readFileSync(caminho, 'utf8');
  const linhas = conteudo.split('\n');

  linhas.forEach((linha, i) => {
    for (const bruto of linha.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) {
      const hex = bruto.toLowerCase();
      const motivo = FORA_DO_ALCANCE_DO_CSS[rel];
      const igualA = porValor.get(hex);

      if (!motivo) {
        problemas.push(`${rel}:${i + 1} usa a cor crua ${bruto} — a interface lê o tema por var(--token).`);
      } else if (igualA) {
        // Cor crua obrigatória QUE COPIA um token: é a que sai de sincronia.
        avisos.push(`${rel}:${i + 1} repete ${bruto}, que é ${igualA.join(' e ')} — ${motivo}. Mudou o token? Mude aqui também.`);
      }
    }
  });
}

// ── 4. Contraste ─────────────────────────────────────────────────────────────
//
// Os pares que a interface realmente usa. Fundo com alfa é composto sobre
// `--bg` antes de medir: `rgba(…, .12)` sobre preto não é a cor que se vê.
const PARES = [
  ['--tx', '--bg'], ['--tx', '--card'], ['--tx', '--side'], ['--tx', '--elev'], ['--tx', '--hover'],
  ['--tx2', '--bg'], ['--tx2', '--card'], ['--tx2', '--side'], ['--tx2', '--elev'],
  ['--tx3', '--bg'], ['--tx3', '--card'], ['--tx3', '--side'], ['--tx3', '--elev'],
  ['--gold-tx', '--bg'], ['--gold-tx', '--card'], ['--gold-tx', '--elev'],
  ['--pos-tx', '--card'], ['--neg-tx', '--card'],
  ['--ok-tx', '--ok-bg'], ['--warn-tx', '--warn-bg'], ['--soft-tx', '--soft-bg'],
  ['--on-gold', '--gold'],
];
const MINIMO = 4.5;

function cor(v) {
  let m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255, 1]; }
  m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = /rgba?\(([^)]+)\)/i.exec(v);
  if (m) { const p = m[1].split(',').map((x) => parseFloat(x.trim())); return [p[0], p[1], p[2], p[3] ?? 1]; }
  return null;
}
const sobre = (f, b) => (f[3] >= 1 ? f : [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3])).concat(1));
const luz = (c) => {
  const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const razao = (f, b) => (Math.max(luz(f), luz(b)) + 0.05) / (Math.min(luz(f), luz(b)) + 0.05);

for (const [tema, tokens] of [['escuro', escuro], ['claro', claro]]) {
  const fundo = cor(tokens.get('--bg'));
  for (const [frente, atras] of PARES) {
    const f = cor(tokens.get(frente));
    const a = cor(tokens.get(atras));
    if (!f || !a) continue;
    const base = sobre(a, fundo);
    const r = razao(sobre(f, base), base);
    if (r < MINIMO) {
      problemas.push(`contraste ${frente} sobre ${atras} no tema ${tema}: ${r.toFixed(2)}:1 — mínimo ${MINIMO}:1 para texto de corpo.`);
    }
  }
}

console.log(`Tokens: ${escuro.size} no escuro, ${claro.size} no claro.`);
console.log(`Contraste: ${PARES.length} pares conferidos por tema, mínimo ${MINIMO}:1.`);
if (avisos.length) {
  console.log(`\nCópias vigiadas (${avisos.length}) — obrigatórias, e por isso rastreadas:`);
  for (const a of avisos) console.log(`  · ${a}`);
}
if (problemas.length) {
  console.log(`\nDivergências (${problemas.length}):`);
  for (const p of problemas) console.log(`  ✗ ${p}`);
  process.exit(1);
}
console.log('\nSem divergência: os dois temas cobrem os mesmos tokens e nenhuma tela inventa cor.');
