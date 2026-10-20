// Writes PortManifest.json: each TypeScript file of the browser game that ports C++ (alpha_family/..., plugins/...), its
// C++ files and the SHA-256 of the TypeScript as it was ported. The export compares the TypeScript with it: a file that
// changed in the browser since has C++ to update, unless export/cpp has the updated C++.
//
// Run it when TypeScript is ported again from C++, or after the C++ of a change is updated (in export/cpp or in the
// games repository):
//
//   node frontend/src/game/export/port-manifest.mjs /media/plamen/data/Egt/games/game

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gameSources = join(here, '..');
const cppRoot = process.argv[2];
if (!cppRoot || !existsSync(cppRoot)) {
  console.error('usage: node port-manifest.mjs <games/game folder>');
  process.exit(1);
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
  let base = null;
  const plugin = path.match(/^alpha_family\/plugins\/([^/]+)\/(.+)$/);
  if (plugin) base = `alpha_family/plugins/${plugin[1]}/src/Egt/${plugin[2]}`;
  else if (path.startsWith('alpha_family/libs/')) base = `alpha_family/libs/src/Egt/${path.slice('alpha_family/libs/'.length)}`;
  else if (path.startsWith('plugins/')) base = `plugins/src/Egt/${path.slice('plugins/'.length)}`;
  if (!base) return { path, cpp: [] };
  return { path, cpp: [`${base}.h`, `${base}.cpp`].filter(candidate => existsSync(join(cppRoot, candidate))) };
}

const manifest = {};
for (const folder of ['alpha_family', 'plugins']) {
  for (const file of walk(join(gameSources, folder))) {
    const { path, cpp } = cppOf(file);
    if (!cpp.length) continue;
    manifest[`${path}.ts`] = { cpp, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') };
  }
}
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(here, 'PortManifest.json'), `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} ported files`);
