// Runs the alpha family math checks (tests.ts) with Node.js: rolldown (Vite's bundler) bundles them, then they run.
//
//   node run.mjs      prints the failures and exits with 1 if any

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'math-tests-'));
try {
  await build({ input: join(here, 'tests.ts'), output: { file: join(out, 'tests.mjs'), format: 'esm' }, logLevel: 'warn' });
  const { run } = await import(pathToFileURL(join(out, 'tests.mjs')).href);
  const { checks, failures } = run();
  for (const failure of failures) console.log(`FAIL ${failure}`);
  console.log(`${checks - failures.length} of ${checks} checks passed`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  rmSync(out, { recursive: true, force: true });
}
