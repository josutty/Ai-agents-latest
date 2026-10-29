// Shared logic for the team's hooks (Claude Code, Copilot, OpenCode). Pure Node, no dependencies.
//
// 1. Task scope: while a TASK/BUG is `in-progress` (or `built`, lite/batch review) in plan/PROGRESS.md, product files
//    (src/, test/, e2e/) may only be edited if they are in that task's Files table. This is the same boundary
//    `node tools/task.mjs scope` and the reviewer check — enforced at edit time instead of found afterwards.
//    Off switch: a line `scope-guard: off` in plan/run-options.md.
// 2. Secrets: never read .env / .env.local / .env.*.local / .env.production / *.pem / *.key.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

const PRODUCT_ROOTS = ['src/', 'test/', 'e2e/'];
const ACTIVE = new Set(['in-progress', 'built']);
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
const read = (p) => readFileSync(p, 'utf8');

export function toRel(p, root) {
  const clean = String(p).replace(/^file:\/\//, '').replace(/^\/([A-Za-z]:)/, '$1');
  return (isAbsolute(clean) ? relative(root, clean) : clean).split('\\').join('/').replace(/^\.\//, '');
}

export function options(root) {
  const f = join(root, 'plan/run-options.md');
  return existsSync(f) ? read(f) : '';
}

/** Tasks currently being worked on, with the paths in their Files tables. */
export function activeTasks(root) {
  const prog = join(root, 'plan/PROGRESS.md');
  if (!existsSync(prog)) return [];
  const rows = read(prog).split('\n').filter((l) => /^\|\s*(TASK|BUG)-\d+\s*\|/.test(l)).map(cells);
  const out = [];
  for (const c of rows) {
    const id = c[0]; const status = (c[c.length - 1] ?? '').toLowerCase();
    if (!ACTIVE.has(status)) continue;
    const file = join(root, `plan/tasks/${id}.md`);
    if (!existsSync(file)) continue;
    const files = new Set(); let inFiles = false;
    for (const line of read(file).split('\n')) {
      const h = line.match(/^## (.+)/); if (h) { inFiles = h[1].trim() === 'Files'; continue; }
      if (!inFiles || !line.startsWith('|')) continue;
      const p = (cells(line)[0] ?? '').replace(/`/g, '');
      if (p && !/^-+$/.test(p) && !/^path$/i.test(p)) files.add(p);
    }
    out.push({ id, status, files });
  }
  return out;
}

/** May this (workspace-relative) path be edited right now? */
export function checkEditPath(rel, root) {
  if (rel.startsWith('../')) return { ok: false, reason: `"${rel}" is outside the project` };
  if (!PRODUCT_ROOTS.some((r) => rel.startsWith(r))) return { ok: true };
  if (/^scope-guard:\s*off/im.test(options(root))) return { ok: true };
  const tasks = activeTasks(root);
  if (!tasks.length) return { ok: true }; // no task running: planning, bootstrap or ad-hoc work
  if (tasks.some((t) => t.files.has(rel))) return { ok: true };
  const dir = rel.replace(/\/$/, '') + '/'; // a folder that holds a file of the task is fine (create_directory before create_file)
  if (tasks.some((t) => [...t.files].some((p) => p.startsWith(dir)))) return { ok: true };
  const ids = tasks.map((t) => t.id).join(', ');
  return { ok: false, reason: `${ids} ${tasks.length > 1 ? 'are' : 'is'} in progress and "${rel}" is not in ${tasks.length > 1 ? 'their' : 'its'} Files table. `
    + 'STOP — do not retry or work around it (each retry costs tokens). If the task truly needs this file, say so in your reply and end with BLOCKED-DESIGN so the task file can be fixed.' };
}

const SECRET = [/(^|\/)\.env$/, /(^|\/)\.env\.local$/, /(^|\/)\.env\.[\w-]+\.local$/, /(^|\/)\.env\.production$/, /\.pem$/, /\.key$/, /(^|\/)id_(rsa|ed25519)$/];
export const isSecretPath = (rel) => SECRET.some((r) => r.test(rel));

const WRITE_TOOL = /(edit|replace|create|insert|patch|write|delete|rename|move|new_?file)/i;
const READ_TOOL = /(^read$|read_?file|view|open|cat)/i;
export const isWriteTool = (name) => WRITE_TOOL.test(name);
export const isReadTool = (name) => READ_TOOL.test(name) && !WRITE_TOOL.test(name);

/** Every file path a tool call mentions (works for Claude, Copilot, OpenCode and MCP tool inputs, and patch text). */
export function pathsFromToolInput(input) {
  const paths = new Set();
  const collect = (v, key = '') => {
    if (typeof v === 'string') {
      if (/(path|file|uri|target|destination)/i.test(key) && !/content|text/i.test(key)) paths.add(v);
      if (/^(input|patch|patchtext|patch_text|diff)$/i.test(key)) for (const m of v.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) paths.add(m[1].trim());
    } else if (Array.isArray(v)) v.forEach((x) => collect(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, k);
  };
  collect(input);
  return [...paths];
}

/** Tool arguments as an object. Copilot CLI sends `toolArgs` as a JSON string; Claude/VS Code send an object. */
export function toolArgsOf(input) {
  let a = input.tool_input ?? input.toolArgs ?? input.toolInput ?? {};
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
  return a && typeof a === 'object' ? a : {};
}
/** Tools that only create or list FOLDERS (create_directory, mkdir …): an empty folder changes no code, never scope-checked. */
export const isDirTool = (name) => /(director|folder|mkdir|list_dir|listdir)/i.test(name);

export function readStdinJson() {
  try { return JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { return null; }
}
