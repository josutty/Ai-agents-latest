# Running the agents for a new project

Two ways: **A** (one command, recommended) and **B** (one agent at a time, the order of `prompt.txt`).

## Before you start (once per project)
1. Put your files in the usual place:
   - `inputs/fsd-spec.md`
   - `inputs/ux/dealer.html`
   - `inputs/api/backend-api.yaml`
2. Check the setup:
   - `node tools/check-install.mjs` — fix every ❌ line.
   - `npx playwright install chromium` (the design tools open the prototype in a browser).
   - `node tools/set-models.mjs` if you changed `models.json`.

---

## Way A — the easy route
1. Open the **orchestrator** agent and type `/new-project`. Enter a branch name, e.g. `dealer-portal`.
   It runs steps 1–7 below and stops at **Gate 1**.
2. Review the Gate 1 files (listed under Gate 1 below), then type:
   `Gate 1 approved. Run Phase 2 and stop at Gate 2.`
3. Review Gate 2, then type:
   `Gate 2 approved. Run Phase 3 and 4.`
4. At **Gate 3**, review the results. If screens still differ from the design, type `/fix-design`.

---

## Way B — by hand, one agent at a time
Read each agent's **last line**. `DONE` means go to the next agent. Anything else: fix what it names and run the **same** agent again.

| # | Agent | Prompt to type |
|---|---|---|
| 1 | app-bootstrap | `Mode: new-project. Run 1 (Phase 0). Branch name: feat/dealer-portal.` |
| 2 | wireframe-analyzer | `Mode: new-project. UX HTML: inputs/ux/**/*.html. Client FSD doc: inputs/fsd-spec.md.` |
| 2b | library-advisor | `Mode: new-project. UX HTML: inputs/ux/**/*.html.` |
| 3 | hybrid-api-config | `Mode: new-project. Backend spec: inputs/api/backend-api.yaml (partial).` |
| 4 | schema-parser | `Mode: new-project. Spec: plan/generated/api-spec.yaml.` |
| 5 | mock-data-generator | `Mode: new-project.` |
| 6 | fsd-planner | `Mode: new-project. Client FSD doc: inputs/fsd-spec.md.` |
| 7 | coverage-checker | `Mode: new-project. stage=plan. UX HTML: inputs/ux/**/*.html.` |

Step 2 takes a few minutes: it opens the prototype and clicks every control to find screens, drawers, modals and the top bar.

### Gate 1 — look at
- `plan/coverage-matrix.md` (gaps first)
- `plan/library-decisions.md`
- `plan/requirements-questions.md`
- `analysis/display-rules.md` and `plan/generated/backend-gaps.md`
- `analysis/interactions.md` — are all screens, the drawer, the modals and the top bar there?
- `analysis/design-tokens-raw.md` — are the colours and the IBM Plex fonts there?

Then run:
```
node tools/task.mjs approve-libs --all-proposed
node tools/task.mjs save-plan "Gate 1"
```
Keep the font (`web-font`) rows approved. Without them the build uses system fonts.

| # | Agent | Prompt to type |
|---|---|---|
| 8 | app-bootstrap | `Mode: new-project. Run L (install only the approved rows of plan/library-decisions.md).` |
| 9 | architect | `Mode: new-project. Phase 2.` |
| 10 | coverage-checker | `Mode: new-project. stage=tasks. UX HTML: inputs/ux/**/*.html.` |

### Gate 2 — look at
`plan/PROGRESS.md` and 2–3 task files. Then run `node tools/task.mjs save-plan "Gate 2"`.

| # | Agent | Prompt to type |
|---|---|---|
| 11 | store-architect | `Mode: new-project. Phase 3a.` |
| 12 | styling-engineer | `Mode: new-project. Phase 3a.` |
| 13 | app-bootstrap | `Mode: new-project. Run 2 (app shell).` |

### Task loop — for every TASK
Run `node tools/task.mjs next` whenever you are unsure what is next.
```
node tools/task.mjs status
node tools/task.mjs start TASK-005
node tools/task.mjs pack TASK-005 --role tests
   → new chat, pack-tester, attach plan/packs/TASK-005.tests.md:
     "Write the tests for TASK-005 exactly as this pack says."
node tools/task.mjs pack TASK-005
   → new chat, pack-builder, attach plan/packs/TASK-005.builder.md:
     "Implement TASK-005 exactly as this pack says."
node tools/task.mjs done TASK-005
```
Every 4–5 tasks run the reviewer: `Mode: new-project. scope=batch, TASK-001..TASK-004.`

| # | Agent | Prompt to type |
|---|---|---|
| 14 | reviewer | `Mode: new-project. scope=release.` |
| 15 | coverage-checker | `Mode: new-project. stage=release. UX HTML: inputs/ux/**/*.html.` |

### Gate 3 — look at
- `plan/design-diff/<screen>/` for every screen, including `visual.png` (red = looks different)
- `plan/token-check.md`
- the reviewer's result
- `npm run dev` — click the drawer and the modals yourself

---

## If Gate 3 still shows differences from the design
Type `/fix-design`. Or by hand (steps 16–21 of `prompt.txt`):

| # | Agent | Prompt to type |
|---|---|---|
| 16 | app-bootstrap | `Mode: design-fix. Run B. Branch name: fix/design-1.` |
| 17 | reviewer | `Mode: design-fix. scope=release, design-only: re-run node tools/design-spec.mjs compare for every screen, the top bar and every overlay in analysis/interactions.md, and node tools/check-tokens.mjs. No fixes.` |
| 18 | architect | `Mode: bugfix. One BUG per screen / overlay with blocking differences + one for tokens and fonts. The files in plan/design-diff/ and plan/token-check.md are the bug report.` |
| 19 | styling-engineer | `Mode: bugfix. The tokens + fonts BUG.` (A font that is not installed: approve it with `approve-libs` and run app-bootstrap Run L first.) |
| 20 | coder | `Mode: bugfix. Each screen BUG, one at a time.` It runs the compare until 0 blocking. |
| 21 | reviewer | `Mode: bugfix. scope=batch.` |

Then look at Gate 3 again. Repeat until `plan/design-diff` shows **0 blocking** differences and `plan/token-check.md` has no ✘.

---

## Good to know
- If an agent ends **BLOCKED-DESIGN**, or a tool call is **denied**, do not switch to the orchestrator mid-task. Add the file it names to that task's Files table (`plan/tasks/<id>.md`), then run the **same** agent again.
- If the same check fails twice, run the **debugger** with `plan/packs/<id>.failures.md`.
- If `node tools/task.mjs done` refuses, read its ✘ line: a file outside the Files table, a failing check, or a library not approved.
- A difference you accept on purpose goes into `plan/design-accepted.md` — only a human edits that file.
