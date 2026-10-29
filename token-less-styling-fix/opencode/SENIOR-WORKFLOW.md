# Senior-developer workflow — you drive, scripts do the bookkeeping (OpenCode)

You skip the orchestrator. Agents are used only for thinking work (planning, writing code, writing tests); everything
mechanical — progress tracking, start/finish records, checks, scope, library and design verification, commits — is done by
`tools/task.mjs` and costs **zero tokens**. A builder session reads one **context pack** (the task + only the excerpts it
needs) instead of searching the plan.

> **Quick version:** `PROMPTS.md` — the agent order and copy-paste step lines for a new project, feature, bug,
> delta change, new module and quick change. This file explains the why.

## Attach syntax in OpenCode
| You want to attach | Write |
|---|---|
| a file | `@plan/packs/TASK-005.builder.md` |
| a team agent (planning chain, debugger, reviewer) | press **Tab** until the bottom line shows it — every agent is selectable now (`mode: all`); its model and permissions apply |
| a pack session | **pack-builder** / **pack-tester** (Tab), or plain **Build** — the plugin (`.opencode/plugins/agent-team.js`) protects both; use Build if your plan has the free-tier problem with custom agents |
| the pack isn't in the picker | say it in words: `Read the file plan/packs/TASK-005.builder.md and implement TASK-005 exactly as it says.` |

## Setup once
1. `git config core.hooksPath .githooks` · `node tools/check-install.mjs` (fix every ❌) · set `models.json` → `node tools/set-models.mjs`
2. Work on a branch: `git checkout -b feat/<name>` (the tool refuses `main`, `master`, `develop`). **No git on this laptop?** See "Working without git" below — everything still works.
3. Models come from `models.json` (run `node tools/set-models.mjs` after editing it): **strongest** (Opus-class) for the planning
   chain, store-architect and the debugger; **strong** (Sonnet-class) for packs and builders; **reviewer** = another model family.
   Starting each agent as itself (below) is what applies its model — a plain session uses whatever model you picked.

## A. Planning chain (Phases 0–2) — one agent per NEW session, in this order
Start each agent as itself — press **Tab** until the bottom line shows **<agent>** — so its model, tools and guard apply. Then type (same every time):
```
(Tab → <agent>)
<step line from the table>  You are ONLY this agent — do not start the next agent's work. Finish with the HANDOFF line.
```
| # | Agent | Step line |
|---|---|---|
| 1 | app-bootstrap | `Mode: new-project. Run 1 (Phase 0). Branch name: feat/<name>.` |
| 2 | wireframe-analyzer | `Mode: new-project. UX HTML: inputs/ux/**/*.html (a screen inside a combined file is file.html#screen-id). Client FSD doc: inputs/fsd-spec.md.` |
| 2b | library-advisor | `Mode: new-project. UX HTML: inputs/ux/**/*.html.` |
| 3 | hybrid-api-config | `Mode: new-project. Backend spec: inputs/api/backend-api.yaml (partial).` |
| 4 | schema-parser | `Mode: new-project. Spec: plan/generated/api-spec.yaml.` |
| 5 | mock-data-generator | `Mode: new-project.` |
| 6 | fsd-planner | `Mode: new-project. Client FSD doc: inputs/fsd-spec.md.` (no FSD doc → `client-fsd=none (waived by human).`) |
| 7 | coverage-checker | `Mode: new-project. stage=plan.` |
| — | **Gate 1 (you)** | read `plan/coverage-matrix.md` (gaps first), `analysis/capabilities.md`, `plan/library-decisions.md` (approve: `node tools/task.mjs approve-libs --all-proposed` or by name), `plan/requirements-questions.md` (fill the Answer column — an answer that changes a library → re-run library-advisor with `delta=true`), `analysis/display-rules.md` (answer open questions), `plan/generated/backend-gaps.md` |
| 8 | app-bootstrap | `Mode: new-project. Run L (install only the approved rows of plan/library-decisions.md).` |
| 9 | architect | `Mode: new-project. Phase 2.` |
| 10 | coverage-checker | `Mode: new-project. stage=tasks.` |
| — | **Gate 2 (you)** | `plan/PROGRESS.md` + 2–3 task files: small? Design section has Source, Spec and **Route** (page tasks)? |
| 11 | store-architect | `Mode: new-project. Phase 3a.` |
| 12 | styling-engineer | `Mode: new-project. Phase 3a.` |
| 13 | app-bootstrap | `Mode: new-project. Run 2 (app shell).` |

Read each agent's last line (HANDOFF). DONE/READY → next. Anything else → fix what it names and re-run that agent.
After each gate you approve: `node tools/task.mjs save-plan "Gate 1"` — planning agents can't commit, and `start` needs a clean tree.

## B. The task loop (this is where you save the tokens)
```
node tools/task.mjs status                      # what's done, what's ready
node tools/task.mjs start TASK-005              # branch/clean-tree guard, start-sha, status in-progress
```
**`tests: first` tasks** (data, logic, forms, interactive widgets, display rules, pages, bugs):
```
node tools/task.mjs pack TASK-005 --role tests
   NEW session, pack-tester, attach plan/packs/TASK-005.tests.md:   "Write the tests for TASK-005 exactly as this pack says."
   (it runs `red` itself before it stops — you just confirm "valid RED" in its last line)
node tools/task.mjs red TASK-005                # proves the tests fail for a VALID reason (TDD), records it
node tools/task.mjs pack TASK-005
   NEW session, pack-builder, attach plan/packs/TASK-005.builder.md: "Implement TASK-005 exactly as this pack says."
   (it runs `check` itself, at most 2 fix rounds, and reports the result)
```
**`tests: after` tasks** (purely visual): build first, then tests.
```
node tools/task.mjs pack TASK-005
   NEW session, pack-builder: attach plan/packs/TASK-005.builder.md:  "Implement TASK-005 exactly as this pack says."
node tools/task.mjs pack TASK-005 --role tests          # now it includes the code that exists
   NEW session, pack-tester: attach plan/packs/TASK-005.tests.md:    "Write the tests for TASK-005 exactly as this pack says."
```
**Then, for every task:**
```
node tools/task.mjs check TASK-005 [--design]   # optional now: the builder already ran it — run it if you want to see it yourself
   ✘ → attach plan/packs/TASK-005.failures.md to the same session: "Fix these failures. Touch only the task's files."
node tools/task.mjs done TASK-005               # check + scope + libraries (+ design for pages) → status done → commit by path
```
`done` replaces the per-task reviewer: it refuses if a file outside the task's Files table changed, if a library that isn't
approved in `plan/library-decisions.md` was added, if any check fails, or (page tasks) if the design check has blocking differences.
It commits only the task's files plus `plan/PROGRESS.md`, the task file, its history and the design report.

## C. What to run yourself (zero tokens) and what to use agents for
| Job | Use |
|---|---|
| Typecheck, lint, FSD rules, related tests, design compare, scope, libraries, progress, commits | `tools/task.mjs` (above) |
| Review | you read the `done` result; optionally run the **reviewer** agent once per 4–5 tasks, on a different model family, for a second opinion |
| Planning chain (section A), foundation | agents (strong models) |
| Writing code and tests | plain session + pack (Sonnet-class) |
| A bug you can't find, a coder stuck | **debugger** agent: attach `plan/packs/<TASK>.failures.md` |
| Coverage tracing | **coverage-checker** at Gates 1, 2 and release |
| Boilerplate (types, mocks) | already generated by schema-parser / mock-data-generator |

## Hooks, options and what they cost (read once)
Where they live: the plugin `.opencode/plugins/agent-team.js` (every agent, Build included) + each agent's permissions; OpenCode formats with Prettier itself. Scripts: `tools/hooks/` (pure Node, no dependencies).

| What | Does | After-effect |
|---|---|---|
| task scope | while a task is `in-progress` (or `built`), edits to `src/`, `test/`, `e2e/` files outside its Files table are refused with a plain reason | ~50 ms per edit, zero tokens; a refused edit costs the model one turn — cheaper than finding it at `done`. Shell writes aren't seen here; `done`'s scope check still catches them |
| secrets | `.env`, `.env.local`, `.env.*.local`, `.env.production`, `*.pem`, `*.key` are never read or written | none — `.env.example` / `.env.development` stay usable |
| format on write | Prettier (only if the project has a Prettier config), then `eslint --fix` on the written file | ~2 s per write (ESLint start-up). The model may re-read a file before its next edit. Plan/analysis files are never touched |
| agent-guard | per-agent file + command limits; commands are an allowlist; `> file` and `tee` count as edits; `$(…)` is checked too | a denied command costs one turn |
| pre-commit | blocks the base branch · lint-staged on staged files · gitleaks if installed | a commit takes a few seconds longer |

Options — one line each in `plan/run-options.md`:
| Line | Effect | Cost |
|---|---|---|
| `scope-guard: off` | turns the task-scope check off (e.g. a big refactor you drive yourself) | you lose the guard |
| `format: prettier-only` / `format: off` | skip `eslint --fix` (≈2 s faster per write) / no formatting on write | lint fixes move to `check` |
| `review: every-task` | orchestrator runs: one reviewer per TASK instead of one per 4 | ~4× reviewer tokens |

MCP servers are all **off** by default (each one adds its tool list to every turn). Turn one on only for the session that needs it:
serena for a large unfamiliar codebase (debugger, codebase-scanner), context7 only if wrong-version code gets past the
Pinned APIs table, playwright for browser-only bugs. Examples are in the MCP example file.

## D. Release (Phase 4) — once, not per task
```
npm run typecheck && npm run lint && npm test && npm run build
npm run build-storybook && npm run coverage && npm run e2e
node tools/design-spec.mjs compare inputs/ux/<file>.html#<screen> /<route> --start      # every screen
```
Then the **coverage-checker** (`stage=release`) and **Gate 3**: open each `plan/design-diff/<screen>/` (design.png next to build.png).

## Token habits
- **One session per pack.** Attach only the pack (and later only `failures.md`) — never paste logs or let the agent search the plan.
- **Slice the inputs for a partial build:** `node tools/scope.mjs init "login page"` then `slice` — agents read `inputs/scoped/**`
  (typically 50–90 % less input in every planning session). "Only login" written in a prompt does not do this.
- **Not sure which agent is next?** `node tools/task.mjs next` (free). Never fall back to the orchestrator mid-task.
- **Packs don't repeat AGENTS.md** (your tool already loads it) and carry only the UI rules the task needs, plus the Pinned APIs table.
  `--with-core` puts AGENTS.md §1–3, §8–9 back if a tool you use does not load AGENTS.md.
- **Never let an agent run the whole suite or build Storybook** — the pack says so, `check` does it cheaply.
- `pack` prints what each section costs; a thin task file gives a thin pack — fix the task, not the prompt.
- Routine tasks: Sonnet-class or cheaper. Spend Opus-class on planning and debugging.

## Limits (read once)
- Tested here: Node 22, Linux, a two-task sample project (pack, red, check, design check, scope, library check, done/commit, re-run after a failed commit) in git mode, plus the whole flow with no `.git` folder and with a broken `git` command (snapshot, scope, library check, undo, done). **Not tested on Windows** — it uses `git` and `npx` from your PATH; tell me if anything misbehaves.
- The pack picks excerpts by matching component names and slice paths from the task file. A task file that doesn't name its components gets a thinner pack.
- `red` is a pattern check (assertion or missing-import failure = valid; syntax/reference/setup errors = suspect), not a proof.
- Scope and library checks are only as good as the task's Files table — check it at Gate 2.
- The design check measures what `design-spec` measures (labels, columns, page background, card, text placement, fonts, colors, controls); spacing between blocks, icons and hover states are still yours at Gate 3.
- One task in progress at a time; `start` refuses a dirty tree on purpose.
- The task-scope hook reads `plan/PROGRESS.md`: a task you abandoned while `in-progress` keeps its files editable and
  everyone else's blocked — set it back to `open` (or finish it) before starting another.

## Working without git
Git missing, "not recognized", or the folder isn't a repository? You are **not blocked**. Two ways:
1. **Easiest:** create the file `plan/run-options.md` with one line: `git: off` (or just run any `node tools/task.mjs start …` — it writes the line itself when it can't find git).
2. **Or fix git:** install Git for Windows, reopen VS Code, then `git init` → `git add -A` → `git commit -m initial` and delete the `git: off` line.

With `git: off`:
| Normally (git) | Now |
|---|---|
| work branch | none — you work in your folder |
| start-sha | `start` saves a **snapshot** of every file hash and a **backup** of the task's files (`plan/history/<id>.snapshot.json`, `<id>.backup/`) |
| scope check (`git diff`) | compares against the snapshot — still catches edited, new and deleted files outside the task |
| commit by path | skipped — `done` marks the task done and says "nothing committed" |
| undo (`git restore`) | `node tools/task.mjs undo TASK-005` (preview), then `--yes`: restores the task's edited files, deletes the files it created |
Agents follow the same rule (AGENTS.md §7): app-bootstrap and the orchestrator skip branches and commits and keep going.
Limits: undo only covers the files in the task's Files table; there is no history, no diff viewer and no `git push` — copy or zip the folder yourself as a backup now and then.

## Troubleshooting
| You see | Do |
|---|---|
| `start`: "working tree not clean" | plan files from the planning agents → `node tools/task.mjs save-plan "<what>"`; anything else: commit or stash it, or `--force` |
| `start`: "you are on main" | `git checkout -b feat/<name>` |
| "git unavailable" / "cannot create branch" | create `plan/run-options.md` with `git: off` (see "Working without git") |
| "no design check: … no Source/Route" | add `Route: /path` (and `Source:`) to the task's Design section — the architect now writes it; older tasks need the line by hand |
| `done`: "OUTSIDE the Files table" | revert those edits, or add the file to the task's Files table if it is truly part of the task |
| `done`: "library NOT approved" | approve the row in `plan/library-decisions.md` (Gate 1 decision) or remove the dependency |
| `done`: "commit failed" | set `git config user.name/user.email`; fix the pre-commit message; run `done` again (safe to repeat) |
| `red`: "tests already PASS" | the test doesn't test the missing behaviour — rewrite it |
| `npm` / `npx` fail with "running scripts is disabled on this system" (PowerShell) | put `node tools/run.mjs` in front: `node tools/run.mjs npm run typecheck`, `node tools/run.mjs npx vitest …`, `node tools/run.mjs openapi-typescript <spec> -o <out>`. Or use `npm.cmd` / `npx.cmd`, or switch the VS Code terminal profile to Command Prompt. (`node tools/task.mjs …` already runs its checks through cmd.exe, so it is not affected.) Don't override a policy your IT set. |
| the pack is **not listed** when you type `@` (the other plan files are) | the editor's `@` picker skips git-ignored files, and older versions of the tool ignored `plan/packs/`. Run any `node tools/task.mjs …` command once with the new tool (it removes that ignore line), or delete the line `plan/packs/` from `.git/info/exclude`. Meanwhile attach by words — always works: `Read the file plan/packs/TASK-005.builder.md and implement TASK-005 exactly as it says.` |
| the design check reports `look` differences (page background, link/button colour, underline, text hard to see, borders) | they block on purpose: that is what makes a screen look different. Fix the build — or, if you decide a difference is acceptable (e.g. a faint input border the client confirmed), add a line to `plan/design-accepted.md`: `| input "email" | border colour | client confirmed |`. Only you edit that file. |
| a pack has no design spec | `node tools/design-spec.mjs extract inputs/ux/<file>.html#<screen>` |
