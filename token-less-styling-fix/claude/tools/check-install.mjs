// Usage: node tools/check-install.mjs   — tells you in plain words whether the team is installed correctly.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';

const AGENTS = ['orchestrator','app-bootstrap','codebase-scanner','wireframe-analyzer','hybrid-api-config','schema-parser',
  'mock-data-generator','fsd-planner','coverage-checker','architect','store-architect','styling-engineer','test-engineer',
  'component-generator','coder','reviewer','debugger','researcher','reflector','library-advisor','pack-builder','pack-tester'];
const COMMANDS = ['new-project','feature','bugfix','quick','gap-fill','fix-design','status','resume','approve','reject'];
let problems = 0, warnings = 0;
const ok = (m) => console.log(`✅ ${m}`);
const bad = (m, fix) => { problems++; console.log(`❌ ${m}\n   → ${fix}`); };
const warn = (m, fix) => { warnings++; console.log(`⚠️  ${m}\n   → ${fix}`); };
const list = (d, ext) => (existsSync(d) ? readdirSync(d, { recursive: true }).filter((f) => String(f).endsWith(ext)).map(String) : []);

// 1. agents
const missing = AGENTS.filter((a) => !existsSync(`.claude/agents/${a}.md`));
if (!existsSync('.claude/agents')) bad('The ".claude/agents" folder is missing (phone file viewers and macOS Finder hide folders whose name starts with a dot, so it is easy to leave behind).', 'Unzip on the computer and copy EVERYTHING into the project root, or use agents-visible.zip (see README-CLAUDE-CODE.md).');
else if (missing.length) bad(`${missing.length} agent file(s) missing: ${missing.join(', ')}`, 'Copy the missing files into .claude/agents/.');
else ok('All 22 agents (20 team + pack-builder, pack-tester) are in .claude/agents/');
if (existsSync('.claude/agents/orchestrator.md') && !/^tools: "Agent\(/m.test(readFileSync('.claude/agents/orchestrator.md', 'utf8')))
  bad('orchestrator is not set as the main agent.', 'Re-copy orchestrator from the package.');

// 2. commands, config, rules
const noCmd = COMMANDS.filter((c) => !existsSync(`.claude/commands/${c}.md`));
noCmd.length ? warn(`Shortcut commands missing: ${noCmd.join(', ')}`, 'Copy .claude/commands/ from the zip (optional, but makes prompts one word).') : ok('Shortcut commands (/new-project, /status, /resume …) are there');
for (const f of ['AGENTS.md', 'PLAYBOOK.md', 'SENIOR-WORKFLOW.md', 'PROMPTS.md']) existsSync(f) ? ok(`${f} found`) : bad(`${f} is missing from the project root.`, 'Copy it from the zip to the project root (next to package.json).');
try { JSON.parse(readFileSync('.claude/settings.json', 'utf8')); ok('.claude/settings.json is valid'); } catch { warn('.claude/settings.json is missing or broken.', 'Copy it from the zip.'); }

const docs = ['rules/styling.md', 'rules/testing.md', 'rules/ownership.md', 'rules/ui-conventions.md', 'templates/test-engineer.md', 'templates/component-generator.md', 'templates/coder.md', 'templates/app-bootstrap.md', 'rules/libraries.md', 'rules/capability-tests.md', 'rules/design-fidelity.md', 'templates/data-grid.md', 'rules/team-protocol.md', 'rules/pinned-apis.md'].filter((d) => !existsSync(`agent-docs/${d}`));
existsSync('tools/run.mjs') ? ok('Node runner found (tools/run.mjs) — use it if PowerShell blocks npm/npx') : warn('tools/run.mjs is missing.', 'Copy tools/ from the zip — it lets agents run npm/npx when PowerShell blocks them.');
existsSync('tools/task.mjs') ? ok('Task tool found (tools/task.mjs)') : warn('tools/task.mjs is missing.', 'Copy tools/ from the zip — the senior-developer workflow needs it.');
existsSync('tools/design-spec.mjs') ? ok('Design tool found (tools/design-spec.mjs)') : bad('tools/design-spec.mjs is missing.', 'Copy tools/ from the zip — the design check needs it.');
existsSync('tools/detect-ui-capabilities.mjs') ? ok('Capability detector found (tools/detect-ui-capabilities.mjs)') : bad('tools/detect-ui-capabilities.mjs is missing.', 'Copy tools/ from the zip — wireframe-analyzer and coverage-checker need it.');
docs.length ? bad(`agent-docs is incomplete: ${docs.join(', ')}`, 'Copy the agent-docs/ folder from the zip to the project root.') : ok('agent-docs/ (rules + templates) found');

// 2a. scope: scope.md without a fresh slice
if (existsSync('inputs/scope.md')) { const sc = 'inputs/scoped/SCOPE-REPORT.md'; (!existsSync(sc) || statSync(sc).mtimeMs < statSync('inputs/scope.md').mtimeMs) ? warn('inputs/scope.md is newer than inputs/scoped/ (or the slice is missing).', 'Run: node tools/scope.mjs slice — agents read inputs/scoped/** only.') : ok('Scope slice is current (inputs/scoped/)'); }
// 2b. hooks, shipped tools, formatter
const noHook = ['scope-lib.mjs', 'pre-tool.mjs', 'format.mjs', 'stop-check.mjs'].filter((h) => !existsSync(`tools/hooks/${h}`));
noHook.length ? bad(`tools/hooks is incomplete: ${noHook.join(', ')}`, 'Copy tools/hooks/ from the zip — the task-scope, secrets and format hooks live there.') : ok('Hook scripts found (tools/hooks/)');
const noTool = ['list-html-elements.mjs', 'discover-interactions.mjs', 'check-tokens.mjs', 'check-contrast.mjs', 'lib-facts.mjs', 'scope.mjs'].filter((t) => !existsSync(`tools/${t}`));
noTool.length ? bad(`tools/ is missing ${noTool.join(', ')}`, 'Copy tools/ from the zip — they ship ready-made now (agents no longer write them).') : ok('Shipped tools found (list-html-elements, discover-interactions, check-tokens, check-contrast, lib-facts, scope)');
const settings = (() => { try { return JSON.parse(readFileSync('.claude/settings.json', 'utf8')); } catch { return {}; } })();
const hookCmds = JSON.stringify(settings.hooks ?? {});
['pre-tool.mjs', 'format.mjs', 'stop-check.mjs'].every((h) => hookCmds.includes(h))
  ? ok('Project hooks are on (.claude/settings.json): task scope + secrets, format on write, opt-in autocheck')
  : bad('The project hooks are missing from .claude/settings.json.', 'Copy .claude/settings.json from the zip (it holds the "hooks" block).');
if (settings.agent) warn(`.claude/settings.json starts every session as "${settings.agent}".`, 'For the manual workflow remove the "agent" line; start any agent with: claude --agent <name>');
if (existsSync('package.json') && !['.prettierrc', '.prettierrc.json', 'prettier.config.js', 'prettier.config.mjs'].some(existsSync) && !/"prettier"\s*:/.test(readFileSync('package.json', 'utf8')))
  warn('No Prettier config in this project, so the format hook only runs eslint --fix.', 'New projects get it from app-bootstrap Run 1. Existing projects: add .prettierrc.json only if the team agrees to the formatting change.');
if (existsSync('.mcp.json') || existsSync('.vscode/mcp.json')) warn('An MCP config is active.', 'Every enabled MCP server adds its tool list to every turn. Keep only what this session needs.');

// 3. models
if (existsSync('.claude/agents')) {
  const models = new Set(AGENTS.filter((a) => existsSync(`.claude/agents/${a}.md`)).map((a) => (readFileSync(`.claude/agents/${a}.md`, 'utf8').match(/^model:\s*(.+)$/m) ?? [])[1]).filter(Boolean));
  try { const m = JSON.parse(readFileSync('models.json', 'utf8')); if (m.tiers?.reviewer === m.tiers?.[m.agents?.coder]) warn(`The reviewer and the coder use the same model (${m.tiers.reviewer}).`, 'Pick a different reviewer model in models.json (ideally another family), then: node tools/set-models.mjs'); } catch { /* no models.json */ }
  models.size <= 1 ? warn(`Every agent uses the same model (${[...models][0] ?? 'none'}).`, 'Optional but recommended: edit models.json, then run: node tools/set-models.mjs') : ok(`${models.size} different models set`);
}

// 4. git (optional: the team also works without it — see `git: off` below)
const noGitFile = existsSync('plan/run-options.md') && /^git:\s*off/im.test(readFileSync('plan/run-options.md', 'utf8'));
let gitOk = true, isRepo = true;
try { execSync('git --version', { stdio: 'ignore' }); } catch { gitOk = false; }
if (gitOk) { try { execSync('git rev-parse --is-inside-work-tree', { stdio: 'ignore' }); } catch { isRepo = false; } }
if (noGitFile) ok('No-git mode is on (plan/run-options.md): agents skip branches and commits; tools/task.mjs uses file snapshots. Delete the "git: off" line when git works.');
else if (!gitOk) warn('Git is not installed (or not on PATH in this terminal).', 'Install Git for Windows and reopen the terminal — or work without it: create plan/run-options.md containing the line  git: off');
else if (!isRepo) warn('This folder is not a git repository.', 'Run: git init, git add -A, git commit -m initial — or work without git: create plan/run-options.md containing the line  git: off');
else { try { const hooks = execSync('git config core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); hooks === '.githooks' ? ok('Git protection is on (no commits on main)') : warn('Git protection is not on.', 'Run once: git config core.hooksPath .githooks'); } catch { warn('Git protection is not on.', 'Run once: git config core.hooksPath .githooks'); } }

// 5. inputs
const fsd = existsSync('inputs/fsd-spec.md'), ux = list('inputs/ux', '.html').length, api = list('inputs/api', '.yaml').length + list('inputs/api', '.yml').length + list('inputs/api', '.json').length;
fsd ? ok('inputs/fsd-spec.md found') : warn('inputs/fsd-spec.md not found.', 'New projects need it (or tell the orchestrator "no FSD doc — use defaults").');
ux ? ok(`${ux} wireframe file(s) in inputs/ux/`) : warn('No .html wireframes in inputs/ux/.', 'Put one .html file per screen there (subfolders are fine).');
api ? ok(`${api} API file(s) in inputs/api/`) : warn('No API file in inputs/api/.', 'Optional — without it every endpoint is mocked.');

// 6. node
const major = Number(process.versions.node.split('.')[0]), minor = Number(process.versions.node.split('.')[1]);
(major > 22 || (major === 22 && minor >= 22)) ? ok(`Node ${process.versions.node}`) : warn(`Node ${process.versions.node} is older than 22.22.`, 'Projects the team builds need Node 22.22+ (or 24.15+). Install it before the first run.');

console.log(problems ? `\n${problems} problem(s) to fix before starting.` : warnings ? `\nReady to start (${warnings} optional suggestion(s) above).` : '\nEverything is in place. Manual: follow SENIOR-WORKFLOW.md. Team run: start the orchestrator.');
process.exit(problems ? 1 : 0);
