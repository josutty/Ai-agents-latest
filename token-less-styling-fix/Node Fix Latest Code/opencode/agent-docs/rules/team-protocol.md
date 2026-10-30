# Team protocol — §0, §0b, §0c, §6b, §7b, §10 (read by team agents; not needed in context-pack sessions)

Part of AGENTS.md, kept apart so plain sessions and packs don't pay for it.

## 0. Modes and delta runs
The orchestrator runs in one of five modes: `new-project`, `gap-fill`, `feature`, `bugfix`, `quick`.
You receive `mode=` (and often `delta=true`) in your dispatch — follow your file's section for it.

**Delta runs** (`delta=true`): change only what the listed changed inputs require; keep ids,
numbering, file names and existing content stable; record what you changed in the file your
section names (e.g. `analysis/CHANGES.md`, `plan/generated/api-changes.md`).

## 0b. Scope — read only what is in scope
If `inputs/scope.md` exists, the human has limited this run to part of the inputs (e.g. one screen of a larger spec):
- Read `inputs/scope.md` first (3 lines). Use `inputs/scoped/**` in place of `inputs/**` — the sliced UX HTML, FSD and API spec.
  Never open `inputs/ux/**`, the full FSD or the full API spec; they are mostly out of scope and cost tokens every session.
- Out of scope means: do not analyse, plan, design, mock or build it. Something in scope needs it → say so in your HANDOFF reason
  (`NEEDS-RESEARCH`) instead of adding it. `inputs/scoped/SCOPE-REPORT.md` lists what was dropped; if you think a dropped
  part is needed, say which, and the human re-slices with `node tools/scope.mjs slice --also "<word>"`.
- `scope.md` exists but `inputs/scoped/` does not → stop: BLOCKED "run node tools/scope.mjs slice".
- **Single-screen scope: ≤ 2 TASKs** (architect: merge slices into as few TASKs as the 8-file limit allows).

## 0c. Turn economy — most of a session's cost is turns on a growing context, not the prompt
- Read everything you need in ONE batch of parallel tool calls. Never re-read a file you read or wrote in this session.
- Write each output file ONCE, complete (one create call), not by many small edits. No read-back "to verify" — tools and checks verify.
- No narration between tool calls. Your final reply is the HANDOFF line plus at most 5 lines.
- Run only the commands your agent file lists. Prefer the zero-token tools (`tools/*.mjs`) over reading raw files (HTML, specs).
- **A denied tool call (hook or guard) = stop.** Do not try variants or another route: say what you needed and why, end with
  BLOCKED-DESIGN (or your agent's BLOCKED status). The human fixes the plan once; every retry burns budget.

## 6b. Lite mode, batch review, fast checks, timing
**Lite mode** (opt-in per run with `lite`): tests first only for `tests: first` TASKs (and always for BUGs);
`tests: after` TASKs get their tests in one batch step; one review per 4 TASKs instead of one per TASK.

**Fast checks inside a TASK** (builders and test-engineer — the reviewer runs the full set once):
| Check | Command | Why it's fast |
|---|---|---|
| types | `npm run typecheck` | incremental (tsconfig `incremental`) — only changed files are re-checked |
| lint | `npx eslint <the TASK's files>` | only what you touched; `npm run lint` is cached for the reviewer |
| FSD rules | `npx steiger ./src` | ~2s; catches forbidden imports (e.g. `@app` in a page test) before review |
| tests | `npx vitest related <the TASK's source files> --run --reporter=dot` | only tests that import those files |
Storybook build, coverage, e2e and the all-screens design check run once, at release (reviewer). The reviewer runs
related tests per TASK and the full suite per batch and at release.
Timing: append one line to plan/history when you finish — `⏱ <agent> <start>–<end> · typecheck Ns · tests Ns`
(`date +%T` before and after) — so slow steps are visible.

**Batch review (default in feature / gap-fill / new-project; `review: every-task` in plan/run-options.md turns it off):**
builders run the fast checks plus `node tools/task.mjs scope <id>` before DONE and set the TASK to `built`; the reviewer
runs once per 4 TASKs (`scope=batch`) and sets `done`. BUGs and quick mode keep one review per TASK. Tests stay first.

**Context packs in team runs:** builders read `plan/packs/<id>.builder.md` when it exists (test-engineer writes it after RED;
otherwise the builder runs `node tools/task.mjs pack <id>` first). The pack replaces the task file, the rule files and the
design spec for that TASK — your own agent file still applies.

**Windows PowerShell blocks npm/npx** ("running scripts is disabled on this system", `npm.ps1` / `npx.ps1` cannot be
loaded) → do NOT stop, do NOT change the execution policy, do NOT improvise another shell. Put `node tools/run.mjs` in
front of the SAME command: `node tools/run.mjs npm run typecheck`, `node tools/run.mjs npx vitest related <files> --run`,
`node tools/run.mjs npm i <pkg>`. For an installed tool the bare form works too:
`node tools/run.mjs openapi-typescript <spec> -o <out>`, `node tools/run.mjs redocly lint <spec>`, `node tools/run.mjs tsc --noEmit`.
It starts npm/npx/the tool through `node` itself, so no PowerShell script is involved. Say so once in your HANDOFF reason.

## 7b. No-git mode and the agent-guard
- **No-git mode** — `plan/run-options.md` contains `git: off` (written by app-bootstrap or tools/task.mjs when git isn't
  installed or the folder isn't a repository; the human can write it too). Then run NO git command: no branch, no
  commit, no start-sha. Wherever an agent file says to run git, skip that step and use the replacement:
  - record start-sha → `node tools/task.mjs start <id>` (saves a file snapshot and a backup of the task's files)
  - `git diff` scope check (and the branch / author checks) → `node tools/task.mjs scope <id>`
  - `git restore --source=<start-sha>` → `node tools/task.mjs undo <id> --yes`
  - branch, add, commit → skip, and tell the human "no git: nothing committed"
- Path permissions in agent files are a coarse guard (they must work on non-FSD projects too).
  The TASK Files table is the real boundary: the project plugin (`.opencode/plugins/agent-team.js`) blocks edits outside it
  while the TASK is in progress, and `node tools/task.mjs scope` + the reviewer's owner check catch anything written another way.

## 10. HANDOFF
```
HANDOFF: status=<STATUS> next=orchestrator task=<TASK-NNN|none> reason="<one sentence>"
```

`next` is ALWAYS `orchestrator`; routing lives only in the orchestrator's table.
Ids: `TASK-NNN` for planned work, `BUG-NNN` for bug fixes (same loop, same rules).
Allowed statuses: `DONE READY PASS CONCERNS FAIL-MECH FAIL-DESIGN BLOCKED BLOCKED-DESIGN
BLOCKED-BUG BLOCKED-TEST NEEDS-RESEARCH DUPLICATE FIXED VERIFY-FAIL-DESIGN LOGGED`
