// Maintainer tool — finds drift between the three ports of this agent team.
// Usage: unpack the three zips side by side, then from their parent folder:
//   node <any-port>/tools/port-drift.mjs <claude-dir> <copilot-dir> <opencode-dir>
// Prints every file that should be identical but isn't, and every agent whose instructions differ beyond the
// known per-tool wording (tool names, folder names, the one-line harness note). Exit 1 on drift.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [claude, copilot, opencode] = process.argv.slice(2);
if (!opencode) { console.error('usage: node tools/port-drift.mjs <claude-dir> <copilot-dir> <opencode-dir>'); process.exit(2); }
const ports = { claude, copilot, opencode };
const agentFile = { claude: (a) => `.claude/agents/${a}.md`, copilot: (a) => `.github/agents/${a}.agent.md`, opencode: (a) => `.opencode/agents/${a}.md` };
const hash = (p) => (existsSync(p) ? createHash('sha1').update(readFileSync(p)).digest('hex').slice(0, 10) : 'missing');
let drift = 0;

// 1. files that must be byte-identical in every port
const SAME = ['tools/task.mjs', 'tools/design-spec.mjs', 'tools/run.mjs', 'tools/detect-ui-capabilities.mjs', 'tools/list-html-elements.mjs',
  'tools/check-contrast.mjs', 'tools/port-drift.mjs', 'tools/lib-facts.mjs', 'tools/scope.mjs', 'tools/hooks/scope-lib.mjs', 'tools/hooks/pre-tool.mjs', 'tools/hooks/format.mjs',
  '.githooks/pre-commit', '.github/workflows/quality-gates.yml', 'CHANGELOG.md',
  ...readdirSync(join(claude, 'agent-docs/templates')).map((f) => `agent-docs/templates/${f}`),
  ...readdirSync(join(claude, 'agent-docs/rules')).filter((f) => !['ownership.md', 'team-protocol.md'].includes(f)).map((f) => `agent-docs/rules/${f}`)];
for (const f of SAME) {
  const hs = Object.fromEntries(Object.entries(ports).map(([k, d]) => [k, hash(join(d, f))]));
  if (new Set(Object.values(hs)).size > 1) { drift++; console.log(`✘ ${f}: ${Object.entries(hs).map(([k, h]) => `${k}=${h}`).join(' ')}`); }
}
const pol = [hash(join(claude, '.claude/agent-guard/policy.json')), hash(join(copilot, '.github/agent-guard/policy.json'))];
if (pol[0] !== pol[1]) { drift++; console.log('✘ agent-guard policy.json differs between claude and copilot'); }

// 2. agent instructions, normalised for the known per-tool wording
const norm = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '')
  .split('\n').filter((l) => !/^> \*\*(Claude Code|Copilot|OpenCode):\*\*/.test(l) && !/^> (format\)|`\.claude|the agent-guard|\(`\.opencode)/.test(l))
  .join('\n')
  .replace(/mcp__(serena|qartez)__|\b(serena|qartez)[_/]/g, '$1$2.')
  .replace(/\.(claude|github|opencode)\//g, '<port>/')
  .replace(/AGENTS\.md is (normally )?already in your context[^.]*\./g, 'AGENTS.md is already in your context.')
  .replace(/\((the agent-guard hook enforces it|permissions enforce it)\)/g, '(enforced)')
  .replace(/You run as the main session and start subagents with the Agent tool; route/g, 'You dispatch subagents and route')
  .replace(/start subagents with the Agent tool|dispatch subagents with the task tool|dispatch subagents with the `agent` tool \(run the named custom agent as a subagent\)/g, 'dispatch subagents')
  .split('\n').map((l) => l.trimEnd());
const agents = readdirSync(join(claude, '.claude/agents')).map((f) => f.replace(/\.md$/, ''));
for (const a of agents) {
  const base = norm(readFileSync(join(claude, agentFile.claude(a)), 'utf8'));
  for (const k of ['copilot', 'opencode']) {
    const p = join(ports[k], agentFile[k](a));
    if (!existsSync(p)) { drift++; console.log(`✘ ${a}: missing in ${k}`); continue; }
    const other = norm(readFileSync(p, 'utf8')); const setB = new Set(base), setO = new Set(other);
    const only = [...base.filter((l) => l && !setO.has(l)).map((l) => `  claude only: ${l.slice(0, 140)}`), ...other.filter((l) => l && !setB.has(l)).map((l) => `  ${k} only: ${l.slice(0, 140)}`)];
    if (only.length) { drift++; console.log(`✘ ${a} (claude vs ${k}): ${only.length} line(s)\n${only.slice(0, 6).join('\n')}${only.length > 6 ? `\n  … +${only.length - 6} more` : ''}`); }
  }
}
console.log(drift ? `\n${drift} drift item(s).` : '✔ no drift: shared files identical, agent instructions match apart from per-tool wording.');
process.exit(drift ? 1 : 0);
