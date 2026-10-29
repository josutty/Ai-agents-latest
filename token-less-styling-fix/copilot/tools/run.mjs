// Runs npm, npx or a locally installed tool THROUGH NODE — no .ps1/.cmd launcher, no shell.
// For Windows PowerShell setups where "running scripts is disabled on this system" blocks npm.ps1 / npx.ps1.
//   node tools/run.mjs npm run typecheck
//   node tools/run.mjs npx vitest related src/x.ts --run
//   node tools/run.mjs openapi-typescript plan/generated/api-spec.yaml -o src/shared/api/generated/schema.d.ts
//   node tools/run.mjs redocly lint --extends=minimal plan/generated/api-spec.yaml
// Any argument list works exactly like the original command; the exit code is passed through.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const [tool, ...args] = process.argv.slice(2);
if (!tool || tool === '--help') {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(tool ? 0 : 2);
}
const fail = (m) => { console.error(`✘ ${m}`); process.exit(1); };

// npm / npx ship as plain JS next to node (Windows: <node dir>/node_modules/npm/bin; Linux/macOS: <prefix>/lib/node_modules/npm/bin)
function npmEntry(which) {
  const dir = dirname(process.execPath);
  const spots = [join(dir, 'node_modules/npm/bin'), join(dir, '../lib/node_modules/npm/bin'), process.env.npm_execpath ? dirname(process.env.npm_execpath) : '']
    .filter(Boolean).map((d) => join(d, `${which}-cli.js`));
  return spots.find(existsSync) ?? fail(`cannot find ${which}-cli.js next to node (looked in: ${spots.join(', ')}). Use ${which}.cmd instead.`);
}

// A locally installed tool: read the "bin" map of the packages in node_modules (the .bin shims are .cmd/.ps1 on Windows).
function localBin(name) {
  const root = 'node_modules'; if (!existsSync(root)) fail('node_modules not found — install the project first (node tools/run.mjs npm install)');
  const pkgs = readdirSync(root, { withFileTypes: true }).filter((d) => !d.name.startsWith('.') && (d.isDirectory() || d.isSymbolicLink()))
    .flatMap((d) => (d.name.startsWith('@') ? readdirSync(join(root, d.name)).map((s) => `${d.name}/${s}`) : [d.name]));
  const pick = (pkg) => {
    const f = join(root, pkg, 'package.json'); if (!existsSync(f)) return null;
    const j = JSON.parse(readFileSync(f, 'utf8')); const bins = typeof j.bin === 'string' ? { [j.name.split('/').pop()]: j.bin } : (j.bin ?? {});
    const key = pkgMatch(pkg) ? (bins[name] ? name : Object.keys(bins)[0]) : name;
    return bins[key] ? join(root, pkg, bins[key]) : null;
  };
  const pkgMatch = (pkg) => pkg === name;
  const exact = pkgs.includes(name) ? pick(name) : null;
  if (exact) return exact;
  for (const pkg of pkgs) { const b = pick(pkg); if (b && !pkgMatch(pkg)) return b; }
  return fail(`no installed tool named "${name}" in node_modules`);
}

const entry = tool === 'npm' || tool === 'npx' ? npmEntry(tool) : localBin(tool);
const r = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
if (r.error) fail(r.error.message);
process.exit(r.status ?? 1);
