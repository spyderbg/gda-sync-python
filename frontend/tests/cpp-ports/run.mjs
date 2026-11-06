// Runs checks.ts: bundles it with the browser game's sources and runs its checks in Node.
//
//   node tests/cpp-ports/run.mjs        (from frontend)

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'cpp-ports-tests-'));
try {
  await build({
    input: join(here, 'checks.ts'),
    resolve: { alias: { '@game': resolve(here, '../../src/game') } },
    output: { file: join(out, 'checks.mjs'), format: 'esm' }, logLevel: 'warn',
  });
  const { run } = await import(pathToFileURL(join(out, 'checks.mjs')).href);
  console.log(`${run()} C++ port checks passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
