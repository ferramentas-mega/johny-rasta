// Hook PostToolUse (Edit|Write): confere o arquivo recém-editado com as
// ferramentas RÁPIDAS do projeto, e só elas.
//
//   - `.tsx`/`.ts`/`.css` em src/  → `npm run design` (menos de 1 s; é o
//     verificador que pega cor crua, tamanho fora da escala e cópia obrigatória
//     desatualizada — exatamente os defeitos que passam despercebidos numa
//     edição pequena).
//   - `.ts`/`.tsx`/`.mjs`           → eslint só nesse arquivo.
//
// NÃO roda typecheck nem build: são caros demais para cada edição e ficam para
// o checkpoint (`npm run typecheck`, `npm run build`), como sempre.
//
// Saída no stdout é mostrada ao Claude como contexto; o hook nunca bloqueia
// (a edição já aconteceu) e nunca altera arquivo.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let chamada;
try {
  chamada = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const arquivo = String(chamada?.tool_input?.file_path ?? '');
if (!arquivo) process.exit(0);

const relativo = arquivo.replace(`${process.cwd()}/`, '');
const saidas = [];

if (/^src\/.*\.(tsx?|css)$/.test(relativo)) {
  const r = spawnSync('npm', ['run', '-s', 'design'], { encoding: 'utf8' });
  if (r.status !== 0) saidas.push(`[design] reprovou após editar ${relativo}:\n${r.stdout}${r.stderr}`);
}

if (/\.(tsx?|mjs)$/.test(relativo) && !/^node_modules\//.test(relativo)) {
  const r = spawnSync('npx', ['eslint', '--no-warn-ignored', relativo], { encoding: 'utf8' });
  if (r.status !== 0) saidas.push(`[eslint] ${relativo}:\n${r.stdout}${r.stderr}`);
}

if (saidas.length) process.stdout.write(saidas.join('\n'));
process.exit(0);
