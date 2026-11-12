// Syncs the modules configs of the browser game's games from the games repository into the browser game's sources:
// configs/<plugin>/modules/* (a game's <Name>Modules.json, its variants and its integrations' module managers) and the
// configs they include from other folders, such as the family's configs/alpha_family/modules/*, are copied to
// frontend/src/game/configs, by the same paths. With them the app's sources have what a game needs of the games
// repository's configs folder to start (its modules and their config: docs/independent_game.md), without the C++ project.
//
//   node frontend/src/game/export/sync-configs.mjs <games repository> [--check] [--force] [--json] [<plugin>...]
//
// syncs the configs of the plugins named, or of every game of frontend/src/game/<family>/plugins. --check only lists what
// a sync would do, with the commits that changed each file since it was synced. The configs are taken as the games
// repository's HEAD has them: what is not committed there is not synced, and is listed.
//
// ConfigsManifest.json records each synced file's SHA-256 and the commit it was taken from. A copy that no longer has its
// recorded hash was edited here, and is kept. When the games repository's file changed too, that is a conflict: the
// copy is not overwritten, and the sync exits with 1, unless --force says to take the games repository's. A file that
// only this repository has is kept too. A game whose configs folder the games repository does not have (renamed
// there, or on another branch) is listed, and its copies stay.
//
// The games repository may be given by its game folder too (<games>/game), as the other tools take it. --out <folder>
// and --manifest <file> name another folder to sync into and its manifest (the tests' use).

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameSources = join(here, '..');
const args = process.argv.slice(2);
const usage = 'usage: node sync-configs.mjs <games repository> [--check] [--force] [--json] [<plugin>...]';
const valued = new Set(['--out', '--manifest']);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const given = args.filter((arg, i) => !arg.startsWith('--') && !valued.has(args[i - 1]));
const games = given[0] && resolve(given[0]);
if (!games || !existsSync(games)) {
  console.error(usage);
  process.exit(2);
}
const checkOnly = args.includes('--check');
const force = args.includes('--force');
const asJson = args.includes('--json');
const outDir = resolve(option('--out') ?? join(gameSources, 'configs'));
const manifestPath = resolve(option('--manifest') ?? join(here, 'ConfigsManifest.json'));
const log = (...items) => (asJson ? console.error(...items) : console.log(...items));

function Fail(message) {
  console.error(`sync-configs: ${message}`);
  process.exit(2);
}

let repoRoot;
try {
  repoRoot = execFileSync('git', ['-C', games, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  Fail(`${games} is not in a git repository: the configs are taken from the games repository's commits`);
}
const git = (...gitArgs) => execFileSync('git', ['-C', repoRoot, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
const head = git('rev-parse', 'HEAD').trim();
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** The files of a folder of configs/ at HEAD, by their paths in configs/. */
const FilesAt = folder => git('ls-tree', '-r', '--name-only', '-z', 'HEAD', '--', `configs/${folder}/`).split('\0').filter(Boolean)
  .map(path => path.slice('configs/'.length));
/** A file of configs/ as HEAD has it. */
const ReadAt = path => execFileSync('git', ['-C', repoRoot, 'show', `HEAD:configs/${path}`], { maxBuffer: 1 << 28 });

/** The games of the browser game: the folders of each family's plugins, without the family's own plugin (its tools). */
function PortedPlugins() {
  const plugins = [];
  for (const family of readdirSync(gameSources)) {
    const folder = join(gameSources, family, 'plugins');
    if (!existsSync(folder) || !statSync(folder).isDirectory()) continue;
    plugins.push(...readdirSync(folder).filter(name => name !== family && statSync(join(folder, name)).isDirectory()));
  }
  return plugins.sort();
}

const plugins = given.slice(1).length ? given.slice(1) : PortedPlugins();
for (const plugin of plugins) if (!/^[A-Za-z0-9_]+$/.test(plugin)) Fail(`${plugin} is not a plugin's folder name`);

// The folders to sync: each game's modules folder, then the folders of the configs they include, and those include.
const folders = plugins.map(plugin => `${plugin}/modules`);
const source = new Map(); // path in configs/ -> the file at HEAD
const synced = []; // the folders the games repository has
const missing = []; // the games whose configs folder it does not have
for (let i = 0; i < folders.length; i++) {
  const folder = folders[i];
  const files = FilesAt(folder);
  if (!files.length) {
    // only a game's own folder is reported: an include of a folder that is not there is the games repository's to fix
    if (i < plugins.length) missing.push(plugins[i]);
    continue;
  }
  synced.push(folder);
  for (const path of files) {
    const data = ReadAt(path);
    source.set(path, data);
    if (!path.endsWith('.json')) continue;
    let includes = [];
    try {
      includes = JSON.parse(data.toString('utf8').replace(/^﻿/, '')).include ?? [];
    } catch {
      // not JSON the module manager reads: copied as it is
    }
    for (const include of Array.isArray(includes) ? includes : []) {
      if (typeof include !== 'string') continue;
      const target = posix.normalize(posix.join(posix.dirname(path), include.replaceAll('\\', '/')));
      const includedFolder = posix.dirname(target);
      // a config outside the configs folder is not the browser game's
      if (target.startsWith('../') || posix.isAbsolute(target) || includedFolder === '.') continue;
      if (!folders.includes(includedFolder)) folders.push(includedFolder);
    }
  }
}

const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const manifest = { ...previous };
const copyOf = path => join(outDir, ...path.split('/'));
const read = path => (existsSync(copyOf(path)) ? readFileSync(copyOf(path)) : null);

/** The commits that changed a config since the one it was synced from. */
function CommitsSince(commit, path) {
  if (!commit) return [];
  try {
    return execFileSync('git', ['-C', repoRoot, 'log', '--format=%h %ad %s', '--date=short', `${commit}..HEAD`, '--', `configs/${path}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
  } catch {
    return []; // the commit is not in this checkout's history
  }
}

// What a sync does with each file. A copy with its recorded hash is the games repository's, as it was synced. Another
// was edited here: it is kept while the games repository's is as it was synced, and is a conflict once that changed
// too. So is a copy that was never synced and differs.
const changes = [];
const editedHere = [];
for (const [path, data] of [...source].sort(([a], [b]) => a.localeCompare(b))) {
  const copy = read(path);
  const entry = previous[path];
  const hash = sha256(data);
  if (copy && sha256(copy) === hash) {
    if (entry?.sha256 !== hash) manifest[path] = { sha256: hash, commit: head };
    continue;
  }
  if (copy && entry && entry.sha256 === hash) {
    editedHere.push(path);
    continue;
  }
  const action = !copy ? 'added' : entry && sha256(copy) === entry.sha256 ? 'changed' : 'conflict';
  changes.push({ path, action, commits: action === 'added' ? [] : CommitsSince(entry?.commit, path) });
}
for (const [path, entry] of Object.entries(previous)) {
  if (source.has(path) || !synced.includes(posix.dirname(path))) continue;
  const copy = read(path);
  if (!copy) delete manifest[path];
  else changes.push({ path, action: sha256(copy) === entry.sha256 ? 'deleted' : 'conflict', gone: true, commits: CommitsSince(entry.commit, path) });
}
changes.sort((a, b) => a.path.localeCompare(b.path));

/** The files of a synced folder that only this repository has: not from a sync, and not the games repository's. */
function OnlyHere() {
  const found = [];
  const walk = folder => {
    const full = copyOf(folder);
    if (!existsSync(full)) return;
    for (const name of readdirSync(full)) {
      const path = `${folder}/${name}`;
      if (statSync(copyOf(path)).isDirectory()) walk(path);
      else if (!source.has(path) && !(path in previous)) found.push(path);
    }
  };
  synced.forEach(walk);
  return found.sort();
}

const onlyHere = OnlyHere();
const uncommitted = synced.length
  ? git('status', '--porcelain', '--', ...synced.map(folder => `configs/${folder}`)).split('\n').filter(Boolean).map(line => line.slice(3))
  : [];
const conflicts = changes.filter(change => change.action === 'conflict');
const applied = checkOnly ? [] : changes.filter(change => change.action !== 'conflict' || force);

for (const change of applied) {
  const target = copyOf(change.path);
  if (change.action === 'deleted' || change.gone) {
    rmSync(target);
    delete manifest[change.path];
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source.get(change.path));
    manifest[change.path] = { sha256: sha256(source.get(change.path)), commit: head };
  }
}
if (!checkOnly && JSON.stringify(manifest) !== JSON.stringify(previous)) {
  mkdirSync(dirname(manifestPath), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 1)}\n`);
}

const unresolved = force && !checkOnly ? [] : conflicts;
const report = { head, check: checkOnly, folders: synced, files: source.size, changes, applied: applied.map(change => change.path),
  conflicts: unresolved.map(change => change.path), missing, editedHere, onlyHere, uncommitted };

const what = { added: 'new', changed: 'changed', deleted: 'deleted in the games repository', conflict: 'CONFLICT' };
if (!changes.length) {
  log(`Nothing to sync: the configs have every change of the games repository's (${head.slice(0, 9)}). ${source.size} files of ${synced.join(', ') || 'no folder'}.`);
} else {
  log(checkOnly ? `${changes.length} of ${source.size} configs differ from the games repository's (${head.slice(0, 9)}):`
    : `${applied.length} configs synced from ${head.slice(0, 9)}:`);
  for (const change of changes) {
    const note = change.action !== 'conflict' ? what[change.action]
      : `${what.conflict}: this repository's copy is not as it was synced, and the games repository's ${change.gone ? 'was deleted' : 'changed too'}`
        + (force && !checkOnly ? '; the games repository\'s taken (--force)' : '; left as it is');
    log(`  configs/${change.path}  ${note}`);
    for (const commit of change.commits) log(`      ${commit}`);
  }
}
for (const plugin of missing) log(`The games repository has no configs/${plugin}/modules at ${head.slice(0, 9)}: not synced, and this repository's copy stays as it is.`);
if (editedHere.length) log(`Edited here, and kept (the games repository's are as they were synced): ${editedHere.map(path => `configs/${path}`).join(', ')}`);
if (onlyHere.length) log(`Only this repository has, and keeps: ${onlyHere.map(path => `configs/${path}`).join(', ')}`);
if (uncommitted.length) log(`Not committed in the games repository, so not synced: ${uncommitted.join(', ')}`);
if (unresolved.length && !checkOnly) {
  log(`${unresolved.length} conflicts were not synced. Compare each with the games repository's file, then run again with --force to take `
    + 'the games repository\'s, or keep this repository\'s and port the change by hand.');
}

if (asJson) process.stdout.write(`${JSON.stringify(report)}\n`);
process.exit(unresolved.length && !checkOnly ? 1 : 0);
