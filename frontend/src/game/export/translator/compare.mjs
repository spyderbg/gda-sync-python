// Compares the translator's C++ with the C++ it ports: translates every TypeScript file of PortManifest.json that it
// can (states, views, visuals, software buttons) and diffs each .h and .cpp with the games repository's. The fewer
// lines differ, the less an export of a change needs updating by hand.
//
//   node compare.mjs <games/game> [--diff <path-substring>] [--out <folder>] [--compile <compile_commands.json>]
//
// prints the lines changed per file, most first, and their total; --diff prints the diffs of the files whose C++ path
// has the substring; --errors prints why the files of states and views (not data, math) are not translated; --out
// writes the translated files there; --compile checks that each translated .cpp compiles
// (-fsyntax-only) with the command the games repository's build has for its C++, the translated headers first.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileErrors } from './CompileCheck.mjs';
import { TranslateFiles } from './translate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const cppRoot = args[0];
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const manifest = JSON.parse(readFileSync(join(here, '../PortManifest.json'), 'utf8'));
const { files, errors } = TranslateFiles(cppRoot, Object.keys(manifest));
const out = option('--out') ?? join(tmpdir(), 'egt-translator-compare');
const filter = option('--diff');

const rows = [];
for (const [path, text] of Object.entries(files)) {
  const translated = join(out, path);
  mkdirSync(dirname(translated), { recursive: true });
  writeFileSync(translated, text);
  const original = join(cppRoot, path);
  let diff = '';
  try {
    execFileSync('diff', ['-u', original, translated], { encoding: 'utf8' });
  } catch (error) {
    diff = error.stdout ?? '';
  }
  const lines = diff.split('\n');
  const changed = lines.filter(line => /^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line)).length;
  rows.push({ path, changed, total: readFileSync(original, 'utf8').split('\n').length, diff });
}
rows.sort((a, b) => b.changed - a.changed);

if (filter) {
  for (const row of rows) if (row.path.includes(filter)) process.stdout.write(row.diff);
} else {
  for (const row of rows) if (row.changed) console.log(`${String(row.changed).padStart(5)} / ${String(row.total).padStart(5)}  ${row.path}`);
  const identical = rows.filter(row => !row.changed).length;
  console.log(`${rows.length} files, ${identical} identical, ${rows.reduce((sum, row) => sum + row.changed, 0)} lines changed; ${Object.keys(errors).length} TypeScript files not translated`);
}
if (args.includes('--errors')) {
  for (const [path, message] of Object.entries(errors)) if (!/no class$|: not in /.test(message.split('\n')[0])) console.log(`NOT TRANSLATED ${path}\n  ${message.split('\n').slice(0, 4).join('\n  ')}`);
}
if (option('--compile')) {
  const failures = await CompileErrors(cppRoot, option('--compile'), out, Object.keys(files));
  for (const [path, message] of Object.entries(failures)) console.log(`DOES NOT COMPILE ${path}\n${message}`);
  console.log(`${Object.keys(failures).length} of ${Object.keys(files).filter(path => path.endsWith('.cpp')).length} translated .cpp files do not compile`);
}
