// Baseline ANTES: navega as rotas do painel no build de produção local e
// registra tempos de navegação, requisições, bytes e as consultas SQL que cada
// navegação gera (lidas do log do Postgres local, fatiado por offset de bytes).
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3123';
const LOG = process.env.PG_LOG ?? '/var/log/postgresql/postgresql-16-main.log';
const SAIDA = process.env.SAIDA_MEDICAO ?? new URL('.', import.meta.url).pathname;
const RUNS = 3;

// ─── log do Postgres ────────────────────────────────────────────────────────
function tamanhoLog() { return fs.statSync(LOG).size; }
function lerLogDesde(offset) {
  const fd = fs.openSync(LOG, 'r');
  const fim = fs.fstatSync(fd).size;
  const buf = Buffer.alloc(Math.max(0, fim - offset));
  fs.readSync(fd, buf, 0, buf.length, offset);
  fs.closeSync(fd);
  return buf.toString('utf8');
}
// Uma entrada = linha com carimbo + linhas de continuação (tab). Só entradas de
// `execute` e `statement` contam como statement; parse/bind entram só no tempo.
function parseLog(texto) {
  const entradas = [];
  for (const linha of texto.split('\n')) {
    if (/^\d{4}-\d\d-\d\d /.test(linha)) entradas.push(linha);
    else if (entradas.length) entradas[entradas.length - 1] += '\n' + linha;
  }
  const stmts = []; let msTotal = 0; let msParseBind = 0;
  for (const e of entradas) {
    const m = e.match(/duration: ([0-9.]+) ms  (statement|execute|parse|bind)(?: [^:]*)?: ([\s\S]*)$/);
    if (!m) continue;
    const ms = parseFloat(m[1]);
    msTotal += ms;
    if (m[2] === 'parse' || m[2] === 'bind') { msParseBind += ms; continue; }
    const sql = m[3].replace(/\s+/g, ' ').trim();
    stmts.push({ ms, sql });
  }
  return { stmts, msTotal, msParseBind };
}
function normalizar(sql) {
  return sql.replace(/\$\d+/g, '$?').replace(/'[^']*'/g, "'?'").replace(/\b\d+\b/g, '?').replace(/\s+/g, ' ').trim();
}
function resumoSql(p) {
  const porTexto = new Map();
  for (const s of p.stmts) {
    const k = normalizar(s.sql);
    const v = porTexto.get(k) ?? { n: 0, ms: 0 };
    v.n += 1; v.ms += s.ms; porTexto.set(k, v);
  }
  const repetidas = [...porTexto.entries()].filter(([, v]) => v.n > 1)
    .map(([sql, v]) => ({ vezes: v.n, ms: +v.ms.toFixed(3), sql: sql.slice(0, 160) }))
    .sort((a, b) => b.vezes - a.vezes);
  const maisLentas = [...p.stmts].sort((a, b) => b.ms - a.ms).slice(0, 5)
    .map((s) => ({ ms: s.ms, sql: s.sql.slice(0, 160) }));
  const sessao = p.stmts.filter((s) => /find_user_for_session|find_user_for_login|\bfrom users\b|\bjoin users\b/i.test(s.sql)).length;
  const setConfig = p.stmts.filter((s) => /set_config\('app\.account_id'/i.test(s.sql)).length;
  const begins = p.stmts.filter((s) => /^begin\b/i.test(s.sql)).length;
  const distintas = porTexto.size;
  return { statements: p.stmts.length, msSql: +p.msTotal.toFixed(3), msParseBind: +p.msParseBind.toFixed(3), distintas, transacoes: begins, consultasSessao: sessao, setConfigConta: setConfig, repetidas, maisLentas };
}

// ─── navegação ──────────────────────────────────────────────────────────────
function mediana(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

async function lancar() {
  try { return await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true }); }
  catch (e) { console.error('sem executablePath fixo:', e.message.split('\n')[0]); return chromium.launch({ headless: true }); }
}

async function medirNavegacao(browser, cookies, url, { bloquearPrefetch }) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const reqs = [];
  let prefetches = 0;
  await page.route('**/*', (route) => {
    const r = route.request();
    const h = r.headers();
    const ehPrefetch = h['next-router-prefetch'] === '1' || h['purpose'] === 'prefetch' || h['sec-purpose']?.includes('prefetch');
    if (ehPrefetch) { prefetches += 1; if (bloquearPrefetch) return route.abort(); }
    route.continue();
  });
  page.on('response', async (res) => {
    const r = res.request();
    const h = res.headers();
    let bytes = h['content-length'] ? parseInt(h['content-length'], 10) : null;
    let corpo = null;
    try { corpo = (await res.body()).length; } catch { /* abortado ou sem corpo */ }
    if (bytes == null) bytes = corpo ?? 0;
    const ct = h['content-type'] ?? '';
    const tipo = r.resourceType();
    reqs.push({ url: res.url(), status: res.status(), tipo, ct, bytes, corpo, encoding: h['content-encoding'] ?? '', rsc: !!r.headers()['rsc'] });
  });
  const off = tamanhoLog();
  const t0 = Date.now();
  await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
  const wall = Date.now() - t0;
  await page.waitForTimeout(400);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const rs = performance.getEntriesByType('resource');
    const ehJs = (e) => e.initiatorType === 'script' || /\.js(\?|$)/.test(e.name);
    const soma = (xs, k) => xs.reduce((a, e) => a + (e[k] || 0), 0);
    return { ttfb: n.responseStart, responseEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, transferSize: n.transferSize, decodedBodySize: n.decodedBodySize, encodedBodySize: n.encodedBodySize,
      recursos: rs.length, fioRecursos: soma(rs, 'encodedBodySize'), transferRecursos: soma(rs, 'transferSize'), decodRecursos: soma(rs, 'decodedBodySize'),
      fioJs: soma(rs.filter(ehJs), 'encodedBodySize'), decodJs: soma(rs.filter(ehJs), 'decodedBodySize'), nJs: rs.filter(ehJs).length,
      fioFontes: soma(rs.filter((e) => /\.woff2/.test(e.name)), 'encodedBodySize'), fioCss: soma(rs.filter((e) => /\.css/.test(e.name)), 'encodedBodySize'),
      titulo: document.title, h1: document.querySelector('h1')?.textContent?.trim() ?? null };
  });
  const sql = resumoSql(parseLog(lerLogDesde(off)));
  await ctx.close();
  const js = reqs.filter((r) => r.tipo === 'script' || /javascript/.test(r.ct));
  const soma = (xs, k) => xs.reduce((a, r) => a + (r[k] ?? 0), 0);
  return {
    url, wallMs: wall, ...nav, requests: reqs.length, prefetchesTentados: prefetches,
    bytesTransferidos: nav.encodedBodySize + nav.fioRecursos, bytesDecodificados: nav.decodedBodySize + nav.decodRecursos,
    jsRequests: nav.nJs, jsBytesTransferidos: nav.fioJs, jsBytesDecodificados: nav.decodJs, fontesBytes: nav.fioFontes, cssBytes: nav.fioCss,
    porTipo: Object.fromEntries(['document', 'script', 'stylesheet', 'font', 'image', 'fetch', 'other'].map((t) => [t, reqs.filter((r) => r.tipo === t).length])),
    rscRequests: reqs.filter((r) => r.rsc).length,
    sql,
  };
}

async function main() {
  const browser = await lancar();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Login, com SQL contado.
  const offLogin = tamanhoLog();
  await page.goto(BASE + '/entrar', { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', 'dona@agencia.teste');
  await page.fill('input[name=senha]', 'teste123456');
  await Promise.all([page.waitForURL('**/visao-geral', { timeout: 30000 }), page.click('button[type=submit]')]);
  await page.waitForLoadState('networkidle');
  const sqlLogin = resumoSql(parseLog(lerLogDesde(offLogin)));
  const cookies = await ctx.cookies();
  console.error('login ok; cookies:', cookies.map((c) => c.name).join(','), '| statements no login+visao-geral:', sqlLogin.statements);

  // Descobrir ids navegando.
  await page.goto(BASE + '/clientes', { waitUntil: 'networkidle' });
  const clientes = await page.$$eval('a[href^="/clientes/"]', (as) => as.map((a) => ({ href: a.getAttribute('href'), texto: a.textContent.trim() })));
  const clienteHref = clientes.map((c) => c.href).find((h) => /^\/clientes\/[^/?#]+(\?.*)?$/.test(h));
  if (!clienteHref) throw new Error('nenhum link de cliente em /clientes: ' + JSON.stringify(clientes.slice(0, 10)));
  const clienteId = clienteHref.split('/')[2].split('?')[0];
  await page.goto(BASE + '/sites', { waitUntil: 'networkidle' });
  const sites = await page.$$eval('a[href^="/sites/"]', (as) => as.map((a) => {
    let el = a; for (let i = 0; i < 6 && el && !['LI', 'TR', 'ARTICLE', 'SECTION'].includes(el.tagName); i += 1) el = el.parentElement;
    return { href: a.getAttribute('href'), texto: a.textContent.trim(), contexto: (el ?? a).textContent.replace(/\s+/g, ' ').slice(0, 200) };
  }));
  const alfa = sites.find((s) => /^\/sites\/[^/?#]+(\/.*)?$/.test(s.href) && !/^\/sites\/novo/.test(s.href) && (s.texto.includes('alfa.teste') || s.contexto.includes('alfa.teste')));
  if (!alfa) throw new Error('site alfa.teste não encontrado em /sites: ' + JSON.stringify(sites.slice(0, 10)));
  const siteId = alfa.href.split('/')[2];
  console.error('clienteId:', clienteId, '| siteId(alfa.teste):', siteId, 'via', alfa.href);
  await ctx.close();

  const rotas = [
    '/visao-geral', '/clientes', '/sites', '/leads', '/otimizacoes', '/avisos', '/configuracoes',
    `/clientes/${clienteId}`, `/clientes/${clienteId}/relatorio`,
    `/sites/${siteId}/desempenho?periodo=30d`, `/sites/${siteId}/comportamento`, `/sites/${siteId}/qualidade`,
    `/sites/${siteId}/rastreamento`, `/sites/${siteId}/configurar`,
  ];

  const resultado = { geradoEm: new Date().toISOString(), base: BASE, clienteId, siteId, login: sqlLogin, rotas: [] };
  for (const rota of rotas) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) runs.push(await medirNavegacao(browser, cookies, rota, { bloquearPrefetch: true }));
    const comPrefetch = await medirNavegacao(browser, cookies, rota, { bloquearPrefetch: false });
    const med = (k) => mediana(runs.map((r) => r[k]));
    const medSql = (k) => mediana(runs.map((r) => r.sql[k]));
    // Corrida representativa para listas: a de tempo SQL mediano.
    const rep = [...runs].sort((a, b) => a.sql.msSql - b.sql.msSql)[Math.floor(RUNS / 2)];
    const item = {
      rota, titulo: rep.titulo, h1: rep.h1,
      mediana: {
        ttfbMs: +med('ttfb').toFixed(1), dclMs: +med('dcl').toFixed(1), loadMs: +med('load').toFixed(1), wallMs: med('wallMs'),
        requests: med('requests'), bytesTransferidos: med('bytesTransferidos'), bytesDecodificados: med('bytesDecodificados'),
        jsRequests: med('jsRequests'), jsBytesTransferidos: med('jsBytesTransferidos'), jsBytesDecodificados: med('jsBytesDecodificados'),
        htmlTransfer: med('encodedBodySize'), htmlDecoded: med('decodedBodySize'), fontesBytes: med('fontesBytes'), cssBytes: med('cssBytes'),
        sqlStatements: medSql('statements'), sqlMs: medSql('msSql'), sqlDistintas: medSql('distintas'), sqlTransacoes: medSql('transacoes'),
        consultasSessao: medSql('consultasSessao'), setConfigConta: medSql('setConfigConta'),
        prefetchesTentados: med('prefetchesTentados'),
      },
      porTipo: rep.porTipo,
      repetidas: rep.sql.repetidas, maisLentas: rep.sql.maisLentas,
      comPrefetch: { requests: comPrefetch.requests, bytesTransferidos: comPrefetch.bytesTransferidos, rscRequests: comPrefetch.rscRequests, sqlStatements: comPrefetch.sql.statements, sqlMs: comPrefetch.sql.msSql, wallMs: comPrefetch.wallMs },
      corridas: runs.map((r) => ({ ttfb: r.ttfb, dcl: r.dcl, load: r.load, requests: r.requests, bytes: r.bytesTransferidos, sqlStatements: r.sql.statements, sqlMs: r.sql.msSql })),
    };
    resultado.rotas.push(item);
    console.error(`${rota.padEnd(48)} ttfb=${item.mediana.ttfbMs}ms dcl=${item.mediana.dclMs}ms req=${item.mediana.requests} kb=${(item.mediana.bytesTransferidos / 1024).toFixed(0)} js=${(item.mediana.jsBytesTransferidos / 1024).toFixed(0)}kb sql=${item.mediana.sqlStatements} (${item.mediana.sqlMs}ms) rep=${item.repetidas.length} sess=${item.mediana.consultasSessao}`);
  }
  fs.writeFileSync(`${SAIDA}/navegacao.json`, JSON.stringify(resultado, null, 2));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
