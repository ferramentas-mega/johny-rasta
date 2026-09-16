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
 *   3. As cores cruas que copiam um token ainda BATEM com ele?
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

console.log(`Tokens: ${escuro.size} no escuro, ${claro.size} no claro.`);
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
