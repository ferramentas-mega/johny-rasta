// Junta navegacao.json (Playwright + log do Postgres) com as medições feitas
// por curl e escreve baseline-antes.json e baseline-antes.md.
import fs from 'node:fs';
const DIR = process.env.SAIDA_MEDICAO ?? new URL('.', import.meta.url).pathname;
const nav = JSON.parse(fs.readFileSync(`${DIR}/navegacao.json`, 'utf8'));

// Medido com curl contra http://localhost:3123 (next start, build de produção).
const estaticos = {
  '/t.js': { status: 200, bytesSemCompressao: 12865, bytesGzip: 4689, cacheControl: 'public, max-age=300, must-revalidate', etag: 'W/"3241-1a0a60cd7b2"', contentEncodingComAcceptGzip: 'gzip', origemDoCacheControl: 'next.config.ts:41 (headers() para source /t.js)' },
  '/f.js': { status: 200, bytesSemCompressao: 13710, bytesGzip: 4967, cacheControl: 'public, max-age=0', etag: 'W/"358e-1a0a7706c9c"', contentEncodingComAcceptGzip: 'gzip', origemDoCacheControl: 'padrão do Next para /public (sem regra em next.config.ts)' },
  '/sw.js': { status: 200, bytesSemCompressao: 1657, bytesGzip: 811, cacheControl: 'public, max-age=0', etag: 'W/"679-1a0b6d358a4"', contentEncodingComAcceptGzip: 'gzip', origemDoCacheControl: 'padrão do Next para /public' },
  '/entrar': { status: 200, bytesHtmlSemCompressao: 19099, bytesHtmlGzip: 7055, cacheControl: 'private, no-cache, no-store, max-age=0, must-revalidate', ttfbCurlSegundos: 0.016 },
};
const diagnostico = {
  rota: 'GET /api/diagnostico (sem cookie, sem token)', status: 200, ttfbCurlSegundos: 0.073, bytes: 340,
  camposExpostos: ['tudoOk', 'esquema.{verificado,completo,faltando[]}', 'commit (sha do build)', 'deployment', 'ambiente', 'painelFunciona', 'coletaFunciona', 'problemas[] (variavel, essencial, causa, oQueFazer)', 'faltaSessionSecret', 'observacao'],
  naoExpoe: ['host/usuário/senha do banco', 'nomes das variáveis de ambiente (só com sessão ou ?token=)', 'conexoes detalhadas'],
  observacao: 'Cada chamada anônima abre conexão nos 3 pools (verificarConexao para DATABASE_URL, _INGEST, _FORMS) e roda verificarEsquema — custo de banco pago por qualquer visitante sem limite de taxa visível na rota (src/app/api/diagnostico/route.ts:86-100).',
};
const coleta = {
  rota: 'POST /api/collect (page_view válido, site sit_teste_alfa01, Origin https://alfa.teste)', status: 204,
  latenciaHttpSegundos: [0.0189, 0.0162, 0.0167], latenciaMedianaMs: 16.7,
  statementsSql: 9, linhasDeLogSql: 23, somaMsSqlPorEvento: [2.752, 2.946, 3.247], somaMsSqlMediana: 2.946,
  statements: ['begin', 'select … from sites where public_id = $1 (resolverSite)', "select set_config('app.site_id', $1, true)", 'select app.consumir_limite($1, $2) (escrita: limite por site)', 'insert into pages … on conflict do nothing + select (página)', 'select id from sessions … (sessão aberta?)', 'insert into sessions …', 'insert into events …', 'commit'],
  observacao: 'talvezLimpar (src/server/limites.ts:132) roda com probabilidade 1% e não apareceu nas 3 amostras. Transação única: 9 idas ao banco por evento.',
};

const rotas = nav.rotas.map((r) => ({
  rota: r.rota, h1: r.h1,
  ttfbMs: r.mediana.ttfbMs, dclMs: r.mediana.dclMs, loadMs: r.mediana.loadMs,
  requests: r.mediana.requests, prefetchesBloqueados: r.mediana.prefetchesTentados,
  kbFio: +(r.mediana.bytesTransferidos / 1024).toFixed(1), kbDecodificado: +(r.mediana.bytesDecodificados / 1024).toFixed(1),
  kbJsFio: +(r.mediana.jsBytesTransferidos / 1024).toFixed(1), kbJsDecodificado: +(r.mediana.jsBytesDecodificados / 1024).toFixed(1), jsRequests: r.mediana.jsRequests,
  kbHtmlFio: +(r.mediana.htmlTransfer / 1024).toFixed(1), kbHtmlDecodificado: +(r.mediana.htmlDecoded / 1024).toFixed(1),
  kbFontes: +(r.mediana.fontesBytes / 1024).toFixed(1), kbCss: +(r.mediana.cssBytes / 1024).toFixed(1),
  sqlStatements: r.mediana.sqlStatements, sqlMs: r.mediana.sqlMs, sqlDistintas: r.mediana.sqlDistintas, sqlTransacoes: r.mediana.sqlTransacoes,
  sqlOverheadTransacao: r.mediana.sqlTransacoes * 2 + r.mediana.setConfigConta,
  consultasSessao: r.mediana.consultasSessao,
  repetidas: r.repetidas, maisLentas: r.maisLentas,
  comPrefetch: r.comPrefetch, corridas: r.corridas, porTipo: r.porTipo,
}));

const saida = {
  geradoEm: nav.geradoEm, ambiente: 'next start (build de produção) em localhost:3123 contra Postgres 16 local (painel_matrix_test, massa de scripts/test-db.ts); Chromium headless via Playwright; contexto novo (cache frio) a cada corrida; prefetches do <Link> bloqueados nas corridas medidas (não geram SQL — confirmado pela corrida comPrefetch) e contados à parte',
  metodo: { ttfb: 'PerformanceNavigationTiming.responseStart', dcl: 'domContentLoadedEventEnd', load: 'loadEventEnd', bytes: 'encodedBodySize (fio) e decodedBodySize somados de navigation + resource entries', sql: 'log_min_duration_statement=0 no Postgres local, fatiado por offset do arquivo antes/depois de cada page.goto; statement = linhas execute/statement (parse/bind entram só no tempo)', mediana: '3 corridas por rota; listas (repetidas/lentas) da corrida com tempo SQL mediano' },
  naoMedido: ['produção (app.johnyweb.com) — inalcançável deste sandbox', 'latência de rede até o Supabase (us-east-1) — o custo real de cada statement em produção é RTT × statements, e o RTT não foi medido', 'compressão do proxy da Hostinger (aqui é o gzip do next start)'],
  ids: { clienteId: nav.clienteId, siteId: nav.siteId },
  loginMaisVisaoGeral: nav.login,
  rotas, estaticos, diagnostico, coleta,
};
fs.writeFileSync(`${DIR}/baseline-antes.json`, JSON.stringify(saida, null, 2));

const md = [];
md.push('# Baseline ANTES — medido em ' + nav.geradoEm);
md.push('');
md.push('Ambiente: ' + saida.ambiente + '.');
md.push('');
md.push('Não medido: ' + saida.naoMedido.join('; ') + '.');
md.push('');
md.push('## Rotas (mediana de 3 corridas, cache frio)');
md.push('');
md.push('| rota | TTFB ms | DCL ms | load ms | requests | KB fio | KB JS fio (decod.) | KB fontes | KB HTML fio | nº SQL | ms SQL | distintas | transações | repetidas | sessão |');
md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rotas) {
  const rep = r.repetidas.filter((q) => !/^(begin|commit|select set_config)/.test(q.sql)).length;
  md.push(`| ${r.rota.replace(nav.clienteId, '<cliente>').replace(nav.siteId, '<alfa>')} | ${r.ttfbMs} | ${r.dclMs} | ${r.loadMs} | ${r.requests} (+${r.prefetchesBloqueados} prefetch) | ${r.kbFio} | ${r.kbJsFio} (${r.kbJsDecodificado}) | ${r.kbFontes} | ${r.kbHtmlFio} | ${r.sqlStatements} | ${r.sqlMs} | ${r.sqlDistintas} | ${r.sqlTransacoes} | ${rep} | ${r.consultasSessao} |`);
}
md.push('');
md.push('"repetidas" = textos SQL normalizados executados mais de uma vez na MESMA navegação, excluindo begin/commit/set_config (que se repetem por transação: cada `withAccount` custa 3 statements). "sessão" = statements que tocam `app.find_user_for_session`.');
md.push('');
md.push('## Consultas repetidas e mais lentas por rota');
for (const r of rotas) {
  md.push('');
  md.push(`### ${r.rota}`);
  md.push(`- transações: ${r.sqlTransacoes}; overhead de transação (begin+commit+set_config): ${r.sqlOverheadTransacao} de ${r.sqlStatements} statements`);
  md.push('- repetidas:');
  for (const q of r.repetidas) md.push(`  - ×${q.vezes} (${q.ms} ms) \`${q.sql.slice(0, 120)}\``);
  md.push('- 5 mais lentas:');
  for (const q of r.maisLentas) md.push(`  - ${q.ms} ms \`${q.sql.slice(0, 120)}\``);
  md.push(`- com prefetch liberado: ${r.comPrefetch.requests} requests, ${r.comPrefetch.rscRequests} RSC, SQL ${r.comPrefetch.sqlStatements} statements (${r.comPrefetch.sqlMs} ms)`);
}
md.push('');
md.push('## Login (POST /entrar → /visao-geral)');
md.push(`- ${nav.login.statements} statements, ${nav.login.msSql} ms, ${nav.login.transacoes} transações, ${nav.login.consultasSessao} consultas de sessão/usuário`);
md.push('');
md.push('## Estáticos e endpoints (curl)');
md.push('');
md.push('| recurso | status | bytes | gzip | Cache-Control | ETag |');
md.push('|---|---:|---:|---:|---|---|');
for (const [k, v] of Object.entries(estaticos)) md.push(`| ${k} | ${v.status} | ${v.bytesSemCompressao ?? v.bytesHtmlSemCompressao} | ${v.bytesGzip ?? v.bytesHtmlGzip} | \`${v.cacheControl}\` | ${v.etag ?? '—'} |`);
md.push('');
md.push(`- ${diagnostico.rota}: HTTP ${diagnostico.status}, ${diagnostico.bytes} bytes, TTFB ${diagnostico.ttfbCurlSegundos}s. Expõe: ${diagnostico.camposExpostos.join(', ')}. ${diagnostico.observacao}`);
md.push(`- ${coleta.rota}: HTTP ${coleta.status}, latência mediana ${coleta.latenciaMedianaMs} ms, ${coleta.statementsSql} statements SQL numa transação (${coleta.somaMsSqlMediana} ms de banco). ${coleta.observacao}`);
fs.writeFileSync(`${DIR}/baseline-antes.md`, md.join('\n') + '\n');
console.log('ok', rotas.length, 'rotas');
