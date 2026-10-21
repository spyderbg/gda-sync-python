// Checks that C++ files compile (clang -fsyntax-only) with the commands the games repository's build has for the C++
// game sources' files of the same paths, the folder's own headers first: a translation, an export's C++.
//
//   node CompileCheck.mjs <games/game> <folder> [<path in games/game>...] [--commands <compile_commands.json>]
//
// checks the .cpp files of the folder (laid out as games/game, all of them when no path is given) and prints those
// that do not compile, with clang's first errors; exits 1 if any does not. Without --commands, the newest
// compile_commands.json of the games repository's build folders.

import { exec } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The newest compile_commands.json of the games repository's build folders (games/build/<preset>/), or null. */
export function FindCompileCommands(cppRoot) {
  const build = join(cppRoot, '..', 'build');
  if (!existsSync(build)) return null;
  const found = readdirSync(build).map(name => join(build, name, 'compile_commands.json')).filter(path => existsSync(path));
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** The .cpp files (paths in games/game) of the folder that do not compile, with clang's first errors. */
export async function CompileErrors(cppRoot, commandsFile, folder, paths) {
  const commands = new Map(JSON.parse(readFileSync(commandsFile, 'utf8')).map(entry => [entry.file, entry]));
  const roots = [...new Set(paths.map(path => /^(.*?\/src)\//.exec(path)?.[1]).filter(Boolean))].map(root => `-I${join(folder, root)}`);
  // the original's folders, for the quoted includes of the files the folder has not (BaseReelsView.h)
  roots.push(...[...new Set(paths.map(path => dirname(join(cppRoot, path))))].map(item => `-iquote${item}`));
  const queue = paths.filter(path => path.endsWith('.cpp'));
  const failures = {};
  const run = path => new Promise(done => {
    const entry = commands.get(join(cppRoot, path));
    if (!entry) return done((failures[path] = 'no compile command'));
    const command = entry.command.replace(/\s-o\s+\S+/, '').replace(/\s-c\s+\S+$/, '').replace(entry.file, '');
    exec(`${command.replace(/^(\S+)/, `$1 ${roots.join(' ')}`)} -fsyntax-only -fno-color-diagnostics -c ${join(folder, path)}`, { cwd: entry.directory, maxBuffer: 1 << 24 }, (error, _stdout, stderr) => {
      if (error) failures[path] = stderr.split('\n').filter(line => /error:/.test(line)).slice(0, 3).join('\n');
      done();
    });
  });
  const workers = Array.from({ length: Math.max(1, cpus().length - 1) }, async () => {
    while (queue.length) await run(queue.shift());
  });
  await Promise.all(workers);
  return failures;
}

function* walk(folder) {
  for (const name of readdirSync(folder)) {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valued = new Set(['--commands']);
  const [cppRoot, folder, ...paths] = args.filter((arg, i) => !arg.startsWith('--') && !valued.has(args[i - 1])).map((arg, i) => (i < 2 ? resolve(arg) : arg));
  const commandsFile = args.includes('--commands') ? args[args.indexOf('--commands') + 1] : FindCompileCommands(cppRoot);
  if (!cppRoot || !folder || !commandsFile) {
    console.error('usage: node CompileCheck.mjs <games/game> <folder> [<path>...] [--commands <compile_commands.json>] (no compile_commands.json found)');
    process.exit(2);
  }
  const checked = paths.length ? paths : [...walk(folder)].map(path => relative(folder, path)).filter(path => /\.(cpp|h)$/.test(path));
  const failures = await CompileErrors(cppRoot, commandsFile, folder, checked);
  for (const [path, message] of Object.entries(failures)) console.log(`DOES NOT COMPILE ${path}\n${message}`);
  console.log(`${Object.keys(failures).length} of ${checked.filter(path => path.endsWith('.cpp')).length} .cpp files do not compile`);
  process.exitCode = Object.keys(failures).length ? 1 : 0;
}
