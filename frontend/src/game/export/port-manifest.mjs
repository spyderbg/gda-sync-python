// Writes PortManifest.json: each TypeScript file of the browser game that ports C++ (alpha_family/..., plugins/...), its
// C++ files, the SHA-256 of the TypeScript as it was ported, and the C++ it ports: the games repository's commit
// (cppCommit) and the SHA-256 of each C++ file there (cppSha256). The export compares the TypeScript with it: a file
// that changed in the browser since has C++ to update, unless export/cpp has the updated C++. The import compares the
// C++ with it (import-cpp.mjs): a C++ file that changed since has TypeScript to update.
//
// Run it when TypeScript is ported again from C++, or after the C++ of a change is updated (in export/cpp or in the
// games repository):
//
//   node frontend/src/game/export/port-manifest.mjs <games/game> [--base <commit>] [--only <ts path>...]
//
// An entry whose TypeScript did not change keeps the C++ it was ported from; one whose TypeScript changed (or which is
// new) ports the C++ of --base (default: the games repository's HEAD). --only refreshes these entries only (paths
// relative to frontend/src/game), as an import does for the files it updated.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameSources = join(here, '..');
const args = process.argv.slice(2);
const cppRoot = args[0];
if (!cppRoot || !existsSync(cppRoot)) {
  console.error('usage: node port-manifest.mjs <games/game folder> [--base <commit>] [--only <ts path>...]');
  process.exit(1);
}
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = args.includes('--only') ? new Set(args.slice(args.indexOf('--only') + 1).filter(arg => !arg.startsWith('--'))) : null;

const git = (...gitArgs) => execFileSync('git', ['-C', cppRoot, ...gitArgs], { encoding: 'utf8', maxBuffer: 1 << 28 });
const repoRoot = git('rev-parse', '--show-toplevel').trim();
const base = git('rev-parse', option('--base') ?? 'HEAD').trim();
const sha256 = data => createHash('sha256').update(data).digest('hex');

/** A C++ file's SHA-256 at a commit of the games repository, or null where it was not. */
function CppSha256At(commit, path) {
  try {
    return sha256(execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${relative(repoRoot, join(cppRoot, path))}`], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

function* walk(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (name.endsWith('.ts')) yield path;
  }
}

/** The C++ files a TypeScript file ports: the same path under src/Egt, as .h and .cpp. */
function cppOf(file) {
  const path = relative(gameSources, file).replaceAll('\\', '/').replace(/\.ts$/, '');
  let cppBase = null;
  const plugin = path.match(/^alpha_family\/plugins\/([^/]+)\/(.+)$/);
  if (plugin) cppBase = `alpha_family/plugins/${plugin[1]}/src/Egt/${plugin[2]}`;
  else if (path.startsWith('alpha_family/libs/')) cppBase = `alpha_family/libs/src/Egt/${path.slice('alpha_family/libs/'.length)}`;
  else if (path.startsWith('plugins/')) cppBase = `plugins/src/Egt/${path.slice('plugins/'.length)}`;
  if (!cppBase) return { path, cpp: [] };
  return { path, cpp: [`${cppBase}.h`, `${cppBase}.cpp`].filter(candidate => existsSync(join(cppRoot, candidate))) };
}

const manifestPath = join(here, 'PortManifest.json');
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const manifest = {};
let refreshed = 0;
for (const folder of ['alpha_family', 'plugins']) {
  for (const file of walk(join(gameSources, folder))) {
    const { path, cpp } = cppOf(file);
    if (!cpp.length) continue;
    const ts = `${path}.ts`;
    const tsSha256 = sha256(readFileSync(file));
    const old = previous[ts];
    // kept: not asked for (--only), or the TypeScript as it was ported, with its C++ known
    const keep = old && (only ? !only.has(ts) : old.sha256 === tsSha256 && old.cppCommit);
    if (keep) {
      manifest[ts] = old;
      continue;
    }
    if (only && !only.has(ts)) continue;
    refreshed++;
    manifest[ts] = { cpp, sha256: tsSha256, cppCommit: base, cppSha256: Object.fromEntries(cpp.map(item => [item, CppSha256At(base, item)])) };
  }
}
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(manifestPath, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} ported files, ${refreshed} of them now ported from ${base.slice(0, 9)}`);
