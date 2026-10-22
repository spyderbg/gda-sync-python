// Imports the C++ game sources' changes into the browser game's TypeScript, the export's opposite direction: a ported
// file (PortManifest.json) whose C++ changed since it was ported (cppCommit, cppSha256) has TypeScript to update.
//
//   node frontend/src/game/export/import-cpp.mjs <games/game> [--agent] [--json] [--model <model>] [<ts path>...]
//
// lists each changed file's C++ changes (the commits and the diff since it was ported); with ts paths (relative to
// frontend/src/game), those only. --agent has a Claude Code agent (`claude -p`, which may only edit frontend/src/game
// and run the type check and the translator's comparison) port each change into the TypeScript, statement for statement
// as frontend/src/game/README.md says; the import then checks what it did, deterministically: the TypeScript
// type-checks, and its translation is no farther from the new C++ than before (export/translator/compare.mjs counts the
// lines). The agent works in a git worktree of the app's sources, with the browser game as it is now; what passes is
// copied into the sources (unless a file changed there meanwhile), and its manifest entry now ports the new C++
// (port-manifest.mjs --only). What fails changes nothing, and is reported with the agent's account. --json prints the report as JSON (the app's
// /api/game/import reads it).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApplyChanges, Conflicts, Distance, GameFiles, HasClaude, MakeTree, RemoveTree, repo, RunAgent, TreeChanges, TypeCheck } from './import-tree.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cppRoot = args[0] && resolve(args[0]);
if (!cppRoot || !existsSync(cppRoot)) {
  console.error('usage: node import-cpp.mjs <games/game folder> [--agent] [--json] [--model <model>] [<ts path>...]');
  process.exit(1);
}
const valued = new Set(['--model']);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const asked = args.slice(1).filter((arg, i, list) => !arg.startsWith('--') && !valued.has(list[i - 1]));
const useAgent = args.includes('--agent');
const asJson = args.includes('--json');
const log = (...items) => (asJson ? console.error(...items) : console.log(...items));

const manifestPath = join(here, 'PortManifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const git = (...gitArgs) => execFileSync('git', ['-C', cppRoot, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
const repoRoot = git('rev-parse', '--show-toplevel').trim();
const gitRepo = (...gitArgs) => execFileSync('git', ['-C', repoRoot, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
const head = git('rev-parse', 'HEAD').trim();
const inRepo = path => relative(repoRoot, join(cppRoot, path));
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** The ported files whose C++ changed since they were ported, with the commits and the diff. */
function ChangedFiles() {
  const changed = [];
  for (const [ts, entry] of Object.entries(manifest)) {
    if (asked.length && !asked.includes(ts)) continue;
    if (!entry.cppCommit) continue;
    const files = entry.cpp.filter(path => {
      const current = existsSync(join(cppRoot, path)) ? sha256(readFileSync(join(cppRoot, path))) : null;
      return current !== (entry.cppSha256?.[path] ?? null);
    });
    if (!files.length) continue;
    const paths = files.map(inRepo);
    const commits = gitRepo('log', '--format=%h %ad %s', '--date=short', `${entry.cppCommit}..HEAD`, '--', ...paths).trim().split('\n').filter(Boolean);
    const diff = gitRepo('diff', '--no-color', entry.cppCommit, '--', ...paths);
    changed.push({ ts, cpp: files, from: entry.cppCommit, commits, diff, uncommitted: !!gitRepo('status', '--porcelain', '--', ...paths).trim() });
  }
  return changed;
}

function Prompt(change) {
  const tsPath = `frontend/src/game/${change.ts}`;
  return `You keep the browser game's TypeScript port in step with the C++ game it ports (the C++ is the reference).

The C++ of ${change.cpp.map(path => `${cppRoot}/${path}`).join(' and ')} changed since ${tsPath} was ported from it${change.commits.length ? `, in these commits:\n${change.commits.map(line => `  ${line}`).join('\n')}` : ' (in the working tree, not committed)'}.

The change, as a diff from the C++ the TypeScript ports to the C++ now:

\`\`\`diff
${change.diff}\`\`\`

Port this change into ${tsPath}, and only this change: the TypeScript mirrors the C++ statement for statement (read the
section "The TypeScript to C++ translator" of frontend/src/game/README.md for how: Unless/AssertIf for the Defensive.h
macros, the EgtA* log macros, blank lines and comments as in the C++, C++ names). If the change needs other TypeScript of
the browser game (a new field of a data struct, an interface method, an event), port that too, in the files that port
those C++ files. Do not change what the C++ did not change. Never edit C++ files or files outside frontend/src/game.

Then check your work:
- \`node frontend/src/game/export/translator/compare.mjs ${cppRoot} --diff ${change.cpp[0]}\` shows how the translation of the
  TypeScript differs from the C++ (it prints nothing for a file it does not translate: a data struct, an interface, a
  base class): the lines the change added or changed should not be among the differences (others may be, from before);
- \`cd frontend && npx vue-tsc --noEmit\` must pass.

End with a short account: what you changed, and what of the C++ change you could not port and why. If the TypeScript
already ports the change (it was ported before the C++ was committed, say), change nothing and begin your account with
"ALREADY PORTED", then say where the TypeScript has it.`;
}

const changes = ChangedFiles();
const report = { head, changed: changes.map(({ ts, cpp, from, commits, uncommitted, diff }) => ({ ts, cpp, from, commits, uncommitted, diffLines: diff.split('\n').length })), ported: [], upToDate: [], failed: [] };
if (!asJson) {
  log(changes.length ? `${changes.length} ported files have C++ changes since they were ported:` : 'The TypeScript ports the C++ as it is now: nothing to import.');
  for (const change of changes) {
    log(`\n${change.ts} (${change.cpp.join(', ')}), since ${change.from.slice(0, 9)}${change.uncommitted ? ', and uncommitted changes' : ''}`);
    for (const commit of change.commits) log(`  ${commit}`);
  }
}

if (useAgent) {
  if (!HasClaude()) {
    console.error('Claude Code (the claude command) is not installed');
    process.exit(1);
  }
  for (const change of changes) {
    log(`\nporting ${change.ts} with Claude Code...`);
    // the agent works on a copy of the browser game, which is checked there: the sources change only by what passes
    const files = GameFiles(repo);
    const tree = MakeTree(files);
    try {
      const before = await Distance(tree, cppRoot, change.ts);
      const agent = RunAgent(tree, Prompt(change), option('--model'));
      const check = TypeCheck(tree);
      const after = await Distance(tree, cppRoot, change.ts).catch(() => null);
      const treeChanges = TreeChanges(tree, files);
      const { changed: changedFiles, removed: removedFiles } = treeChanges;
      const closer = before === null || (after !== null && after <= before);
      const result = { ts: change.ts, cpp: change.cpp, before, after, typeCheck: check.ok, files: [...changedFiles, ...removedFiles], account: agent.account, cost: agent.cost };
      // a file changed in the sources while the agent worked is not overwritten
      const conflicts = Conflicts(result.files, files);
      if (agent.ok && check.ok && closer && result.files.length && !conflicts.length) {
        ApplyChanges(treeChanges);
        // ported: the files the agent changed that port C++ now port the C++ as it is
        const ported = changedFiles.map(path => path.replace(/^frontend\/src\/game\//, '')).filter(path => path in manifest);
        execFileSync('node', [join(here, 'port-manifest.mjs'), cppRoot, '--only', ...new Set([change.ts, ...ported])], { stdio: 'ignore' });
        report.ported.push(result);
        log(`  ported (${after ?? '-'} lines from the C++, ${before ?? '-'} before): ${result.files.join(', ')}`);
      } else if (agent.ok && check.ok && !result.files.length && /^\W*ALREADY PORTED/i.test(agent.account)) {
        // the TypeScript ports the change already, as the agent found: it ports the C++ as it is now
        execFileSync('node', [join(here, 'port-manifest.mjs'), cppRoot, '--only', change.ts], { stdio: 'ignore' });
        report.upToDate.push(result);
        log('  up to date: the TypeScript ports the change already');
      } else {
        result.reason = !agent.ok ? 'the agent failed' : !check.ok ? `the TypeScript does not type-check:\n${check.errors}`
          : !closer ? 'its translation is farther from the C++ than before' : !result.files.length ? 'the agent changed nothing'
            : `these files changed in the sources meanwhile: ${conflicts.join(', ')}`;
        report.failed.push(result);
        log(`  not ported (the sources are as they were): ${result.reason}`);
      }
      log(`  ${agent.account.split('\n').join('\n  ')}`);
    } finally {
      RemoveTree(tree);
    }
  }
}

if (asJson) process.stdout.write(`${JSON.stringify(report)}\n`);
