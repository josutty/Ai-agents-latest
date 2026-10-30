#!/usr/bin/env node
// Stop hook (Claude Code, MANUAL mode only) — opt in with a line `autocheck: on` in plan/run-options.md.
// When exactly one task is in progress and its tests already exist (RED recorded, or `tests: after`), run
// `node tools/task.mjs check <id>` before the session may stop. Failures go back to the model (compact, from
// plan/packs/<id>.failures.md). At most 2 automatic rounds per task, then it lets the session stop.
// Do not turn this on while the orchestrator runs — it would check tasks between the orchestrator's own steps.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { activeTasks, options, readStdinJson } from './scope-lib.mjs';

const input = readStdinJson() ?? {};
const root = input.cwd ?? process.cwd();
if (!/^autocheck:\s*on/im.test(options(root))) process.exit(0);
const tasks = activeTasks(root).filter((t) => t.status === 'in-progress');
if (tasks.length !== 1) process.exit(0);
const { id } = tasks[0];
const taskText = readFileSync(join(root, `plan/tasks/${id}.md`), 'utf8');
const history = existsSync(join(root, `plan/history/${id}.md`)) ? readFileSync(join(root, `plan/history/${id}.md`), 'utf8') : '';
const testsAfter = /^tests:\s*after/m.test(taskText);
if (!testsAfter && !/RED evidence/.test(history)) process.exit(0); // tests are still being written — RED is expected

const counter = join(root, `plan/history/${id}.autocheck`);
const rounds = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) || 0 : 0;
if (rounds >= 2) { rmSync(counter, { force: true }); process.exit(0); }

const r = spawnSync(process.execPath, [join(root, 'tools/task.mjs'), 'check', id], { cwd: root, encoding: 'utf8', timeout: 280000 });
if (r.status === 0) { rmSync(counter, { force: true }); process.exit(0); }
writeFileSync(counter, String(rounds + 1));
const fp = join(root, `plan/packs/${id}.failures.md`);
const failures = existsSync(fp) ? readFileSync(fp, 'utf8') : `${r.stdout ?? ''}`.slice(-2500);
process.stdout.write(JSON.stringify({ decision: 'block',
  reason: `Automatic check for ${id} failed (round ${rounds + 1} of 2). Fix only these, touching only the task's files, then stop:\n\n${failures.slice(0, 4000)}` }));
process.exit(0);
