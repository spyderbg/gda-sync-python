// Has a Claude Code agent port into an export's C++ what the translator could not: each ported TypeScript file the
// export lists as changed in the browser with C++ to update by hand (export.json's changed).
//
//   node frontend/src/game/export/export-agent.mjs <export folder> <games/game> [--model <model>] [--json] [<ts path>...]
//
// For each, the agent gets the TypeScript's change since it was ported (the TypeScript as it was, found in the app's
// git history by its SHA-256 in PortManifest.json) and the C++ it ports, in the export (copied from the C++ game
// sources when the export has it not); it may edit only the export's C++ and run the compile check. Then the export
// checks what it did, deterministically: the C++ it changed compiles with the games repository's build flags
// (translator/CompileCheck.mjs; not checked where the build has no compile_commands.json). What passes stays in the
// export, listed in its README under "Ported by Claude Code" (review it as any change); what fails is put back.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompileErrors, FindCompileCommands } from './translator/CompileCheck.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const gameSources = resolve(here, '..');
const repo = resolve(gameSources, '../../..');
const args = process.argv.slice(2);
const valued = new Set(['--model']);
const positional = args.filter((arg, i) => !arg.startsWith('--') && !valued.has(args[i - 1]));
const [exportFolder, cppRoot] = positional.slice(0, 2).map(path => path && resolve(path));
const asked = positional.slice(2);
const asJson = args.includes('--json');
const log = (...items) => (asJson ? console.error(...items) : console.log(...items));
if (!exportFolder || !cppRoot || !existsSync(join(exportFolder, 'export.json'))) {
  console.error('usage: node export-agent.mjs <export folder (with export.json)> <games/game> [--model <model>] [--json] [<ts path>...]');
  process.exit(1);
}
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const sha256 = data => createHash('sha256').update(data).digest('hex');
const exported = JSON.parse(readFileSync(join(exportFolder, 'export.json'), 'utf8'));
const commandsFile = FindCompileCommands(cppRoot);

/** The TypeScript as it was ported: its version in the app's git history of that SHA-256, or null. */
function PortedText(ts, wanted) {
  const path = `frontend/src/game/${ts}`;
  const commits = execFileSync('git', ['-C', repo, 'log', '--format=%H', '--', path], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const commit of commits) {
    try {
      const text = execFileSync('git', ['-C', repo, 'show', `${commit}:${path}`], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
      if (sha256(text) === wanted) return text;
    } catch {
      // not in that commit
    }
  }
  return null;
}

function TsDiff(ts, ported) {
  const folder = mkdtempSync(join(tmpdir(), 'egt-export-agent-'));
  try {
    writeFileSync(join(folder, 'ported.ts'), ported);
    const result = spawnSync('diff', ['-u', '--label', `${ts} (as ported)`, '--label', `${ts} (now)`, join(folder, 'ported.ts'), join(gameSources, ts)], { encoding: 'utf8' });
    return result.stdout;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

function Prompt(item, diff) {
  return `You keep the C++ game in step with the browser game's TypeScript, which ports it statement for statement (read the
section "The TypeScript to C++ translator" of ${repo}/frontend/src/game/README.md for how the two correspond).

${repo}/frontend/src/game/${item.ts} changed in the browser since it was ported from its C++; the translator could not
translate it${item.reason ? ` (${item.reason.split('\n')[0]})` : ''}. The change:

\`\`\`diff
${diff}\`\`\`

Port this change, and only this change, into its C++ in this export: ${item.cpp.map(path => `game/${path}`).join(' and ')} (the C++ game
sources' files as they are, which other C++ of ${cppRoot} uses: keep their interfaces unless the change needs another).
Write it as the C++ around it is written. Edit only files under game/ here.

${commandsFile ? `Check that it compiles: \`node ${here}/translator/CompileCheck.mjs ${cppRoot} game ${item.cpp.join(' ')}\` must print
"0 of ... .cpp files do not compile".` : 'The games repository has no compile_commands.json: it cannot be compiled here, so read the C++ it uses with care.'}

End with a short account: what you changed, and what of the TypeScript change you could not port and why.`;
}

function RunAgent(item, diff) {
  const allowed = ['Read', 'Grep', 'Glob', 'Edit(game/**)', 'Write(game/**)', `Bash(node ${here}/translator/CompileCheck.mjs:*)`];
  const command = ['-p', '--output-format', 'json', '--permission-mode', 'acceptEdits', '--allowedTools', allowed.join(' '),
    '--add-dir', gameSources, '--add-dir', cppRoot];
  if (option('--model')) command.push('--model', option('--model'));
  const result = spawnSync('claude', command, { cwd: exportFolder, input: Prompt(item, diff), encoding: 'utf8', maxBuffer: 1 << 26, timeout: 30 * 60 * 1000 });
  if (result.error) return { ok: false, account: `Claude Code did not run: ${result.error.message}` };
  try {
    const reply = JSON.parse(result.stdout);
    return { ok: !reply.is_error, account: reply.result ?? '', cost: reply.total_cost_usd ?? null };
  } catch {
    return { ok: false, account: `${result.stdout}${result.stderr}`.trim().slice(-2000) };
  }
}

if (spawnSync('claude', ['--version']).status !== 0) {
  console.error('Claude Code (the claude command) is not installed');
  process.exit(1);
}
const report = { ported: [], failed: [] };
for (const item of exported.changed.filter(entry => !asked.length || asked.includes(entry.ts))) {
  log(`porting ${item.ts} into the export's C++ with Claude Code...`);
  const ported = item.sha256 ? PortedText(item.ts, item.sha256) : null;
  if (ported === null) {
    report.failed.push({ ts: item.ts, reason: 'the TypeScript as it was ported is not in the git history' });
    log('  not ported: the TypeScript as it was ported is not in the git history');
    continue;
  }
  // the C++ to change, in the export (copied from the C++ game sources where the export has it not)
  const saved = new Map();
  for (const path of item.cpp) {
    const target = join(exportFolder, 'game', path);
    if (!existsSync(target)) {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(cppRoot, path), target);
    }
    saved.set(path, readFileSync(target, 'utf8'));
  }
  const agent = RunAgent(item, TsDiff(item.ts, ported));
  const changed = item.cpp.filter(path => readFileSync(join(exportFolder, 'game', path), 'utf8') !== saved.get(path));
  const failures = commandsFile && changed.length ? await CompileErrors(cppRoot, commandsFile, join(exportFolder, 'game'), item.cpp) : {};
  const result = { ts: item.ts, cpp: changed, compiled: !!commandsFile, account: agent.account, cost: agent.cost };
  if (agent.ok && changed.length && !Object.keys(failures).length) {
    report.ported.push(result);
    log(`  ported: ${changed.join(', ')}${commandsFile ? ' (compiles)' : ' (not compiled: no compile_commands.json)'}`);
  } else {
    for (const [path, text] of saved) writeFileSync(join(exportFolder, 'game', path), text);
    result.reason = !agent.ok ? 'the agent failed' : !changed.length ? 'the agent changed nothing'
      : `it does not compile:\n${Object.entries(failures).map(([path, message]) => `${path}: ${message}`).join('\n')}`;
    report.failed.push(result);
    log(`  not ported (the export is as it was): ${result.reason.split('\n')[0]}`);
  }
  log(`  ${agent.account.split('\n').join('\n  ')}`);
}

// the export says what the agent did
if (report.ported.length || report.failed.length) {
  writeFileSync(join(exportFolder, 'export.json'), `${JSON.stringify({ ...exported, agent: report }, null, 1)}\n`);
  const readme = join(exportFolder, 'README.md');
  const section = `\n## Ported by Claude Code (${report.ported.length})\n\nTypeScript changes the translator could not translate, ported into this export's C++ by a Claude Code agent
(frontend/src/game/export/export-agent.mjs), ${commandsFile ? 'checked to compile' : 'not compiled (no compile_commands.json)'}: review them as any change.\n\n${
  report.ported.map(item => `- \`frontend/src/game/${item.ts}\`: ${item.cpp.map(path => `\`game/${path}\``).join(', ')}\n\n  ${item.account.split('\n').join('\n  ')}`).join('\n') || '- none'}\n${
  report.failed.length ? `\nNot ported, still to update by hand:\n\n${report.failed.map(item => `- \`frontend/src/game/${item.ts}\`: ${item.reason.split('\n')[0]}`).join('\n')}\n` : ''}`;
  writeFileSync(readme, readFileSync(readme, 'utf8') + section);
}
if (asJson) process.stdout.write(`${JSON.stringify(report)}\n`);
