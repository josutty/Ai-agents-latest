// Senior-developer workflow: bookkeeping, context packs and checks with ZERO model tokens.
//   node tools/task.mjs status
//   node tools/task.mjs start TASK-005        record start-sha, mark in-progress (refuses on main / dirty tree)
//   node tools/task.mjs pack  TASK-005 [--role builder|tests] [--no-rules] [--with-core]
//        (AGENTS.md is NOT copied into the pack: every supported tool already loads it. --with-core adds §1–3, §8–9.)
//   node tools/task.mjs red   TASK-005        run the task's tests: they must fail for a VALID reason (TDD proof)
//   node tools/task.mjs check TASK-005 [--design]   typecheck · eslint (task files) · steiger · related tests
//   node tools/task.mjs scope TASK-005        only the task's files changed? only approved libraries added?
//   node tools/task.mjs done  TASK-005 [--skip-design] [--no-commit] [--force]   check + scope + library → mark done → commit by path
//   node tools/task.mjs undo  TASK-005 [--yes]   NO-GIT mode: put the task's files back as they were at `start`
//   node tools/task.mjs next                    FREE: which agent to run now, with the exact prompt (use it whenever you are unsure or stuck)
//   node tools/task.mjs approve-libs <capability> [...] | --all-proposed   mark plan/library-decisions.md rows approved (Gate 1)
//   node tools/task.mjs save-plan "<message>"   commit the planning agents' output (plan/, analysis/, notes/, inputs/, PROJECT.md,
//        generated API types) — they can't commit themselves; `start` needs a clean tree
// No git (not installed, not a repository, or `git: off` in plan/run-options.md): everything still works — `start` saves a
// file snapshot + a backup of the task's files instead of a start-sha, scope compares against that snapshot, `done` skips the commit.
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { basename, dirname } from 'node:path';

const [cmd, idArg, ...rest] = process.argv.slice(2);
const flag = (n) => rest.includes(n);
const opt = (n, d) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : d; };
const tokens = (s) => Math.ceil(s.length / 4);
const read = (p) => readFileSync(p, 'utf8');
const sec = (ms) => `${(ms / 1000).toFixed(1)}s`;
const die = (m) => { console.error(`✘ ${m}`); process.exit(1); };
const q = (p) => `"${p}"`;

function sh(command) {
  const t = Date.now();
  const r = spawnSync(command, { shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), ''), ms: Date.now() - t };
}
const git = (...a) => { const r = spawnSync('git', a, { encoding: 'utf8' }); return { code: r.status ?? 1, out: (r.stdout ?? '').trim() }; };

/** Keep only what a person (or a model) needs to fix a failure. */
function compact(out, max = 30) {
  const lines = out.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() && !/node_modules/.test(l) && !/^\s*(stderr|stdout) \|/.test(l)); // library stack frames and other tests' console output are noise
  const key = lines.filter((l) => /(error|fail|✗|×|expected|received|cannot|not found|TS\d{4}|forbidden|unresolved)/i.test(l) || /\.(tsx?|jsx?|css):\d+/.test(l));
  const pick = (key.length ? key : lines.slice(-15)).map((l) => (l.length > 220 ? `${l.slice(0, 217)}…` : l));
  return pick.length > max ? [...pick.slice(0, max), `… +${pick.length - max} more line(s) — run the command to see all`] : pick;
}

// Design screenshots stay out of git (local-only ignore, no tracked change). Packs are deliberately NOT ignored: the editor's
// @ file picker skips git-ignored files, and a pack you cannot attach is useless. Older versions of this tool ignored them — undo that.
function ensureExcludes() {
  try {
    const f = '.git/info/exclude'; let ex = exists(f) ? read(f) : '';
    if (/^plan\/packs\/\s*$/m.test(ex)) { ex = ex.replace(/^plan\/packs\/\s*\n?/m, ''); writeFileSync(f, ex); console.log('ℹ️  plan/packs/ is no longer hidden from git, so the @ file picker can find your packs.'); }
    if (!ex.includes('plan/design-diff/*/*.png')) appendFileSync(f, `${ex.endsWith('\n') || !ex ? '' : '\n'}plan/design-diff/*/*.png\n`);
  } catch { /* not fatal */ }
}

// ── no-git mode ──
let GIT_OFF = null;
function noGit() {
  if (GIT_OFF !== null) return GIT_OFF;
  const opts = exists('plan/run-options.md') ? read('plan/run-options.md') : '';
  if (/^git:\s*off/im.test(opts)) return (GIT_OFF = true);
  const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  return (GIT_OFF = Boolean(r.error) || r.status !== 0);
}
function persistNoGit(reason) {
  const f = 'plan/run-options.md'; mkdirSync('plan', { recursive: true });
  const cur = exists(f) ? read(f) : '';
  if (!/^git:\s*off/im.test(cur)) appendFileSync(f, `${cur && !cur.endsWith('\n') ? '\n' : ''}git: off   # ${reason}\n`);
}
const SKIP = ['node_modules', '.git', 'dist', 'coverage', 'storybook-static', 'playwright-report', 'test-results', '.cache', '.vite', '.turbo', '.next'];
function walk(dir = '.', skip = null, out = {}) {
  const sk = skip ?? new Set([...SKIP, ...(exists('.gitignore') ? read('.gitignore').split('\n').map((l) => l.trim().replace(/^\//, '').replace(/\/$/, '')).filter((l) => l && !l.startsWith('#') && !/[*?!/]/.test(l)) : [])]);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = dir === '.' ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) { if (!sk.has(e.name) && p !== 'plan/packs') walk(p, sk, out); }
    else if (e.isFile()) { const st = statSync(p); out[p] = st.size > 2e6 ? `big:${st.size}:${Math.round(st.mtimeMs)}` : createHash('sha1').update(readFileSync(p)).digest('hex'); }
  }
  return out;
}
const snapPath = (id) => `plan/history/${id}.snapshot.json`;
function takeSnapshot(id, t) {
  const files = walk(); const backup = `plan/history/${id}.backup`; rmSync(backup, { recursive: true, force: true });
  const saved = [];
  for (const f of t.files) if (exists(f.path)) { mkdirSync(dirname(`${backup}/${f.path}`), { recursive: true }); copyFileSync(f.path, `${backup}/${f.path}`); saved.push(f.path); }
  writeFileSync(snapPath(id), JSON.stringify({ taken: new Date().toISOString(), files, backups: saved, pkg: exists('package.json') ? read('package.json') : null }));
  return { count: Object.keys(files).length, saved: saved.length };
}
function changedSinceSnapshot(id) {
  const snap = JSON.parse(read(snapPath(id))); const now = walk();
  return [...Object.keys(now).filter((p) => snap.files[p] !== now[p]), ...Object.keys(snap.files).filter((p) => !(p in now))].sort();
}

// ── parsing ──
const cells = (line) => line.split('|').slice(1, -1).map((c) => c.trim());
function parseTask(id) {
  if (!/^(TASK|BUG)-\d+$/.test(id ?? '')) die('give a task id, e.g. TASK-005');
  const file = `plan/tasks/${id}.md`;
  if (!existsSync(file)) die(`${file} not found`);
  const text = read(file);
  const fm = Object.fromEntries((text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '').split('\n').map((l) => l.match(/^([\w-]+):\s*([^#]*)/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  const sections = {}; let cur = '';
  for (const line of text.split('\n')) { const h = line.match(/^## (.+)/); if (h) { cur = h[1].trim(); sections[cur] = []; } else if (cur) sections[cur].push(line); }
  const body = (name) => (sections[name] ?? []).join('\n');
  const files = (sections.Files ?? []).filter((l) => l.startsWith('|')).map(cells).filter((c) => c[0] && !/^(Path|-+)$/i.test(c[0].replace(/[`:-]/g, '')) && !/^-+$/.test(c[0]))
    .map((c) => ({ path: c[0].replace(/`/g, ''), kind: c[1] ?? '', owner: c[2] ?? '', mode: (c[3] ?? '').toLowerCase() }));
  const design = body('Design');
  return { id, file, text, fm, files, title: text.match(/^# .+/m)?.[0].replace(/^#\s*/, '') ?? id, depends: (fm['depends-on'] ?? '').match(/(TASK|BUG)-\d+/g) ?? [],
    components: [...text.matchAll(/^### (\w+)/gm)].map((m) => m[1]), source: design.match(/Source:\s*(\S+)/)?.[1], spec: design.match(/Spec:\s*(\S+)/)?.[1],
    route: design.match(/Route:\s*(\/\S*)/)?.[1], templates: [...text.matchAll(/Template:\s*`?(agent-docs\/templates\/[\w.-]+)`?/g)].map((m) => m[1]),
    isPage: false, sections };
}
const withPage = (t) => ({ ...t, isPage: t.files.some((f) => f.path.startsWith('src/pages/')) });
const loadTask = (id) => withPage(parseTask(id));
const exists = (p) => existsSync(p);

function progress() {
  if (!exists('plan/PROGRESS.md')) die('plan/PROGRESS.md not found — run the architect first');
  return read('plan/PROGRESS.md').split('\n').filter((l) => /^\|\s*(TASK|BUG)-\d+\s*\|/.test(l)).map((l) => { const c = cells(l); return { id: c[0], slice: c[1], goal: c[2], depends: c[3] ?? '', status: c[c.length - 1] }; });
}
function setStatus(id, status) {
  const p = 'plan/PROGRESS.md';
  writeFileSync(p, read(p).split('\n').map((l) => { if (!new RegExp(`^\\|\\s*${id}\\s*\\|`).test(l)) return l; const c = cells(l); c[c.length - 1] = status; return `| ${c.join(' | ')} |`; }).join('\n'));
  const f = `plan/tasks/${id}.md`;
  if (exists(f)) writeFileSync(f, read(f).replace(/^status:.*$/m, `status: ${status}`));
}
const historyFile = (id) => `plan/history/${id}.md`;
const startInfo = (id) => { const t = exists(historyFile(id)) ? read(historyFile(id)) : ''; return { sha: t.match(/^start-sha:\s*(\w+)/m)?.[1], snap: exists(snapPath(id)), started: t.match(/^started:\s*(\S+)/m)?.[1], red: /RED evidence/.test(t) }; };

// ── commands ──
function status() {
  const rows = progress(); const done = new Set(rows.filter((r) => r.status === 'done').map((r) => r.id));
  const count = (s) => rows.filter((r) => r.status === s).length;
  const show = rows.length > 40 ? rows.filter((r) => r.status !== 'done') : rows;
  console.log('| Task | Slice | Goal | Status |\n|---|---|---|---|');
  for (const r of show) console.log(`| ${r.id} | ${r.slice} | ${r.goal.slice(0, 50)} | ${r.status} |`);
  const ready = rows.filter((r) => r.status === 'open' && (r.depends.match(/(TASK|BUG)-\d+/g) ?? []).every((d) => done.has(d)));
  console.log(`\n${count('done')} done · ${count('in-progress')} in progress · ${count('open')} open${rows.length > 40 ? ` (${count('done')} done rows hidden)` : ''}`);
  console.log(ready.length ? `Ready next: ${ready.slice(0, 6).map((r) => r.id).join(', ')}` : 'Ready next: none (everything open is waiting on a dependency)');
}

function start(id) {
  const t = loadTask(id); const off = noGit(); let branch = '';
  if (off) {
    persistNoGit('git not available or not a repository — snapshot mode');
  } else {
    branch = git('branch', '--show-current').out;
    const base = exists('PROJECT.md') ? read('PROJECT.md').match(/^base-branch:\s*(\S+)/m)?.[1] : undefined;
    if (['main', 'master', 'develop', base].includes(branch)) die(`you are on "${branch}" — work on a feat/ or fix/ branch (git checkout -b feat/<name>)`);
    const dirty = git('status', '--porcelain').out.split('\n').filter(Boolean).filter((l) => !l.slice(3).startsWith('plan/packs/')); // packs are untracked on purpose
    if (dirty.length && !flag('--force')) die(`working tree not clean (${dirty.length} change(s): ${dirty.slice(0, 5).map((l) => l.slice(3)).join(', ')}) — commit or stash first, or use --force`);
  }
  const done = new Set(progress().filter((r) => r.status === 'done').map((r) => r.id));
  const waiting = t.depends.filter((d) => !done.has(d));
  if (waiting.length) console.log(`⚠️  depends on ${waiting.join(', ')} — not done yet`);
  mkdirSync('plan/history', { recursive: true });
  const info = startInfo(id); let detail;
  if (off) {
    if (!info.snap) { const r = takeSnapshot(id, t); detail = `no git · snapshot of ${r.count} file(s), ${r.saved} task file(s) backed up`; }
    else detail = 'no git · snapshot already exists (resuming)';
    if (!/^snapshot:/m.test(exists(historyFile(id)) ? read(historyFile(id)) : '')) appendFileSync(historyFile(id), `${exists(historyFile(id)) ? '\n' : ''}snapshot: ${snapPath(id)}\nstarted: ${new Date().toISOString()}\n`);
  } else {
    if (!info.sha) appendFileSync(historyFile(id), `${exists(historyFile(id)) ? '\n' : ''}start-sha: ${git('rev-parse', 'HEAD').out}\nstarted: ${new Date().toISOString()}\n`);
    detail = `on ${branch} · start-sha ${(info.sha ?? git('rev-parse', 'HEAD').out).slice(0, 8)}`;
  }
  setStatus(id, 'in-progress');
  console.log(`✔ ${id} started (${detail})`);
  console.log(`  ${t.title}\n  next: node tools/task.mjs pack ${id}${t.fm.tests === 'first' ? ' --role tests   (tests first)' : ''}`);
}

const fence = (path, body) => `### ${path}\n\`\`\`${path.split('.').pop()}\n${body}\n\`\`\``;
function tableRows(path, needles) {
  if (!exists(path)) return null;
  const lines = read(path).split('\n'); const table = lines.filter((l) => l.startsWith('|'));
  if (table.length <= 14) return needles.some((n) => n && lines.join('\n').toLowerCase().includes(n.toLowerCase())) ? lines.join('\n').trim() : null; // small file: only if it mentions this task
  const head = table.slice(0, 2); const hits = table.slice(2).filter((l) => needles.some((n) => n && l.toLowerCase().includes(n.toLowerCase())));
  return hits.length ? [...head, ...hits].join('\n') : null;
}
function pack(id) {
  const t = loadTask(id); const role = opt('--role', 'builder');
  if (!['builder', 'tests'].includes(role)) die('--role is builder or tests');
  const parts = []; const add = (title, text) => { if (text) parts.push({ title, text: `## ${title}\n\n${text.trim()}\n` }); };
  const slices = [...new Set(t.files.map((f) => f.path.match(/^src\/(\w+)\/([\w-]+)/)).filter(Boolean).map((m) => `${m[1]}/${m[2]}`))];
  const needles = [...t.components, ...slices];

  add('The task', t.text.replace(/^---[\s\S]*?---\n/, '').trim());
  if (role === 'builder') {
    add('Design spec (measured — copy labels exactly)', t.spec && exists(t.spec) ? read(t.spec).replace(/^# .*\n+/, '') : (t.spec ? `(${t.spec} not found — run: node tools/design-spec.mjs extract ${t.source ?? '<screen>'})` : ''));
    add('Display rules', tableRows('analysis/display-rules.md', needles));
    add('Library decisions', tableRows('plan/library-decisions.md', needles));
    add('API used here', tableRows('plan/api-integration-points.md', slices));
  }
  const isTest = (f) => /test|spec/i.test(`${f.owner} ${f.kind}`);
  // builder: files to edit + the tests to satisfy · tests: test files to edit + code that already exists (tests-after tasks)
  const include = t.files.filter((f) => exists(f.path) && (role === 'builder' ? f.mode.startsWith('edit') || isTest(f) : isTest(f) ? f.mode.startsWith('edit') : f.mode.startsWith('new')));
  add('Existing files you need', include.map((f) => { const ls = read(f.path).split('\n'); return fence(f.path, ls.length > 220 ? `${ls.slice(0, 220).join('\n')}\n// … ${ls.length - 220} more lines — open the file if you need them` : ls.join('\n')); }).join('\n\n'));
  const own = new Set(t.files.map((f) => f.path));
  const refs = new Set(); for (const m of t.text.matchAll(/(?:@|\b)(entities|features|widgets|shared|pages)\/([\w-]+)(?:\/([\w-]+))?/g)) refs.add(m[1] === 'shared' ? `src/shared/${m[2]}/index.ts` : `src/${m[1]}/${m[2]}/index.ts`);
  const apis = [...refs].filter((p) => exists(p) && !own.has(p)).slice(0, 8);
  add('Public APIs you may import (signatures)', apis.map((p) => fence(p, read(p).split('\n').slice(0, 60).join('\n'))).join('\n\n'));
  if (!flag('--no-rules')) {
    // Only the rule text this task can use. ui-conventions is split by its bold topics; design-fidelity's tool notes only for page tasks.
    const text = t.text.toLowerCase();
    const uiWanted = (topic) => {
      const k = topic.toLowerCase();
      if (k.startsWith('forms')) return /\b(form|input|field|submit|schema|zod|validation)\b/.test(text);
      if (k.startsWith('routing')) return t.isPage || /\b(route|router|auth|sign-?in|guard)\b/.test(text);
      if (k.startsWith('performance') || k.startsWith('responsive')) return t.isPage;
      return true; // accessibility, text/numbers/dates
    };
    const uiConventions = (body) => {
      const blocks = body.split(/^(?=\*\*[^*\n]+\*\*\s*$)/m);
      return blocks.filter((b) => { const m = b.match(/^\*\*([^*\n]+)\*\*/); return !m || uiWanted(m[1]); }).join('').trim();
    };
    const fidelity = (body) => (t.isPage ? body : (body.match(/^## Rules[\s\S]*/m)?.[0] ?? body));
    const trimDoc = (p) => { const b = read(p).replace(/^# .*\n+(Part of AGENTS\.md[^\n]*\n+)?/, ''); return p.endsWith('ui-conventions.md') ? uiConventions(b) : p.endsWith('design-fidelity.md') ? fidelity(b) : b; };
    const docs = [...(role === 'builder' ? ['agent-docs/rules/styling.md', 'agent-docs/rules/ui-conventions.md', 'agent-docs/rules/design-fidelity.md'] : ['agent-docs/rules/testing.md', 'agent-docs/rules/capability-tests.md']), 'agent-docs/rules/pinned-apis.md'];
    // AGENTS.md is already in every session (CLAUDE.md @import / OpenCode / Copilot) — copy its sections only on request
    const want = role === 'builder' ? [1, 2, 3, 8, 9] : [1, 2, 3, 8];
    const core = flag('--with-core') && exists('AGENTS.md') ? read('AGENTS.md').split(/^(?=## )/m).filter((x) => want.includes(Number(x.match(/^## (\d+)\./)?.[1]))).join('\n').trim() : '';
    add('Rules', [core, ...docs.filter(exists).map(trimDoc)].filter(Boolean).join('\n\n---\n\n'));
  }
  const tpls = role === 'tests' ? ['agent-docs/templates/test-engineer.md'] : t.templates;
  add('Templates', tpls.filter(exists).map((p) => `### ${p}\n\n${read(p).replace(/^# .*\n+/, '')}`).join('\n\n'));
  const checks = `node tools/task.mjs check ${id}${t.isPage ? ' --design' : ''}`;
  const verify = role === 'tests'
    ? `**Before you stop:** run \`node tools/task.mjs red ${id}\` once. It must report a valid RED; a "suspect" or "already PASS" result means a test is wrong — fix the test (max 2 rounds).\n`
    : `**Before you stop:** run \`${checks}\` (it prints only failures and writes plan/packs/${id}.failures.md). Fix only what it lists, at most 2 rounds; still failing → stop and say what is left.\n`;
  const header = `# Context pack — ${id} (${role})\n\n**Read ONLY this file** plus the files you create or edit. AGENTS.md is already in your context — do not re-read it, do not open other plan/ or analysis/ files and do not search the repo for conventions; what you need is below.\n**Touch ONLY the files in the task's Files table** (a hook blocks the others while the task is in progress). Do not run the whole test suite, lint the whole project or build Storybook.\n${role === 'tests' ? 'Write the tests only; they must FAIL now for a valid reason (assertion, or a `new` file that does not exist yet).\n' : 'Make the task\'s tests pass and match the design spec exactly. Never invent text, colors or behaviour the spec and display rules do not show.\n'}${verify}When finished: list the files you changed and stop (team agents: then your HANDOFF line).\n`;
  mkdirSync('plan/packs', { recursive: true });
  const outPath = `plan/packs/${id}.${role}.md`; const full = `${header}\n${parts.map((p) => p.text).join('\n')}`;
  writeFileSync(outPath, full);
  console.log(`✔ ${outPath} — ~${tokens(full).toLocaleString()} tokens`);
  for (const p of parts) console.log(`   ${String(tokens(p.text)).padStart(6)}  ${p.title}`);
  console.log(`   attach it to a NEW session (pack-${role === 'tests' ? 'tester' : 'builder'} agent, or a plain session) and say: "${role === 'tests' ? 'Write the tests for' : 'Implement'} ${id} exactly as this pack says."`);
  console.log(`   @ picker doesn't list it? say instead: "Read the file ${outPath} and ${role === 'tests' ? 'write the tests for' : 'implement'} ${id} exactly as it says."`);
}

function stepList(t, { design }) {
  const exist = t.files.filter((f) => exists(f.path)).map((f) => f.path);
  const ts = exist.filter((p) => /\.(ts|tsx)$/.test(p));
  const tests = ts.filter((p) => /\.(test|spec)\.(ts|tsx)$/.test(p) && !p.startsWith('e2e/'));
  const srcOnly = ts.filter((p) => !/\.(test|spec|stories)\.(ts|tsx)$/.test(p) && !p.startsWith('e2e/'));
  const pkg = exists('package.json') ? JSON.parse(read('package.json')) : {};
  const hasSteiger = exists('steiger.config.ts') || exists('steiger.config.js') || pkg.devDependencies?.steiger;
  const steps = [{ name: 'typecheck', cmd: pkg.scripts?.typecheck ? 'npm run typecheck --silent' : 'npx tsc --noEmit' }];
  if (ts.length) steps.push({ name: 'eslint (task files)', cmd: `npx eslint ${ts.map(q).join(' ')}` });
  if (hasSteiger) steps.push({ name: 'steiger (FSD rules)', cmd: 'npx steiger ./src' });
  if (srcOnly.length || tests.length) steps.push({ name: 'tests (related)', cmd: `npx vitest related ${[...srcOnly, ...tests].map(q).join(' ')} --run --reporter=dot --passWithNoTests` });
  if (design) {
    if (t.source && t.route) steps.push({ name: 'design vs build', cmd: `node tools/design-spec.mjs compare ${q(t.source)} ${t.route} --start`, design: true });
    else console.log('⚠️  no design check: the task has no "Source:" and "Route:" in its Design section');
  }
  return steps;
}
function designLines(t) {
  const name = (() => { const [f, s] = t.source.split('#'); return `${basename(f, '.html')}${s ? `-${s}` : ''}`; })();
  const p = `plan/design-diff/${name}/differences.md`; if (!exists(p)) return [];
  return read(p).split('\n').filter((l) => /^\| (content|rule|layout|look) /.test(l)).slice(0, 25);
}
function check(id, { design }) {
  const t = loadTask(id); const results = []; const failures = [];
  for (const s of stepList(t, { design })) {
    const r = sh(s.cmd); const ok = r.code === 0; results.push({ ...s, ok, ms: r.ms });
    console.log(`${ok ? '✔' : '✘'} ${s.name} (${sec(r.ms)})`);
    if (!ok) { const lines = s.design ? designLines(t) : compact(r.out); const block = [`### ${s.name}`, `command: ${s.cmd}`, ...lines.map((l) => `  ${l}`)]; failures.push(block.join('\n')); console.log(lines.map((l) => `    ${l}`).join('\n')); }
  }
  mkdirSync('plan/packs', { recursive: true });
  const fp = `plan/packs/${id}.failures.md`;
  if (failures.length) { writeFileSync(fp, `# Failures for ${id}\n\nFix only these. Touch only the files in the task's Files table.\n\n${failures.join('\n\n')}\n`); console.log(`\n✘ ${failures.length} check(s) failed → send the agent plan/packs/${id}.failures.md (not the full logs)`); }
  else { rmSync(fp, { force: true }); console.log('\n✔ all checks passed'); }
  return { ok: !failures.length, results };
}

function libraryCheck(oldText) {
  if (!oldText || !exists('package.json')) return { ok: true, added: [] };
  const deps = (j) => ({ ...(j.dependencies ?? {}), ...(j.devDependencies ?? {}) });
  const before = deps(JSON.parse(oldText)), after = deps(JSON.parse(read('package.json')));
  const added = Object.keys(after).filter((k) => before[k] !== after[k]);
  const approved = new Set(); const ld = 'plan/library-decisions.md';
  if (exists(ld)) for (const l of read(ld).split('\n').filter((x) => x.startsWith('|'))) { const c = cells(l); if (/^approved/i.test(c[c.length - 1] ?? '')) for (const m of (c[4] ?? '').matchAll(/(@?[\w./-]+?)@[\^~]?[\w.*-]+/g)) approved.add(m[1]); }
  const bad = added.filter((k) => !approved.has(k)); return { ok: !bad.length, added, bad };
}
function changedFiles(sha) {
  const tracked = git('diff', '--name-only', sha).out.split('\n'); const fresh = git('ls-files', '--others', '--exclude-standard').out.split('\n');
  return [...new Set([...tracked, ...fresh])].filter(Boolean).map((f) => f.replace(/\\/g, '/'));
}
function scope(id, quiet = false) {
  const t = loadTask(id); const info = startInfo(id); const off = noGit();
  if (off ? !info.snap : !info.sha) { console.log(`✘ no ${off ? 'snapshot' : 'start-sha'} for ${id} — run: node tools/task.mjs start ${id}`); return { ok: false }; }
  const allowed = new Set([...t.files.map((f) => f.path), 'plan/PROGRESS.md', historyFile(id), t.file]);
  const generated = (f) => f.startsWith('plan/design-diff/') || f.startsWith('plan/packs/') || f.startsWith(`plan/history/${id}.`); // design report, packs, no-git snapshot + backup
  const changed = off ? changedSinceSnapshot(id) : changedFiles(info.sha); const pkgChanged = changed.filter((f) => f === 'package.json' || f === 'package-lock.json');
  const extra = changed.filter((f) => !allowed.has(f) && !pkgChanged.includes(f) && !generated(f));
  const missing = t.files.filter((f) => f.mode.startsWith('new') && !exists(f.path)).map((f) => f.path);
  const oldPkg = off ? JSON.parse(read(snapPath(id))).pkg : (git('show', `${info.sha}:package.json`).code ? null : git('show', `${info.sha}:package.json`).out);
  const lib = libraryCheck(oldPkg);
  const ok = !extra.length && lib.ok;
  if (!quiet || !ok) {
    console.log(`${extra.length ? '✘' : '✔'} scope: ${changed.filter((f) => allowed.has(f)).length} task file(s) changed${extra.length ? `, ${extra.length} OUTSIDE the Files table: ${extra.join(', ')}` : ''}`);
    console.log(`${lib.ok ? '✔' : '✘'} libraries: ${lib.added.length ? `added ${lib.added.join(', ')}${lib.ok ? ' (approved)' : ` — NOT approved in plan/library-decisions.md: ${lib.bad.join(', ')}`}` : 'no dependency changes'}`);
    if (missing.length) console.log(`⚠️  files listed as new but not created: ${missing.join(', ')}`);
  }
  return { ok, pkgChanged, lib };
}

function undo(id) {
  const t = loadTask(id);
  if (!noGit()) { const sha = startInfo(id).sha ?? '<start-sha>'; console.log(`Git is on — undo with:\n  git restore --source=${sha} -- ${t.files.map((f) => f.path).join(' ')}\n(delete files that were new in this task by hand)`); return; }
  if (!startInfo(id).snap) die(`no snapshot for ${id} — nothing to undo (start it first)`);
  const snap = JSON.parse(read(snapPath(id))); const backup = `plan/history/${id}.backup`; const plan = [];
  for (const f of t.files) { if (snap.backups.includes(f.path)) plan.push({ f: f.path, act: 'restore' }); else if (exists(f.path)) plan.push({ f: f.path, act: 'delete' }); }
  console.log(plan.length ? plan.map((x) => `  ${x.act === 'restore' ? 'restore' : 'delete '} ${x.f}${x.act === 'delete' ? '   (did not exist when the task started)' : ''}`).join('\n') : '  nothing to change');
  if (!flag('--yes')) { console.log('\nThis only touches the files in the task\'s Files table. Run again with --yes to apply.'); return; }
  for (const x of plan) {
    if (x.act === 'restore') copyFileSync(`${backup}/${x.f}`, x.f);
    else { rmSync(x.f, { force: true }); for (let d = dirname(x.f); d !== '.' && d !== 'src' && exists(d) && !readdirSync(d).length; d = dirname(d)) rmSync(d, { recursive: true }); } // drop folders the task created
  }
  setStatus(id, 'open');
  console.log(`\n✔ ${plan.length} file(s) put back; ${id} is open again (changes outside the Files table cannot be undone without git)`);
}

function red(id) {
  const t = loadTask(id); const tests = t.files.map((f) => f.path).filter((p) => exists(p) && /\.(test|spec)\.(ts|tsx)$/.test(p) && !p.startsWith('e2e/'));
  if (!tests.length) die('no unit test files from the Files table exist yet — write the tests first');
  const cmd = `npx vitest run ${tests.map(q).join(' ')} --reporter=dot`; const r = sh(cmd);
  const valid = /(Failed to resolve import|Cannot find module|AssertionError|expected .* to|Unable to find|toBe\w*|toHave\w*)/.test(r.out) && !/(SyntaxError|ReferenceError|Transform failed|No test suite found|is not defined)/.test(r.out);
  let verdict; if (r.code === 0) verdict = '✘ the tests already PASS — not a valid RED (a test must fail before the code exists)';
  else if (valid) verdict = '✔ valid RED: tests fail on assertions or on files that do not exist yet'; else verdict = '✘ SUSPECT RED: the failure looks like a broken test (syntax / reference / setup), not a missing implementation';
  console.log(verdict); console.log(compact(r.out, 12).map((l) => `    ${l}`).join('\n'));
  if (!exists(historyFile(id))) mkdirSync('plan/history', { recursive: true });
  appendFileSync(historyFile(id), `RED evidence: \`${cmd}\` → ${r.code === 0 ? 'passed (invalid)' : valid ? 'valid RED' : 'suspect'}\n`);
  process.exit(r.code !== 0 && valid ? 0 : 1);
}

function done(id) {
  const t = loadTask(id); const info = startInfo(id);
  const r = check(id, { design: t.isPage && !flag('--skip-design') }); const s = scope(id);
  if (t.fm.tests === 'first' && !info.red && t.id.startsWith('TASK')) console.log(`⚠️  tests: first — no RED proof recorded (node tools/task.mjs red ${id} before building)`);
  if (!r.ok || !s.ok) { console.log(`\n✘ ${id} is NOT done — fix the items above and run done again`); process.exit(1); }
  const time = (n) => r.results.find((x) => x.name.startsWith(n)); const dur = (n) => (time(n) ? sec(time(n).ms) : 'n/a');
  const now = new Date(); const mins = info.started ? Math.round((now - new Date(info.started)) / 60000) : null;
  setStatus(id, 'done');
  writeFileSync(historyFile(id), read(historyFile(id)).replace(/\n⏱ manual[^\n]*\nDone [^\n]*\n/g, '\n')); // re-running done replaces the earlier result
  appendFileSync(historyFile(id), `\n⏱ manual${mins !== null ? ` ${mins} min` : ''} · typecheck ${dur('typecheck')} · lint ${dur('eslint')} · tests ${dur('tests')} · design ${dur('design')}\nDone ${now.toISOString()} — checks, scope and libraries passed (tools/task.mjs)\n`);
  if (flag('--no-commit')) { console.log(`\n✔ ${id} marked done (not committed)`); return; }
  if (noGit()) { console.log(`\n✔ ${id} done${mins !== null ? ` · ${mins} min` : ''} — no git, so nothing was committed (your files are in place). Undo: node tools/task.mjs undo ${id}`); console.log('  next: node tools/task.mjs status'); return; }
  const reports = changedFiles(info.sha ?? 'HEAD').filter((f) => /^plan\/design-diff\/[^/]+\/differences\.md$/.test(f));
  const paths = [...t.files.map((f) => f.path).filter((p) => exists(p) || git('ls-files', '--', p).out), 'plan/PROGRESS.md', historyFile(id), t.file, ...(s.pkgChanged ?? []), ...reports];
  const add = git('add', '--', ...paths); if (add.code) die(`git add failed: ${add.out}`);
  const c = spawnSync('git', ['commit', '-m', `${id}(manual): ${t.title.replace(/^[\w-]+:\s*/, '')}`], { encoding: 'utf8' });
  if (c.status) die(`commit failed (pre-commit hook?): ${(c.stderr || c.stdout).trim().split('\n').slice(0, 3).join(' | ')}`);
  console.log(`\n✔ ${id} done · committed ${git('rev-parse', '--short', 'HEAD').out}${mins !== null ? ` · ${mins} min` : ''}`);
  console.log('  next: node tools/task.mjs status');
}

const PLAN_PATHS = (f) => (/^(plan|analysis|notes|inputs)\//.test(f) && !f.startsWith('plan/packs/') && !/^plan\/design-diff\/.*\.png$/.test(f))
  || f === 'PROJECT.md' || f.startsWith('src/shared/api/generated/');
function savePlan(message) {
  if (noGit()) { console.log('No git (git: off) — nothing to commit; the plan files are already in place.'); return; }
  const branch = git('branch', '--show-current').out;
  const base = exists('PROJECT.md') ? read('PROJECT.md').match(/^base-branch:\s*(\S+)/m)?.[1] : undefined;
  if (['main', 'master', 'develop', base].includes(branch)) die(`you are on "${branch}" — app-bootstrap Run 1 / Run B creates the work branch first`);
  const changed = (spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
  const take = changed.filter(PLAN_PATHS); const left = changed.filter((f) => !PLAN_PATHS(f) && !f.startsWith('plan/packs/'));
  if (!take.length) { console.log('✔ nothing to save — the plan is already committed'); if (left.length) console.log(`⚠️  other changes (not plan files): ${left.slice(0, 8).join(', ')}${left.length > 8 ? ' …' : ''}`); return; }
  const add = git('add', '--', ...take); if (add.code) die(`git add failed: ${add.out}`);
  const c = spawnSync('git', ['commit', '-m', `plan: ${message || 'planning output'}`], { encoding: 'utf8' });
  if (c.status) die(`commit failed (pre-commit hook?): ${(c.stderr || c.stdout).trim().split('\n').slice(0, 3).join(' | ')}`);
  console.log(`✔ saved ${take.length} plan file(s) · ${git('rev-parse', '--short', 'HEAD').out}`);
  if (left.length) console.log(`⚠️  not included — these belong to an agent that commits its own files, or to you:\n   ${left.join('\n   ')}`);
}

function approveLibs(names) {
  const f = 'plan/library-decisions.md'; if (!exists(f)) die(`${f} not found — the library-advisor writes it`);
  const all = names.includes('--all-proposed'); const want = new Set(names.filter((n) => !n.startsWith('--')).map((n) => n.toLowerCase()));
  if (!all && !want.size) die('usage: node tools/task.mjs approve-libs <capability> [...] | --all-proposed');
  const done = []; const lines = read(f).split('\n').map((l) => {
    if (!/^\|/.test(l) || /^\|\s*-/.test(l)) return l; const c = cells(l); const status = (c[c.length - 1] ?? '').toLowerCase();
    if (!['proposed', 'needs-approval'].includes(status) || !(all ? status === 'proposed' : want.has((c[0] ?? '').toLowerCase()))) return l;
    done.push(`${c[0]} → ${c[3]}`); return l.replace(/\|\s*(proposed|needs-approval)\s*\|\s*$/i, '| approved |');
  });
  if (!done.length) { console.log('Nothing to approve (no matching proposed / needs-approval rows).'); return; }
  writeFileSync(f, lines.join('\n')); console.log(`✔ approved ${done.length} row(s):\n  ${done.join('\n  ')}\n  next: app-bootstrap Run L installs them`);
}

function next() {
  const rows = progress(); const doneIds = new Set(rows.filter((r) => r.status === 'done').map((r) => r.id));
  const active = rows.filter((r) => r.status === 'in-progress');
  const say = (...l) => console.log(l.join('\n'));
  const stuck = `\nStuck?  • agent ends BLOCKED-DESIGN, or a tool was denied → add the file it names to the Files table of plan/tasks/<id>.md (owner + mode), then run the SAME agent again — do not retry by hand\n        • same check fails twice → agent: debugger (Mode: bugfix, mode=diagnose, with plan/packs/<id>.failures.md)\n        • never switch to the orchestrator in the middle of a task: it re-plans and costs 3–5× more`;
  if (active.length > 1) say(`⚠️  ${active.length} tasks are in progress (${active.map((r) => r.id).join(', ')}). Finish one: node tools/task.mjs done <id>, or set the others back to open.`);
  if (!active.length) {
    const ready = rows.filter((r) => r.status === 'open' && (r.depends.match(/(TASK|BUG)-\d+/g) ?? []).every((d) => doneIds.has(d)));
    if (ready.length) { const r = ready[0]; return say(`Next task: ${r.id} — ${r.goal.slice(0, 70)}`, `  1. node tools/task.mjs start ${r.id}`, `  2. node tools/task.mjs next        (it will name the agent)`, `(then ${ready.length - 1} more ready, ${rows.filter((x) => x.status === 'open').length - ready.length} waiting on dependencies)`); }
    const open = rows.filter((x) => x.status === 'open');
    if (open.length) return say(`Nothing is ready: ${open.map((r) => r.id).join(', ')} wait on a dependency that is not done. node tools/task.mjs status`);
    return say(`All ${rows.length} task(s) done.`, `  agent: reviewer — "Mode: <mode>. scope=release."   (a different model than the coder, once)`, `  then agent: coverage-checker — "stage=release."   (skip it for a small scope — the reviewer already checks the design)`);
  }
  const id = active[0].id; const t = loadTask(id); const info = startInfo(id);
  const isTestFile = (f) => /\.(test|spec)\.(ts|tsx)$/.test(f.path) || /^(test|e2e)\//.test(f.path);
  const other = [...new Set(t.files.map((f) => f.owner.toLowerCase()))].filter((o) => o && !['coder', 'component-generator', 'test-engineer', 'pack-builder', 'pack-tester'].includes(o));
  const prodMissing = t.files.filter((f) => !isTestFile(f) && f.mode.startsWith('new') && !exists(f.path));
  const testsAfter = /^after/i.test(t.fm.tests ?? ''); const failures = `plan/packs/${id}.failures.md`;
  say(`${id} — ${t.title.replace(/^[\w-]+:\s*/, '')}  (${t.files.length} files, tests: ${testsAfter ? 'after' : 'first'})`);
  if (other.length) say(`\n⚠️  The Files table lists owner(s): ${other.join(', ')} — if those rows are not done yet, run that agent for them first.`);
  const tester = () => say(`\nNEXT → agent: pack-tester  (new session)`, `  node tools/task.mjs pack ${id} --role tests`, `  attach plan/packs/${id}.tests.md:  "Write the tests for ${id} exactly as this pack says."`, `  it ends with a "valid RED" line (it runs the check itself). Then run: node tools/task.mjs next`);
  const builder = () => say(`\nNEXT → agent: pack-builder  (new session)`, `  node tools/task.mjs pack ${id}`, `  attach plan/packs/${id}.builder.md:  "Implement ${id} exactly as this pack says."`, `  it runs the check itself (max 2 fix rounds). Then run: node tools/task.mjs next`);
  if (exists(failures)) { say(`\nLast check FAILED → agent: pack-builder  (same session if still open, else a new one)`, `  attach plan/packs/${id}.failures.md:  "Fix these failures. Touch only the task's files."`, `  (do not paste logs; a second failure of the same check → debugger)`); return say(stuck); }
  if (!testsAfter && !info.red) { tester(); return say(stuck); }
  if (prodMissing.length || (testsAfter && !exists(`plan/history/${id}.built`) && !t.files.some((f) => !isTestFile(f) && exists(f.path)))) { if (prodMissing.length) say(`  still to create: ${prodMissing.slice(0, 4).map((f) => f.path).join(', ')}${prodMissing.length > 4 ? ' …' : ''}`); builder(); return say(stuck); }
  if (testsAfter && !t.files.some((f) => isTestFile(f) && exists(f.path))) { tester(); return say(stuck); }
  say(`\nNEXT → no agent needed:  node tools/task.mjs done ${id}`, `  (runs typecheck, eslint, steiger, the task's tests${t.isPage ? ', the design check' : ''}, scope and libraries — free — then commits)`, `  it prints a failures file if something is wrong; then run: node tools/task.mjs next`);
  say(stuck);
}

const help = () => console.log(read(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')).split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
if (!['status', 'help', 'save-plan', 'approve-libs', 'next', undefined].includes(cmd) && !noGit()) ensureExcludes();
const run = { status, start: () => start(idArg), pack: () => pack(idArg), red: () => red(idArg), check: () => { const r = check(idArg, { design: flag('--design') }); process.exit(r.ok ? 0 : 1); }, scope: () => { const s = scope(idArg); process.exit(s.ok ? 0 : 1); }, done: () => done(idArg), undo: () => undo(idArg), next: () => next(), 'approve-libs': () => approveLibs([idArg, ...rest].filter(Boolean)), 'save-plan': () => savePlan([idArg, ...rest].filter(Boolean).join(' ')), help };
(run[cmd] ?? help)();
