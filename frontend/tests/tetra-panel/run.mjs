import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'rolldown';

const here = dirname(fileURLToPath(import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'tetra-panel-tests-'));
try {
  const layouts = JSON.parse(readFileSync(join(here, 'panel-views.json'), 'utf8'));
  // Optionally verify the workspace's real views with the same behavioral tests.
  if (process.argv[2]) {
    for (const id of Object.keys(layouts)) {
      const file = id.endsWith('SwButtonView') ? `SwButtons/${id}.json` : `${id}.json`;
      layouts[id] = JSON.parse(readFileSync(join(process.argv[2], file), 'utf8'));
    }
  }
  await build({
    input: join(here, 'panel-layout.ts'),
    resolve: { alias: { '@game': resolve(here, '../../src/game') } },
    output: { file: join(out, 'tests.mjs'), format: 'esm' }, logLevel: 'warn',
  });
  const { run } = await import(pathToFileURL(join(out, 'tests.mjs')).href);
  let checks = 0;
  for (const creditView of ['DefaultCreditBarView', 'TruservCreditBarView']) {
    checks += run(structuredClone({ ...layouts, CreditBarView: layouts[creditView] }));
  }
  console.log(`${checks} panel layout checks passed`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
