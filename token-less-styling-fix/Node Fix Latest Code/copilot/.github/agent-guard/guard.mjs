#!/usr/bin/env node
// PreToolUse hook for the agent team (VS Code Copilot, Local harness; the Claude port ships the same file under .claude/).
// Usage (from each agent's frontmatter): node .github/agent-guard/guard.mjs <agent-name>
// Enforces policy.json — the per-agent file/command rules converted from the OpenCode permissions.
// Rules are evaluated in order and the LAST matching rule wins. Anything we can't classify is left
// to VS Code's normal approval flow (no output).
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const agent = process.argv[2];
const policy = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'policy.json'), 'utf8'));

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const rules = policy[agent];
if (!rules) process.exit(0);

const toolName = String(input.tool_name ?? input.toolName ?? '');
const toolInput = input.tool_input ?? input.toolArgs ?? {};
const cwd = input.cwd ?? process.cwd();

const esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
// Paths: ** = any depth, * = one segment. Commands: * = anything. A bare "*" matches everything.
const pathRe = (p) => (p === '*' ? /^.*$/ : new RegExp('^' + esc(p).replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002')
  .replace(/\*/g, '[^/]*').replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*') + '$'));
const cmdRe = (p) => new RegExp('^' + esc(p).replace(/\*/g, '.*') + '$', 's');
const decide = (list, value, toRe) => {
  let result = 'deny', rule = '(no rule)';
  for (const [pattern, action] of list) if (toRe(pattern).test(value)) { result = action; rule = pattern; }
  return { result, rule };
};

const deny = (reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: `agent-guard (${agent}): ${reason}. STOP: do not try variants of the command or another way round it — every retry costs tokens. Say in your reply what you needed and why, then end with your HANDOFF (BLOCKED-DESIGN if the task needs it).` } }));
  process.exit(0);
};

// 1. Terminal commands. Quote-aware split on && || ; | & and newlines; $(…) and `…` are checked as commands of their own;
//    a redirect (> file, >> file) or `tee file` is a FILE WRITE and must pass the edit rules too.
const splitCommand = (cmd) => {
  const subs = [];
  const flat = cmd.replace(/\$\(([^()]*)\)|`([^`]*)`/g, (_, a, b) => { subs.push(a ?? b); return ' __SUB__ '; });
  const segs = []; let cur = '', q = null;
  for (let i = 0; i < flat.length; i++) {
    const c = flat[i], n = flat[i + 1];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ((c === '&' && n === '&') || (c === '|' && n === '|')) { segs.push(cur); cur = ''; i++; continue; }
    if (c === ';' || c === '\n' || c === '|') { segs.push(cur); cur = ''; continue; }
    if (c === '&' && flat[i - 1] !== '>' && n !== '>') { segs.push(cur); cur = ''; continue; }
    cur += c;
  }
  segs.push(cur);
  return { segments: segs.map((x) => x.trim()).filter(Boolean), subs };
};
const writeTargets = (seg) => {
  const unquoted = seg.replace(/"[^"]*"|'[^']*'/g, '""');
  const out = [];
  for (const m of unquoted.matchAll(/(?:^|[^0-9&<])(?:\d)?>>?\s*([^\s&|;<>]+)/g)) if (!/^(&\d|\/dev\/null|nul|NUL)$/.test(m[1])) out.push(m[1]);
  const tee = unquoted.match(/^tee\s+(?:-a\s+)?(.+)$/); if (tee) out.push(...tee[1].split(/\s+/).filter((x) => !x.startsWith('-')));
  return out;
};
const checkCommand = (cmd, depth = 0) => {
  const { segments, subs } = splitCommand(cmd);
  if (depth < 3) for (const s of subs) checkCommand(s, depth + 1);
  for (const raw of segments) {
    const segment = raw.replace(/^(?:(?:\$env:\w+\s*=\s*\S+|\w+=\S+)\s*;?\s+)+/, ''); // CI=1 npm test · $env:CI='1'; npm test
    if (!segment) continue;
    const { result, rule } = decide(rules.bash, segment, cmdRe);
    if (result !== 'allow') deny(`command "${segment}" is not allowed (rule "${rule}")`);
    for (const target of writeTargets(segment)) {
      const rel = (isAbsolute(target) ? relative(cwd, target) : target).split('\\').join('/').replace(/^\.\//, '');
      const r = decide(rules.edit, rel, pathRe);
      if (rel.startsWith('../') || r.result !== 'allow') deny(`command "${segment}" writes "${rel}", which this agent may not edit — use the edit tool on your own files`);
    }
  }
};
const command = typeof toolInput.command === 'string' ? toolInput.command : null;
if (command) { checkCommand(command); process.exit(0); }

// 2. File edits: only for tools that write. Reads, searches and listings are never blocked.
const writes = /(edit|replace|create|insert|patch|write|delete|rename|move|new_?file)/i.test(toolName);
const readOnly = /(read|list|search|grep|find|get|view|fetch|open)/i.test(toolName) && !writes;
if (!writes || readOnly) process.exit(0);

const paths = new Set();
const collect = (v, key = '') => {
  if (typeof v === 'string') {
    if (/(path|file|uri|target|destination)/i.test(key)) paths.add(v.replace(/^file:\/\//, ''));
    if (/^(input|patch|diff)$/i.test(key)) for (const m of v.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) paths.add(m[1].trim());
  } else if (Array.isArray(v)) v.forEach((x) => collect(x, key));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) collect(x, k);
};
collect(toolInput);
if (!paths.size) process.exit(0); // can't tell what it writes → VS Code asks as usual

for (const p of paths) {
  const rel = (isAbsolute(p) ? relative(cwd, p) : p).split('\\').join('/').replace(/^\.\//, '');
  if (rel.startsWith('../')) deny(`"${p}" is outside the workspace`);
  const { result, rule } = decide(rules.edit, rel, pathRe);
  if (result !== 'allow') deny(`editing "${rel}" is not allowed (rule "${rule}")`);
}
process.exit(0);
