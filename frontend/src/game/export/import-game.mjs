// Imports a new game from C++ into the browser game: the game's folder (games/game/alpha_family/plugins/<plugin>/src/Egt,
// its Math, Fsm, View, InfoView and TopperView modules) becomes alpha_family/plugins/<plugin>/<Module>/... of
// frontend/src/game, file by file. The libraries (alpha_family/libs, the engine) are ported once, by hand: only the
// game's folder is imported, and once imported its later C++ changes come in as any ported file's (import-cpp.mjs).
//
//   node frontend/src/game/export/import-game.mjs <games/game> <plugin> [--from <ported plugin>] [--copies] [--agent]
//                                                 [--json] [--model <model>] [--max <n>] [<ts path>...]
//
// Each C++ file (X.h with X.cpp, or X.data.h) is compared with the same file of a game ported already (--from, else the
// one with the most of the same files), its names changed to the new game's:
//   - copy: the same C++: the ported game's TypeScript is copied, with the game's names changed;
//   - diff: C++ that differs a little: the ported game's TypeScript is the start, and a Claude Code agent ports the
//     difference (the diff of the two C++), as import-cpp.mjs ports a ported file's change;
//   - port: no such file, or C++ that differs much: the agent ports the C++ (the other game's file is its reference).
// Without --copies or --agent it reports this plan. --copies makes the copies (no agent); --agent makes the copies and
// has the agent port the rest. Files go in the order of their includes, so that what a file uses is there before it.
// What is copied or ported is checked as import-cpp.mjs checks it: in a git worktree of the app's sources, the
// TypeScript type-checks, and a diff's translation is no farther from the new C++ than the copy's was. Only what passes
// is copied into the sources, and gets its PortManifest.json entry (port-manifest.mjs --only); a copy that does not
// type-check is the agent's to fix. The game's modules are then found by app/ModuleRegistry.ts: its workspace plays.
// --max limits the files the agent ports in one run; a run again goes on where the last one stopped. --json prints the
// report as JSON (the app's /api/game/import-game reads it).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ApplyChanges, Conflicts, Distance, GameFiles, gameSources, HasClaude, MakeTree, RemoveTree, repo, RunAgent, TreeChanges, TypeCheck,
} from './import-tree.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cppRoot = args[0] && resolve(args[0]);
const plugin = args[1];
const usage = 'usage: node import-game.mjs <games/game folder> <plugin> [--from <ported plugin>] [--copies] [--agent] [--json] [--model <model>] [--max <n>] [<ts path>...]';
if (!cppRoot || !existsSync(cppRoot) || !plugin || plugin.startsWith('--')) {
  console.error(usage);
  process.exit(1);
}
const valued = new Set(['--from', '--model', '--max']);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const asked = args.slice(2).filter((arg, i, list) => !arg.startsWith('--') && !valued.has(list[i - 1]));
const useAgent = args.includes('--agent');
const makeCopies = useAgent || args.includes('--copies');
const asJson = args.includes('--json');
const maxAgents = option('--max') ? Number(option('--max')) : Infinity;
const log = (...items) => (asJson ? console.error(...items) : console.log(...items));

const pluginSrc = `alpha_family/plugins/${plugin}/src/Egt`;
if (!/^[a-z0-9_]+$/.test(plugin) || !existsSync(join(cppRoot, pluginSrc))) {
  console.error(`${cppRoot}/${pluginSrc} does not exist`);
  process.exit(1);
}
const manifestPath = join(here, 'PortManifest.json');
const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'));
const git = (...gitArgs) => execFileSync('git', ['-C', cppRoot, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
const cppRepo = git('rev-parse', '--show-toplevel').trim();
const head = git('rev-parse', 'HEAD').trim();

function* walk(folder) {
  for (const name of readdirSync(folder).sort()) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

/** Writes a file, with its folder. */
function WriteFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A game's C++ name, from its modules: the folder of its state machine module without Fsm (NordicRushFsm). */
function GameNameOf(folder) {
  const fsm = existsSync(folder) ? readdirSync(folder).find(name => /Fsm$/.test(name) && statSync(join(folder, name)).isDirectory()) : null;
  return fsm ? fsm.replace(/Fsm$/, '') : null;
}

const gameName = GameNameOf(join(cppRoot, pluginSrc));
if (!gameName) {
  console.error(`${pluginSrc} has no <Game>Fsm module`);
  process.exit(1);
}

/** The game's files: X.h with X.cpp (or X.data.h alone), by X's path in src/Egt, and the TypeScript that ports them. */
function GameUnits() {
  const units = new Map();
  for (const file of walk(join(cppRoot, pluginSrc))) {
    if (!/\.(h|cpp)$/.test(file)) continue;
    const key = relative(join(cppRoot, pluginSrc), file).replaceAll('\\', '/').replace(/\.(h|cpp)$/, '');
    if (!units.has(key)) units.set(key, { key, ts: `alpha_family/plugins/${plugin}/${key}.ts`, cpp: [] });
    units.get(key).cpp.push(`${pluginSrc}/${relative(join(cppRoot, pluginSrc), file).replaceAll('\\', '/')}`);
  }
  for (const unit of units.values()) unit.cpp.sort((a, b) => Number(a.endsWith('.cpp')) - Number(b.endsWith('.cpp')));
  return units;
}

/** The units each unit includes (#include <Egt/Module/X.h> or "X.h" of the game's folder). */
function Includes(unit, units) {
  const found = new Set();
  for (const path of unit.cpp) {
    const text = readFileSync(join(cppRoot, path), 'utf8');
    for (const [, angle, quoted] of text.matchAll(/#include\s+(?:<Egt\/([^>]+)>|"([^"]+)")/g)) {
      const target = angle ?? posix.normalize(posix.join(posix.dirname(path.slice(pluginSrc.length + 1)), quoted));
      const key = target.replace(/\.(h|cpp)$/, '');
      if (key !== unit.key && units.has(key)) found.add(key);
    }
  }
  return found;
}

/** The units in the order of their includes: a unit after those it includes. */
function Ordered(units) {
  const order = [];
  const state = new Map();
  const visit = key => {
    if (state.get(key) === 'done' || state.get(key) === 'visiting') return;
    state.set(key, 'visiting');
    for (const dependency of units.get(key).includes) visit(dependency);
    state.set(key, 'done');
    order.push(units.get(key));
  };
  for (const key of [...units.keys()].sort()) visit(key);
  return order;
}

/** The ported game most like the new one: the most files of the same path (names changed); or --from's. */
function Template(units) {
  const ported = readdirSync(join(gameSources, 'alpha_family/plugins')).filter(name => name !== plugin);
  const candidates = ported.map(name => {
    const templateGame = GameNameOf(join(gameSources, 'alpha_family/plugins', name));
    if (!templateGame) return null;
    const matches = [...units.values()].filter(unit => existsSync(join(gameSources, TemplateTs(unit, { plugin: name, gameName: templateGame })))).length;
    return { plugin: name, gameName: templateGame, matches };
  }).filter(Boolean);
  if (option('--from')) return candidates.find(item => item.plugin === option('--from')) ?? null;
  return candidates.sort((a, b) => b.matches - a.matches)[0] ?? null;
}

function TemplateTs(unit, template) {
  return `alpha_family/plugins/${template.plugin}/${unit.key.replaceAll(gameName, template.gameName)}.ts`;
}

/** A text of the template game with the new game's names. */
function Renamed(text, template) {
  return text.replaceAll(template.gameName, gameName).replaceAll(template.plugin, plugin);
}

/** The template's C++ of a unit as its TypeScript ports it (its manifest entry's commit), with the new game's names. */
function TemplateCpp(templateTs, template) {
  const entry = manifest()[templateTs];
  if (!entry) return null;
  const commit = entry.cppCommit ?? head;
  const files = {};
  for (const path of entry.cpp) {
    try {
      const text = execFileSync('git', ['-C', cppRepo, 'show', `${commit}:${relative(cppRepo, join(cppRoot, path))}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
      files[Renamed(path, template)] = Renamed(text, template);
    } catch {
      // not in that commit: none
    }
  }
  return { commit, cpp: entry.cpp, files };
}

/** The diff from the template's C++ (renamed) to the new game's, and how many lines it changes. */
function CppDiff(unit, templateCpp) {
  const folder = mkdtempSync(join(tmpdir(), 'egt-import-game-'));
  try {
    let diff = '';
    let changed = 0;
    for (const path of unit.cpp) {
      const before = join(folder, 'before');
      writeFileSync(before, templateCpp.files[path] ?? '');
      const result = spawnSync('diff', ['-u', '--label', `a/${path}`, '--label', `b/${path}`, before, join(cppRoot, path)], { encoding: 'utf8', maxBuffer: 1 << 26 });
      diff += result.stdout;
      changed += result.stdout.split('\n').filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)).length;
    }
    return { diff, changed };
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const cppLines = unit => unit.cpp.reduce((sum, path) => sum + readFileSync(join(cppRoot, path), 'utf8').split('\n').length, 0);

/** How each unit is imported: done (ported already), copy, diff or port. */
function Plan() {
  const units = GameUnits();
  for (const unit of units.values()) unit.includes = Includes(unit, units);
  const template = Template(units);
  const ported = manifest();
  for (const unit of units.values()) {
    if (existsSync(join(gameSources, unit.ts))) {
      unit.mode = 'done';
      unit.inManifest = unit.ts in ported;
      continue;
    }
    const templateTs = template ? TemplateTs(unit, template) : null;
    const templateCpp = templateTs && existsSync(join(gameSources, templateTs)) ? TemplateCpp(templateTs, template) : null;
    if (!templateCpp) {
      unit.mode = 'port';
      continue;
    }
    const { diff, changed } = CppDiff(unit, templateCpp);
    unit.template = { ts: templateTs, cpp: templateCpp.cpp, commit: templateCpp.commit };
    unit.seed = Renamed(readFileSync(join(gameSources, templateTs), 'utf8'), template);
    unit.diff = diff;
    unit.changed = changed;
    // a file that differs in more than half its lines is ported from its C++, with the template as its reference
    unit.mode = changed === 0 ? 'copy' : changed <= cppLines(unit) * 0.5 ? 'diff' : 'port';
  }
  return { template, units: Ordered(units) };
}

const README = 'frontend/src/game/README.md';

function Prompt(unit, template, failed = null) {
  const tsPath = `frontend/src/game/${unit.ts}`;
  const cppPaths = unit.cpp.map(path => `${cppRoot}/${path}`).join(' and ');
  const cppBase = unit.cpp[0].replace(/\.(h|cpp)$/, '');
  const mirrors = `alpha_family/plugins/${plugin}/src/Egt/<Module>/<path>.h/.cpp is ported by frontend/src/game/alpha_family/plugins/${plugin}/<Module>/<path>.ts, alpha_family/libs/src/Egt/<Lib>/<path> by frontend/src/game/alpha_family/libs/<Lib>/<path>.ts`;
  let task;
  if (unit.mode === 'copy' || unit.mode === 'fix') {
    task = `${tsPath} is ${template.gameName}'s TypeScript of the same file (frontend/src/game/${unit.template.ts}), copied with the game's names
changed: its C++ is the same as ${gameName}'s, but the copy does not type-check in ${gameName}'s folder${failed ? `:\n\n${failed}\n` : '.'}
Make it type-check, changing as little as you can: what it uses of ${gameName}'s other files must be there (port them from their
C++ if they are not, see below).`;
  } else if (unit.mode === 'diff') {
    task = `${tsPath} is ${template.gameName}'s TypeScript of the same file (frontend/src/game/${unit.template.ts}), copied with the game's names
changed. It ports ${unit.template.cpp.join(' and ')} (at the games repository's commit ${unit.template.commit.slice(0, 9)}). ${gameName}'s C++
differs from that C++ by this diff (${template.gameName}'s names changed to ${gameName}'s):

\`\`\`diff
${unit.diff}\`\`\`

Port this difference into ${tsPath}, and only this: what the diff does not change stays as it is.`;
  } else {
    task = `${tsPath} does not exist yet: port ${cppPaths} into it, statement for statement.${unit.template ? `
For how such a file is written here, read ${template.gameName}'s TypeScript of the most similar file, frontend/src/game/${unit.template.ts}
(it ports ${unit.template.cpp.join(' and ')}): port ${gameName}'s C++, not it.` : ''} The files of ${gameName} ported so far are in
frontend/src/game/alpha_family/plugins/${plugin}/; ${template ? `${template.gameName}'s are in frontend/src/game/alpha_family/plugins/${template.plugin}/.` : ''}`;
    if (/Math\/MathRules$/.test(unit.key)) {
      task += `
This is the game's MathRules: port its CreateRules() as the C++ writes it (the round rules' configs filled from the math file's
structs, SimulatorConfig/*.data.h), not as a MathRulesDescription (frontend/src/game/authoring), which only games made in the browser use.`;
    }
  }
  return `You import the C++ game ${gameName} (${cppRoot}/${pluginSrc}) into the browser game's TypeScript (frontend/src/game), file
by file, in the order of their includes. The libraries it uses are ported already (frontend/src/game/alpha_family/libs, engine, hat_libs).

This file: ${cppPaths} -> ${tsPath}.

${task}

How: the TypeScript mirrors the C++ statement for statement, with its C++ names (read the sections "Structure" and "The
TypeScript to C++ translator" of ${README}: interfaces' tokens, Unless/AssertIf for the Defensive.h macros, the EgtA* log
macros, tweeny by its C++ names, blank lines and comments as in the C++). The C++ files are mirrored: ${mirrors}.
If the file needs other TypeScript of ${gameName} that does not exist yet (another of its views, a visual, a data struct), port
those C++ files too, to their mirrored paths. If it needs something of the libraries their TypeScript lacks (a bridge's method, an
event, a field), add it to the library's TypeScript as the C++ library has it. Never edit C++ files or files outside frontend/src/game,
and do not change ${template ? `${template.gameName}'s files or ` : ''}what the C++ does not need.

Then check your work:
- \`node frontend/src/game/export/translator/compare.mjs ${cppRoot} --ts ${unit.ts} --diff ${cppBase}\` shows how the translation
  of the TypeScript differs from the C++ (nothing for a file it does not translate: a data struct, an interface, a module);
- \`cd frontend && npx vue-tsc --noEmit\` must pass.

End with a short account: what you ported, and what of the C++ you could not port and why.`;
}

/** The TypeScript paths of changed files that port C++ (their manifest entries are refreshed). */
const PortingPaths = paths => paths.map(path => path.replace(/^frontend\/src\/game\//, '')).filter(path => /^(alpha_family|plugins)\/.*\.ts$/.test(path));

function RefreshManifest(tsPaths) {
  const paths = [...new Set(tsPaths)];
  if (paths.length) execFileSync('node', [join(here, 'port-manifest.mjs'), cppRoot, '--only', ...paths], { stdio: 'ignore' });
}

const { template, units } = Plan();
const selected = units.filter(unit => !asked.length || asked.includes(unit.ts));
const report = {
  head, plugin, gameName, template: template && { plugin: template.plugin, gameName: template.gameName },
  units: units.map(({ key, ts, cpp, mode, changed, template: from }) => ({ key, ts, cpp, mode, changed: changed ?? null, template: from?.ts ?? null })),
  copied: [], ported: [], failed: [], skipped: [],
};
const counts = mode => units.filter(unit => unit.mode === mode).length;
log(`${gameName} (${pluginSrc}): ${units.length} files; ${counts('done')} ported already, ${counts('copy')} to copy, ${counts('diff')} to port by diff, ${counts('port')} to port`);
log(template ? `from ${template.gameName} (alpha_family/plugins/${template.plugin})` : 'no ported game to start from');
if (!makeCopies && !asJson) {
  for (const unit of units) log(`  ${unit.mode.padEnd(4)} ${unit.ts}${unit.changed ? ` (${unit.changed} lines of C++ differ)` : ''}`);
}

const done = new Set(units.filter(unit => unit.mode === 'done').map(unit => unit.key));
const failedKeys = new Set();

/** Copies: the template's TypeScript renamed, checked together; the ones that do not type-check are the agent's to fix. */
function CopyBatch(batch) {
  if (!batch.length) return [];
  log(`\ncopying ${batch.length} files of ${template.gameName}...`);
  const files = GameFiles(repo);
  const tree = MakeTree(files);
  const escalated = [];
  try {
    let pending = [...batch];
    for (;;) {
      for (const unit of pending) WriteFile(join(tree, 'frontend/src/game', unit.ts), unit.seed);
      const check = TypeCheck(tree);
      if (check.ok) break;
      // the copies with errors, and the copies that include them, are left to the agent
      const bad = new Set(pending.filter(unit => check.files.has(unit.ts)).map(unit => unit.key));
      if (!bad.size) {
        // errors outside the copies: none of them can be checked
        for (const unit of pending) escalated.push({ unit, errors: check.errors });
        pending = [];
        break;
      }
      let grew = true;
      while (grew) {
        grew = false;
        for (const unit of pending) {
          if (!bad.has(unit.key) && [...unit.includes].some(key => bad.has(key))) {
            bad.add(unit.key);
            grew = true;
          }
        }
      }
      for (const unit of pending) {
        if (!bad.has(unit.key)) continue;
        escalated.push({ unit, errors: check.errors });
        rmSync(join(tree, 'frontend/src/game', unit.ts), { force: true });
      }
      pending = pending.filter(unit => !bad.has(unit.key));
      if (!pending.length) break;
    }
    const conflicts = Conflicts(pending.map(unit => `frontend/src/game/${unit.ts}`), files);
    for (const unit of pending) {
      if (conflicts.includes(`frontend/src/game/${unit.ts}`)) continue;
      WriteFile(join(gameSources, unit.ts), unit.seed);
      done.add(unit.key);
      report.copied.push({ ts: unit.ts, cpp: unit.cpp, template: unit.template.ts });
    }
    RefreshManifest(pending.map(unit => unit.ts));
    log(`  copied ${pending.length}${escalated.length ? `; ${escalated.length} do not type-check as copied` : ''}`);
  } finally {
    RemoveTree(tree);
  }
  return escalated;
}

/** Has the agent port a unit in a tree; what passes the checks goes into the sources. */
async function AgentPort(unit, failedCheck = null) {
  log(`\nporting ${unit.ts} (${unit.mode}) with Claude Code...`);
  const files = GameFiles(repo);
  const tree = MakeTree(files);
  try {
    const tsInTree = join(tree, 'frontend/src/game', unit.ts);
    if (unit.seed && unit.mode !== 'port') WriteFile(tsInTree, unit.seed);
    const before = unit.mode === 'diff' ? await Distance(tree, cppRoot, unit.ts).catch(() => null) : null;
    const agent = RunAgent(tree, Prompt(unit, template, failedCheck), option('--model'));
    const check = TypeCheck(tree);
    const after = existsSync(tsInTree) ? await Distance(tree, cppRoot, unit.ts).catch(() => null) : null;
    // the seed is the agent's start: what changed is against the sources
    const changes = TreeChanges(tree, files);
    const closer = before === null || (after !== null && after <= before);
    const result = { ts: unit.ts, cpp: unit.cpp, mode: unit.mode, before, after, typeCheck: check.ok, files: [...changes.changed, ...changes.removed], account: agent.account, cost: agent.cost };
    const conflicts = Conflicts(result.files, files);
    const exists = existsSync(tsInTree);
    if (agent.ok && check.ok && exists && closer && !conflicts.length) {
      ApplyChanges(changes);
      RefreshManifest([unit.ts, ...PortingPaths(changes.changed)]);
      for (const other of units) if (existsSync(join(gameSources, other.ts))) done.add(other.key);
      report.ported.push(result);
      log(`  ported (${after ?? '-'} lines from the C++${before !== null ? `, ${before} as copied` : ''}): ${result.files.join(', ')}`);
    } else {
      result.reason = !agent.ok ? 'the agent failed' : !check.ok ? `the TypeScript does not type-check:\n${check.errors}`
        : !exists ? `the agent did not write ${unit.ts}` : !closer ? 'its translation is farther from the C++ than the copy\'s'
          : `these files changed in the sources meanwhile: ${conflicts.join(', ')}`;
      failedKeys.add(unit.key);
      report.failed.push(result);
      log(`  not ported (the sources are as they were): ${result.reason}`);
    }
    log(`  ${agent.account.split('\n').join('\n  ')}`);
  } finally {
    RemoveTree(tree);
  }
}

if (makeCopies) {
  if (useAgent && !HasClaude()) {
    console.error('Claude Code (the claude command) is not installed');
    process.exit(1);
  }
  let agentRuns = 0;
  let batch = [];
  const queue = [];
  const flush = () => {
    for (const { unit, errors } of CopyBatch(batch)) {
      unit.mode = 'fix';
      queue.push({ unit, errors });
    }
    batch = [];
  };
  const runQueued = async () => {
    while (queue.length) {
      const { unit, errors } = queue.shift();
      if (done.has(unit.key)) continue;
      if (!useAgent || agentRuns >= maxAgents) {
        report.skipped.push({ ts: unit.ts, mode: unit.mode, reason: useAgent ? `--max ${maxAgents} reached` : 'no --agent' });
        continue;
      }
      agentRuns++;
      await AgentPort(unit, errors);
    }
  };
  for (const unit of selected) {
    if (done.has(unit.key)) continue;
    const ready = [...unit.includes].every(key => done.has(key) || batch.some(item => item.key === key));
    if (unit.mode === 'copy' && ready) {
      batch.push(unit);
      continue;
    }
    if (!useAgent) {
      report.skipped.push({ ts: unit.ts, mode: unit.mode, reason: 'no --agent' });
      continue;
    }
    flush();
    await runQueued();
    if (done.has(unit.key)) continue;
    if (unit.mode === 'copy') {
      // what it includes is not there: the agent's (it may port those too)
      unit.mode = 'fix';
    }
    queue.push({ unit, errors: null });
    await runQueued();
  }
  flush();
  await runQueued();
  const left = units.filter(unit => !existsSync(join(gameSources, unit.ts)));
  log(`\n${report.copied.length} copied, ${report.ported.length} ported by the agent, ${report.failed.length} failed, ${report.skipped.length} skipped; ${left.length} of ${units.length} files left to import`);
  report.left = left.map(unit => unit.ts);
}

if (asJson) process.stdout.write(`${JSON.stringify(report)}\n`);
