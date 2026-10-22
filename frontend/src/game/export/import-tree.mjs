// What the imports from C++ share (import-cpp.mjs: a ported file's C++ changes; import-game.mjs: a new game): a git
// worktree of the app's sources with the browser game as it is now, where a Claude Code agent works away from the
// sources, and the deterministic checks of what it did (the type check, the translation's distance from the C++).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const gameSources = resolve(here, '..');
export const frontend = resolve(gameSources, '../..');
export const repo = resolve(frontend, '..');

export const runGit = (...gitArgs) => execFileSync('git', ['-C', repo, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 26 });

/** How many lines a ported file's translation differs from its C++ (null: it is not translated), by the translator of
 * a tree of the app's sources. */
export async function Distance(tree, cppRoot, ts) {
  const { TranslateFiles } = await import(pathToFileURL(join(tree, 'frontend/src/game/export/translator/translate.mjs')).href);
  const { files } = TranslateFiles(cppRoot, [ts]);
  if (!Object.keys(files).length) return null;
  const folder = mkdtempSync(join(tmpdir(), 'egt-import-'));
  try {
    let changed = 0;
    for (const [path, text] of Object.entries(files)) {
      const translated = join(folder, path.replaceAll('/', '_'));
      writeFileSync(translated, text);
      const result = spawnSync('diff', ['-u', join(cppRoot, path), translated], { encoding: 'utf8', maxBuffer: 1 << 26 });
      changed += result.stdout.split('\n').filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)).length;
    }
    return changed;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Whether a tree's browser game type-checks, its first errors, and the files they are in (relative to frontend/src/game). */
export function TypeCheck(tree) {
  const result = spawnSync('npx', ['vue-tsc', '--noEmit'], { cwd: join(tree, 'frontend'), encoding: 'utf8', maxBuffer: 1 << 26 });
  const output = `${result.stdout}${result.stderr}`.trim();
  const files = new Set([...output.matchAll(/^src\/game\/([^(\s]+\.(?:ts|vue))\(/gm)].map(match => match[1]));
  return { ok: result.status === 0, errors: output.split('\n').slice(0, 20).join('\n'), files };
}

/** Has a Claude Code agent do what a prompt asks in a tree of the app's sources (it may only edit frontend/src/game,
 * and run the type check and the translator's comparison); returns its account. */
export function RunAgent(tree, prompt, model = null) {
  const allowed = ['Read', 'Grep', 'Glob', 'Edit(frontend/src/game/**)', 'Write(frontend/src/game/**)',
    'Bash(node frontend/src/game/export/translator/compare.mjs:*)', 'Bash(cd frontend && npx vue-tsc:*)', 'Bash(npx vue-tsc:*)'];
  const command = ['-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', allowed.join(' ')];
  if (model) command.push('--model', model);
  const result = spawnSync('claude', command, { cwd: tree, input: prompt, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 45 * 60 * 1000 });
  if (result.error) return { ok: false, account: `Claude Code did not run: ${result.error.message}` };
  try {
    const reply = JSON.parse(result.stdout);
    return { ok: !reply.is_error, account: reply.result ?? '', cost: reply.total_cost_usd ?? null };
  } catch {
    return { ok: false, account: `${result.stdout}${result.stderr}`.trim().slice(-2000) };
  }
}

/** Whether Claude Code (the claude command) is installed. */
export function HasClaude() {
  return spawnSync('claude', ['--version']).status === 0;
}

/** The browser game's files as they are now in the app's sources (committed or not), by their paths in the repository. */
export function GameFiles(tree) {
  const listed = execFileSync('git', ['-C', tree, 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'frontend/src/game'], { encoding: 'utf8' });
  return new Map(listed.split('\n').filter(Boolean).filter(path => existsSync(join(tree, path))).map(path => [path, readFileSync(join(tree, path), 'utf8')]));
}

/** A worktree of the app's sources with the browser game as it is now: where the agent works, away from the sources. */
export function MakeTree(files) {
  const tree = mkdtempSync(join(tmpdir(), 'egt-import-tree-'));
  rmSync(tree, { recursive: true, force: true });
  runGit('worktree', 'add', '--detach', '--quiet', tree, 'HEAD');
  for (const path of runGit('ls-files', '--', 'frontend/src/game').split('\n').filter(Boolean)) if (!files.has(path)) rmSync(join(tree, path), { force: true });
  for (const [path, text] of files) {
    mkdirSync(dirname(join(tree, path)), { recursive: true });
    writeFileSync(join(tree, path), text);
  }
  symlinkSync(join(frontend, 'node_modules'), join(tree, 'frontend/node_modules'));
  return tree;
}

export function RemoveTree(tree) {
  try {
    runGit('worktree', 'remove', '--force', tree);
  } catch {
    rmSync(tree, { recursive: true, force: true });
    runGit('worktree', 'prune');
  }
}

/** What the agent changed in a tree, of the game's files as they were (`files`): the changed and the removed paths. */
export function TreeChanges(tree, files) {
  const now = GameFiles(tree);
  const changed = [...now].filter(([path, text]) => files.get(path) !== text).map(([path]) => path);
  const removed = [...files.keys()].filter(path => !now.has(path));
  return { now, changed, removed };
}

/** The changed files of a tree that changed in the sources too while the agent worked (they are not overwritten). */
export function Conflicts(paths, files) {
  return paths.filter(path => (existsSync(join(repo, path)) ? readFileSync(join(repo, path), 'utf8') : undefined) !== files.get(path));
}

/** Copies a tree's changes into the sources. */
export function ApplyChanges({ now, changed, removed }) {
  for (const path of changed) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), now.get(path));
  }
  for (const path of removed) rmSync(join(repo, path), { force: true });
}
