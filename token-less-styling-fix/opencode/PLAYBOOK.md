# Playbook — how to run the agent team

> Running agents by hand? **PROMPTS.md** has the agent order and copy-paste prompts for every case; SENIOR-WORKFLOW.md explains it.
> Libraries: the **library-advisor** proposes them right after wireframe-analyzer (current npm facts via `tools/lib-facts.mjs`);
> you approve at Gate 1 with `node tools/task.mjs approve-libs --all-proposed` (or by name).
> Building only part of the spec? Slice first: `node tools/scope.mjs init "login page"` → `slice` (PROMPTS.md §1c). Lost? `node tools/task.mjs next`.

## One-time setup (per machine)
0. Install **Node 22.22+ (or 24.15+)**. The first run also downloads Playwright's Chromium
   (`npx playwright install chromium`), so it needs network access once.
1. Copy all agent files into your OpenCode agents folder (project `.opencode/agents/`, or global `~/.config/opencode/agents/`; very old OpenCode versions use `agent/` without the s). They already carry the names
   the orchestrator dispatches by (`coder.md` → agent `coder`) — don't rename them. The team is 19
   agents; the orchestrator stops with "<agent> not available" if one is missing.
2. Copy `AGENTS.md` into the ROOT of every project repo you run the team on.
3. Select the **orchestrator** as the primary agent. You only ever talk to the orchestrator.

## Put inputs in the same place every time
```
inputs/
├── fsd-spec.md          client's FSD document (any format → save as .md)
├── ux/                  one .html per screen (products.html, cart.html…)
└── api/backend-api.yaml backend team's YAML (partial or complete)
```

## Mode 1 — new project
```
Mode: new-project.
Inputs: inputs/fsd-spec.md, inputs/ux/*.html, inputs/api/backend-api.yaml (partial).
Branch name: feat/shop-v1.
Run Phase 0 and Phase 1 only, then stop at Gate 1.
```
At Gate 1: open `plan/coverage-matrix.md` first → every gap either fixed or marked out-of-scope by you.
Send `plan/generated/backend-gaps.md` to the backend team.
Then: `Gate 1 approved. Run Phase 2 and stop at Gate 2.` → review tasks →
`Gate 2 approved. Run Phase 3 and 4.`

No client FSD doc? Say so explicitly: `No client FSD doc — use AGENTS.md defaults.`
No backend YAML yet? Leave it out — every endpoint is proposed + mocked, and backend-gaps.md becomes
the spec you hand the backend team.

Pages are wired into the router as their TASKs pass, so `npm run dev` shows finished screens mid-run.

Tip for your first project: start with 1–2 screens. Look at every file the agents write.

## Mode 2 — something is missing (project built by this team)
Found it yourself:
```
Mode: gap-fill. The Products page has no sort dropdown (it's in inputs/ux/products.html),
and the Empty state on the catalog never shows.
```
Backend sent a new YAML:
```
Mode: gap-fill. New backend spec: inputs/api/backend-api-v2.yaml. Update the project.
```
Not sure what's missing:
```
Mode: gap-fill. Run coverage-checker at stage=release and show me the gaps before doing anything.
```

## Mode 3 — new feature in an existing project (any project)
```
Mode: feature. Add a "Wishlist" feature: heart button on product cards, wishlist page.
UX: inputs/ux/wishlist.html. API: inputs/api/wishlist.yaml (partial).
```
The first run on a project not built by this team creates `PROJECT.md`.
**Read PROJECT.md before approving anything** — if it describes the project wrongly, every agent
will follow the wrong rules. Correct it by telling the orchestrator what's wrong.

## Mode 4 — bug fix
Give steps, expected, actual:
```
Mode: bugfix.
Bug: on /products, when the list fails to load, clicking Retry does nothing.
Steps: set VITE_API_MODE=mock, block /api/products in devtools, reload, click Retry.
Expected: list reloads. Actual: nothing happens, no network request.
```
The team diagnoses first, writes a test that fails because of the bug, then fixes it.
Layout, focus, scroll and other browser-only bugs get a Playwright regression test instead of a
jsdom one, so they go through the same RED → GREEN loop. Projects without Playwright get a
`browser-only` diagnosis and you decide: add Playwright, fix with manual verification, or stop.

## Mode 5 — quick change (≤ 3 files, no new endpoint/slice/route)
```
Mode: quick. On product cards, show the price in bold and rename "Add to cart" to "Add".
```
Branch → a one-TASK plan → tests that assert the old text are updated → change → review → Gate 3.
If the change turns out bigger, the architect says "not quick" and the orchestrator asks to switch
to feature or bugfix.

A typo in a comment still doesn't need the team — a single chat with AGENTS.md in the repo is fine.

Every feature/bugfix/gap-fill run starts on a new branch (`feat/<name>` or `fix/<slug>`) created from
PROJECT.md's `base-branch`. Commit or stash your own work first — the team stops on a dirty tree.

## Model tiering (edit the `model:` line in each agent file)
All agents ship on one model. Recommended split — use whatever strong/fast models your provider has:
| Tier | Agents |
|---|---|
| Strongest | orchestrator, architect, fsd-planner, debugger |
| Strong, and a DIFFERENT model family from coder | reviewer |
| Fast | coder, component-generator, store-architect, test-engineer, mock-data-generator, schema-parser, hybrid-api-config, codebase-scanner, coverage-checker, researcher, reflector, app-bootstrap |

## Useful commands to the orchestrator
- `Where are we?` — it reads plan/PROGRESS.md and reports.
- `Resume.` — continues from the last HANDOFF after a crash or a new session.
- `Stop after the current TASK.` — safe pause point.
- `Show me the gaps.` — runs coverage-checker.

## What to check at each gate (5-minute version)
| Gate | Open these | Ask yourself |
|---|---|---|
| 1 | coverage-matrix.md, analysis/components.md, backend-gaps.md, fsd-structure.md compliance table | Is every screen element there? Does placement follow the client's FSD doc? |
| 2 | PROGRESS.md, 2–3 TASK files | Is each TASK small? Are the props and states what the UX shows? |
| 3 | reviewer result (gates A–G incl. e2e + axe), coverage-matrix.md | Run `npm run dev`, click through every screen in light + dark, then once with the keyboard only. |


## If something goes wrong — plain-language guide (no coding needed)
The orchestrator explains problems in everyday words and gives numbered choices — just reply with the
number. You can also type these to the orchestrator at any time:

| You type | What happens |
|---|---|
| `status` | tells you where the project is, what is done, what is next |
| `help` | runs the checks and explains any problem in plain words |
| `explain` | says what the last step did and why |
| `resume` | continues after a break, a sign-in expiry or a closed window — nothing is lost |
| `undo last step` | shows what the last step changed and reverts only that, after you confirm |

| What you see | What it means | What to type |
|---|---|---|
| Chat stopped / sign-in or usage-limit message | the session ended, your work is saved | sign in again → new chat → orchestrator → `resume` |
| Blank page, or a message about setup / "Bootstrapping" | pages aren't connected yet | `connect the finished pages` |
| The orchestrator says "Problem: …" with options | an agent got stuck | reply with the number (the first option is recommended) |
| The result looks wrong at a gate | something was misunderstood | `reject: <what is wrong, which screen>` |
| Not sure where you are | — | `status` |
| You changed a screen or requirement | inputs changed | `Mode: gap-fill. Change: <what changed>. Updated inputs: <files>` |
| Want only some tasks | — | `Run only TASK-003 and TASK-016` (it checks they don't depend on others) |

## Shortcut commands (OpenCode)
Instead of pasting long prompts: `/new-project <name>`, `/feature <what>`, `/bugfix <what>`, `/quick <what>`, `/gap-fill <what changed>`, `/status`, `/resume`, `/approve`, `/reject <what is wrong>`. They start the orchestrator with the same prompts shown above. `node tools/check-install.mjs` checks that everything is installed.

## Libraries (decided automatically, approved by you)
wireframe-analyzer runs `tools/detect-ui-capabilities.mjs` on your screens; fsd-planner turns every finding into a row
of `plan/library-decisions.md` (e.g. "indent table → TanStack Table: frozen column, grouped headers, editable cells").
At Gate 1 you approve those rows; anything outside the catalog waits for your yes. Simple things stay plain
React + Tailwind. Every detected feature must reach a task, the code and a test — coverage-checker fails the
stage if one goes missing.

## Design fidelity (the screen must match your HTML)
- Phase 1: wireframe-analyzer measures every screen in a real browser → `analysis/design-spec/<screen>.md` (exact labels,
  columns, sizes, colors) and `analysis/display-rules.md` (e.g. "stock in red/amber" — at Gate 1 you answer what the colors mean).
- Builders copy labels exactly and map every measured value to a token; they may not invent highlights or icons.
- Page tasks and the release review run `node tools/design-spec.mjs compare <file.html#screen-id> <route> --start`;
  content or rule differences block the task.
- Gate 3: open `plan/design-diff/<screen>/` — design.png next to build.png, plus differences.md.
- Needs Playwright's Chromium once: `npx playwright install chromium` (app-bootstrap does this in new projects).

## Speed
- Say **`fast`** (or `batch: all`) in your prompt: the team runs every task without stopping (gates and problems still stop it).
- Agents run fast checks inside a task (incremental typecheck, lint on changed files, only related tests);
  the reviewer runs the full set once; Storybook, coverage and e2e run at release.
- Small tasks (≤ 2 files) use one builder: test-engineer → coder → reviewer.
- No approval clicks: Copilot and Claude Code packages pre-approve the routine commands and edits (the guard still
  limits each agent). Don't leave a gate unanswered — the team waits for you there.
- Every agent writes a ⏱ line to plan/history; the status card shows time per task and an ETA.
- Fastest models for the builders make the biggest difference (models.json → tier "strong" / "fast").

## Lite mode (faster, opt-in)
Add **`lite`** to your prompt (combine with `fast`): `Gate 2 approved. lite fast — run all open tasks.`
- Tests first only for tasks marked `tests: first` (data, logic, forms, interactive widgets, display rules, pages)
  and always for bug fixes. Purely visual tasks get their tests in one batch step after the code.
- One full review per 4 tasks — this is now the DEFAULT for every run (bug fixes and quick changes still get one review
  each). Every builder runs the fast checks, `task.mjs scope` and, for pages, the design check before it finishes.
- Default mode (no `lite`) keeps tests first for every task. For critical screens add `review: every-task` to
  `plan/run-options.md` to get one review per task again (≈4× the reviewer cost).
Expected: roughly 30–40% faster than default mode (estimate — check the ⏱ lines in plan/history).

## Saving tokens
- Manual mode with context packs (SENIOR-WORKFLOW.md) is the cheapest way to run the team; team runs now use the same packs.
- MCP servers are off by default; every enabled server adds its tool list to every turn.
- Work in batches: the orchestrator stops after every 4 tasks — start a NEW session and type `resume`.
- Use `quick` for small changes instead of `feature`.
- Planning (Phases 1–2) deserves the strongest model; building can use a cheaper one (see the tiers in models.json).
- Clean wireframes (no base64 images or giant inline SVGs) and API files (only the endpoints you use) before Phase 1.

## Tuning from the pilot (Revision 11)
- **One HTML file with several screens** (`dealer.html` with `div#login`, …): the design check now measures one screen
  at a time — `dealer.html#login`. No more hundreds of meaningless differences.
- **Page look is checked**: page background, the card, where each text sits (inside/outside the card, left/center/right,
  same line). Your pilot's navy background, logo position and "Forgot password?" placement would now block the task.
- **Pages wire themselves**: the coder adds its page's route inside the TASK, so the design check runs before review.
- **`lite` / `fast` survive resumes**: they're saved in `plan/run-options.md`.
- **`npm run dev` uses mocks by default** (`.env.development`), so "Request failed" no longer appears just because no
  backend runs. Use `.env.local` with `VITE_API_MODE=hybrid` when the backend is up.
- **Fewer review round-trips**: builders run Steiger (FSD rules) themselves; library installs don't fail the scope
  check; the reviewer runs only related tests per task and logs its own time.
- **Slow checks on Windows** (typecheck 2 min, build 1.5 min in the pilot): ask IT to exclude the project folder and
  `node_modules` from real-time antivirus scanning — it's the most common cause. Close other heavy apps while running.
- **Models** are set in `models.json` → `node tools/set-models.mjs`; writing "use gpt 5.5" in a prompt doesn't change them.

## Senior-developer workflow (no orchestrator)
Open **SENIOR-WORKFLOW.md**: manual planning chain, then per task `node tools/task.mjs start → pack → (red) → check → done`. Context packs (`plan/packs/`) replace plan-searching; `done` replaces the per-task reviewer.

## No git on this laptop?
Create `plan/run-options.md` containing `git: off` (or run any `node tools/task.mjs start …`, which writes it for you). The agents then skip branches and commits and the task tool uses file snapshots, with `node tools/task.mjs undo <id>` as your undo. Details: **SENIOR-WORKFLOW.md → Working without git**.

## npm / npx blocked by PowerShell?
If a command fails with "running scripts is disabled on this system", put `node tools/run.mjs` in front of it (`node tools/run.mjs npm run typecheck`, `node tools/run.mjs openapi-typescript <spec> -o <out>`). It starts npm/npx/the tool through node itself. The agents are allowed to use it and know to (AGENTS.md §6).

## Design check: what blocks now
`content`, `rule`, `layout` and **`look`** differences block a page task. `look` = page background (a gradient is measured now), clearly different text/link/button/border colours, a missing underline, text that would be hard to see. Differences you accept on purpose go into `plan/design-accepted.md` — only you edit that file.
