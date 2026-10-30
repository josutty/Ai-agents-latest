#!/usr/bin/env node
// PostToolUse hook — format the file an agent just wrote: Prettier, then `eslint --fix` (safe fixes only).
// Runs only what the PROJECT has: Prettier only if the project has a Prettier config (so an existing project
// that doesn't use Prettier is never reformatted), ESLint only if it has an eslint config. Always exits 0, prints nothing.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { isDirTool, isWriteTool, pathsFromToolInput, readStdinJson, toolArgsOf, toRel } from './scope-lib.mjs';

const input = readStdinJson();
if (!input) process.exit(0);
// plan/run-options.md: `format: off` disables this hook; `format: prettier-only` skips eslint --fix (~2 s faster per write)
const fmtOpt = (() => { try { return (readFileSync(join(input.cwd ?? process.cwd(), 'plan/run-options.md'), 'utf8').match(/^format:\s*(\S+)/m) ?? [])[1] ?? 'on'; } catch { return 'on'; } })();
if (fmtOpt === 'off') process.exit(0);
const toolName = String(input.tool_name ?? input.toolName ?? '');
if (!isWriteTool(toolName) || isDirTool(toolName)) process.exit(0);
const root = input.cwd ?? process.cwd();
const toolInput = toolArgsOf(input);
const files = pathsFromToolInput(toolInput).map((p) => toRel(p, root))
  .filter((p) => !p.startsWith('../') && !p.includes('node_modules/') && !p.includes('/generated/') && !/^(plan|analysis|notes|inputs)\//.test(p) && existsSync(join(root, p))); // team bookkeeping files are parsed by tools — leave them as written
if (!files.length) process.exit(0);

const pkg = existsSync(join(root, 'package.json')) ? JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) : {};
const has = (names) => names.some((n) => existsSync(join(root, n)));
const bin = (name) => {
  try {
    const req = createRequire(join(root, 'package.json'));
    const pj = req.resolve(`${name}/package.json`); const b = JSON.parse(readFileSync(pj, 'utf8')).bin;
    const rel = typeof b === 'string' ? b : b?.[name]; return rel ? join(dirname(pj), rel) : null;
  } catch { return null; }
};
const prettierCfg = pkg.prettier || has(['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.yaml', '.prettierrc.yml', 'prettier.config.js', 'prettier.config.mjs', 'prettier.config.cjs']);
const eslintCfg = has(['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts']);
const prettier = prettierCfg ? bin('prettier') : null;
const eslint = eslintCfg && fmtOpt !== 'prettier-only' ? bin('eslint') : null;
const run = (args) => spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 30000 });

for (const f of files) {
  if (prettier && /\.(tsx?|jsx?|mjs|cjs|json|css|md|ya?ml|html)$/.test(f)) run([prettier, '--write', '--log-level', 'silent', f]);
  if (eslint && /\.(tsx?|jsx?|mjs|cjs)$/.test(f)) run([eslint, '--fix', '--no-warn-ignored', '--quiet', f]);
}
process.exit(0);
