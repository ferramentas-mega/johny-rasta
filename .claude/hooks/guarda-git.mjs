// Hook PreToolUse (Bash): barra os comandos git que este projeto já pagou para
// aprender a evitar. Lê a chamada em JSON pelo stdin; sair com código 2 bloqueia
// a execução e devolve o motivo (stderr) ao Claude. Qualquer outra saída deixa
// passar — o hook nunca decide por conta própria o que rodar no lugar.
//
// O que bloqueia, e por quê (ver CLAUDE.md, "Armadilhas já encontradas"):
//   - `git checkout <arquivo>` / `git checkout -- …` / `git restore …`
//       descartam trabalho não comitado, sem aviso e sem lixeira. A regra do
//       projeto é restaurar da cópia feita com `cp`.
//   - `git push --force` / `-f` / `--force-with-lease`
//       reescrevem histórico remoto; a convenção é merge, nunca force.
//   - `git reset --hard`, `git clean -f`
//       apagam trabalho local em massa.
//
// Não bloqueia `git checkout -b`, `git checkout <branch>` (troca de branch
// sem caminho) nem `git switch`: a intenção ali é outra.
import { readFileSync } from 'node:fs';

let entrada = '';
try {
  entrada = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let chamada;
try {
  chamada = JSON.parse(entrada);
} catch {
  process.exit(0);
}

// Texto entre aspas sai antes da conferência: uma mensagem de commit que CITA
// `git checkout <arquivo>` não é um `git checkout`. Sem isto o hook barrou o
// próprio commit que o documentava.
const comando = String(chamada?.tool_input?.command ?? '')
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''");
if (!comando.includes('git')) process.exit(0);

const REGRAS = [
  {
    // `git checkout` seguido de `--` ou de algo que parece caminho (tem `/`
    // ou extensão), sem `-b`/`-B`.
    padrao: /\bgit\s+checkout\s+(?!-[bB]\b)(?:[^|;&]*\s)?(--\s|\S*[/.]\S*)/,
    motivo:
      '`git checkout <arquivo>` descarta o trabalho não comitado daquele arquivo. ' +
      'Restaure da cópia feita com `cp` (ver CLAUDE.md), ou confirme com o usuário.',
  },
  {
    padrao: /\bgit\s+restore\b/,
    motivo: '`git restore` descarta trabalho não comitado. Restaure da cópia feita com `cp`, ou confirme com o usuário.',
  },
  {
    padrao: /\bgit\s+push\b[^|;&]*(\s--force(-with-lease)?\b|\s-f\b)/,
    motivo: 'Push forçado reescreve o histórico remoto. A convenção aqui é merge; confirme com o usuário antes.',
  },
  {
    padrao: /\bgit\s+reset\s+--hard\b/,
    motivo: '`git reset --hard` apaga trabalho local. Confirme com o usuário antes.',
  },
  {
    padrao: /\bgit\s+clean\b[^|;&]*\s-[a-zA-Z]*[fdxX]/,
    motivo: '`git clean` apaga arquivos não rastreados. Confirme com o usuário antes.',
  },
];

for (const regra of REGRAS) {
  if (regra.padrao.test(comando)) {
    process.stderr.write(`[guarda-git] Bloqueado: ${regra.motivo}\n`);
    process.exit(2);
  }
}
process.exit(0);
