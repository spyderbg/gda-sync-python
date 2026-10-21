// Translates TypeScript states, views and visuals of the browser game into C++ (Translator.mjs), against the C++ game
// sources' headers.
//
//   node translate.mjs <games/game> <file.ts>...      prints {"files": {path: text}, "errors": {file: message}} as JSON
//
// A file's C++ goes to the path its TypeScript ports (as PortManifest.json maps them): alpha_family/libs/<Lib>/x.ts is
// alpha_family/libs/src/Egt/<Lib>/x.h and .cpp, alpha_family/plugins/<plugin>/<Module>/x.ts is
// alpha_family/plugins/<plugin>/src/Egt/<Module>/x.h and .cpp.

import ts from 'typescript';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Align } from './Align.mjs';
import { CppIndex } from './CppIndex.mjs';
import { TranslationError, Translator } from './Translator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gameSources = resolve(here, '../..');
const frontend = resolve(gameSources, '../..');

export function CppPathOf(tsPath) {
  const path = tsPath.replace(/\.ts$/, '');
  const plugin = path.match(/^alpha_family\/plugins\/([^/]+)\/(.+)$/);
  if (plugin) return `alpha_family/plugins/${plugin[1]}/src/Egt/${plugin[2]}`;
  if (path.startsWith('alpha_family/libs/')) return `alpha_family/libs/src/Egt/${path.slice('alpha_family/libs/'.length)}`;
  if (path.startsWith('plugins/')) return `plugins/src/Egt/${path.slice('plugins/'.length)}`;
  return null;
}

// The C++ game sources are formatted by clang-format 17 (their .clang-format files name it), from the .clang-format
// nearest each file: the translation is too, where clang-format is installed.
const CLANG_FORMAT = ['clang-format-17', 'clang-format'].find(command => spawnSync(command, ['--version']).status === 0) ?? null;

/** The C++ of a file formatted as the C++ game sources' file at its path would be, if clang-format is installed. */
function Format(cppRoot, path, text) {
  if (!CLANG_FORMAT) return text;
  const result = spawnSync(CLANG_FORMAT, [`--assume-filename=${join(cppRoot, path)}`], { input: text, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : text;
}

export function TranslateFiles(cppRoot, tsPaths) {
  const result = Translate(cppRoot, tsPaths);
  // formatted, aligned with the C++ it ports (what aligning moves is formatted again)
  for (const [path, text] of Object.entries(result.files)) result.files[path] = Format(cppRoot, path, Align(cppRoot, path, Format(cppRoot, path, text), result.aliases));
  return result;
}

function Translate(cppRoot, tsPaths) {
  const config = ts.getParsedCommandLineOfConfigFile(join(frontend, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const files = tsPaths.map(path => resolve(gameSources, path));
  const program = ts.createProgram(files, { ...config.options, noEmit: true });
  // the files translate against each other's translated headers (a view against its translated visuals): a first pass
  // writes them, the second indexes them before the C++ sources' headers
  const first = TranslatePass(program, new CppIndex(cppRoot), files);
  const headersRoot = mkdtempSync(join(tmpdir(), 'egt-translated-'));
  try {
    const roots = new Set();
    for (const [path, text] of Object.entries(first.files)) {
      if (!path.endsWith('.h')) continue;
      const match = /^(.*?\/src)\/(.*)$/.exec(path);
      if (!match) continue;
      const target = join(headersRoot, match[1], match[2]);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
      roots.add(join(headersRoot, match[1]));
    }
    if (!roots.size) return first;
    return TranslatePass(program, new CppIndex(cppRoot, [...roots]), files);
  } finally {
    rmSync(headersRoot, { recursive: true, force: true });
  }
}

function TranslatePass(program, index, files) {
  const translator = new Translator(program, index);
  const result = { files: {}, errors: {} };
  // the C++ aliases, for the alignment (not in the JSON)
  Object.defineProperty(result, 'aliases', { value: index.aliases, enumerable: false });
  for (const file of files) {
    const tsPath = relative(gameSources, file).replaceAll('\\', '/');
    const cppPath = CppPathOf(tsPath);
    try {
      if (!cppPath) throw new TranslationError(`${tsPath}: not in alpha_family/ or plugins/`);
      const sourceFile = program.getSourceFile(file) ?? program.getSourceFiles().find(item => resolve(item.fileName) === file);
      if (!sourceFile) throw new TranslationError(`${tsPath}: not found`);
      const translated = translator.TranslateState(sourceFile);
      result.files[`${cppPath}.h`] = translated.header;
      result.files[`${cppPath}.cpp`] = translated.source;
    } catch (error) {
      if (!(error instanceof TranslationError)) throw error;
      result.errors[tsPath] = error.message;
    }
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cppRoot, ...paths] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(TranslateFiles(cppRoot, paths)));
}
