// Usage: node tools/set-models.mjs   — writes the `model:` line of every agent from models.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('models.json', 'utf8'));
let changed = 0;
for (const [agent, tier] of Object.entries(cfg.agents)) {
  const model = cfg.tiers[tier];
  const file = `.opencode/agents/${agent}.md`;
  if (!model || !existsSync(file)) { console.log(`skip ${agent} (no model for tier "${tier}" or file missing)`); continue; }
  const text = readFileSync(file, 'utf8');
  const value = /[\s()]/.test(model) ? `'${model}'` : model;
  const next = text.replace(/^model:.*$/m, `model: ${value}`);
  if (next === text) continue;
  writeFileSync(file, next); changed++;
  console.log(`${agent.padEnd(20)} → ${model}`);
}
console.log(changed ? `${changed} agent(s) updated.` : 'Nothing to change.');
// Quality warnings — the team still works, but these choices cost results.
const t = cfg.tiers; const coderModel = t[cfg.agents.coder];
if (new Set(Object.values(t)).size === 1) console.log(`⚠️  All four tiers use the same model (${t.strong}). Planning (wireframe-analyzer, fsd-planner, architect, debugger) on a fast model is where quality drops first — put your best model in "strongest".`);
if (t.reviewer === coderModel) console.log(`⚠️  The reviewer uses the coder's model (${coderModel}). A reviewer on the same model shares its blind spots — pick a different model, ideally another family.`);
