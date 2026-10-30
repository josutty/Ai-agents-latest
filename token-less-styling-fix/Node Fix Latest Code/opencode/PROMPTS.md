# Prompts cheat sheet — which agent, in which order, with what prompt (OpenCode)

Manual mode. Copy the step lines; replace the example names with yours. The full reasoning behind each step is in
SENIOR-WORKFLOW.md; this page is the quick version. (Orchestrator runs use the slash commands in PLAYBOOK.md instead.)

## The pieces every case uses

**Start each agent as itself, in a NEW session** — that is what applies its model, tools and guard:
New session (`/new`), then press **Tab** until the bottom line shows the agent (e.g. *architect*, *pack-builder*).
Plain **Build** also works for packs — the team plugin protects it too.

**Prompt shape for every team agent** (same every time):
```
Mode: <mode>. <step line from the lists below>
You are ONLY this agent — do not start the next agent's work. Finish with the HANDOFF line.
```
Read its last line. `DONE` / `READY` → next agent. Anything else → fix what it names and run the SAME agent again.

**Save the plan before the task loop.** Planning agents can't commit, and `start` needs a clean tree:
```
node tools/task.mjs save-plan "<what was planned>"     # commits plan/, analysis/, notes/, inputs/, PROJECT.md, generated API types
```
Run it after each gate you approve (zero tokens). With `git: off` it does nothing and that's fine.

**The task loop** — identical in every case, once TASK / BUG files exist:
```
node tools/task.mjs status                          # what's ready next
node tools/task.mjs start TASK-005
node tools/task.mjs pack TASK-005 --role tests
   → new session, **pack-tester** (Tab), attach @plan/packs/TASK-005.tests.md:   "Write the tests for TASK-005 exactly as this pack says."
     (it runs `red` itself — its last line must say valid RED)
node tools/task.mjs pack TASK-005
   → new session, **pack-builder** (Tab), attach @plan/packs/TASK-005.builder.md: "Implement TASK-005 exactly as this pack says."
     (it runs `check` itself, max 2 fix rounds)
node tools/task.mjs done TASK-005                   # checks + scope + libraries (+ design for pages) → commit
```
- `tests: after` tasks (purely visual): builder first, then the pack again with `--role tests`, then the tester.
- Every 4–5 tasks: **reviewer** — `Mode: <mode>. scope=batch, TASK-001..TASK-004.` (it's on a different model on purpose).
**Lost? Stuck? Always run the free command first:**
```
node tools/task.mjs next        # names the agent + the exact prompt for the current state of the task, or says "run done"
```
- An agent ends **BLOCKED-DESIGN**, or a tool call was **denied** (guard / task-scope hook) → add the file it names to the Files table of
  `plan/tasks/<id>.md` (owner + mode), then run the SAME agent again. Never retry by hand and **never switch to the orchestrator
  mid-task** — it re-plans the whole run (3–5× the cost of the step you were on).
- The same check fails twice → **debugger** with `plan/packs/<id>.failures.md`.

- `done` refuses? Read its ✘ line: outside the Files table → revert or fix the task file; failing check → send the
  builder `plan/packs/TASK-005.failures.md`; library not approved → decide in `plan/library-decisions.md`.

**Gates (you):** Gate 1 = coverage gaps + library choices + open display-rule questions · Gate 2 = tasks are small,
each has a Files table with owners (page tasks: Source, Spec, Route) · Gate 3 = design diff per screen + reviewer result.

---

## 1. New project
Example: dealer portal. Inputs: `inputs/fsd-spec.md`, `inputs/ux/login.html`, `inputs/ux/indent.html`,
`inputs/api/backend-api.yaml` (partial — leave it out and every endpoint is mocked).
```
1  app-bootstrap        Mode: new-project. Run 1 (Phase 0). Branch name: feat/dealer-portal.
2  wireframe-analyzer   Mode: new-project. UX HTML: inputs/ux/**/*.html (a screen inside a combined file is file.html#screen-id). Client FSD doc: inputs/fsd-spec.md.
2b library-advisor      Mode: new-project. UX HTML: inputs/ux/**/*.html.
3  hybrid-api-config    Mode: new-project. Backend spec: inputs/api/backend-api.yaml (partial).
4  schema-parser        Mode: new-project. Spec: plan/generated/api-spec.yaml.
5  mock-data-generator  Mode: new-project.
6  fsd-planner          Mode: new-project. Client FSD doc: inputs/fsd-spec.md.
7  coverage-checker     Mode: new-project. stage=plan. UX HTML: inputs/ux/**/*.html.
   ── Gate 1: plan/coverage-matrix.md (gaps first) · plan/library-decisions.md · plan/requirements-questions.md ·
      analysis/display-rules.md · plan/generated/backend-gaps.md
      → node tools/task.mjs approve-libs --all-proposed   (or name the capabilities you accept)
      → node tools/task.mjs save-plan "Gate 1"
8  app-bootstrap        Mode: new-project. Run L (install only the approved rows of plan/library-decisions.md).   ← only if rows are approved
9  architect            Mode: new-project. Phase 2.
10 coverage-checker     Mode: new-project. stage=tasks. UX HTML: inputs/ux/**/*.html.
   ── Gate 2: plan/PROGRESS.md + 2–3 task files   → node tools/task.mjs save-plan "Gate 2"
11 store-architect      Mode: new-project. Phase 3a.
12 styling-engineer     Mode: new-project. Phase 3a.
13 app-bootstrap        Mode: new-project. Run 2 (app shell).
   ── task loop for every TASK
14 reviewer             Mode: new-project. scope=release.
15 coverage-checker     Mode: new-project. stage=release. UX HTML: inputs/ux/**/*.html.
   ── Gate 3: plan/design-diff/<screen>/ for every screen · the reviewer's result · `npm run dev`
```

## 1b. New project from HTML prototypes only (no FSD doc, no API spec, no libraries chosen)
Example: you only have `inputs/ux/*.html`. The base stack (AGENTS.md §1) is fixed on purpose; the library-advisor decides
everything ELSE from the screens, with current npm facts, and asks what the HTML can't show.
```
1  app-bootstrap        Mode: new-project. Run 1 (Phase 0). Branch name: feat/dealer-portal.
2  wireframe-analyzer   Mode: new-project. UX HTML: inputs/ux/**/*.html. Client FSD doc: none — derive names and rules from the screens; list what you had to guess as open questions.
2b library-advisor      Mode: new-project. UX HTML: inputs/ux/**/*.html. No FSD doc and no API spec — ask every question that changes a library.
3  hybrid-api-config    Mode: new-project. No backend spec (no-spec mode: every endpoint mocked and proposed).
4  schema-parser        Mode: new-project. Spec: plan/generated/api-spec.yaml.
5  mock-data-generator  Mode: new-project.
6  fsd-planner          Mode: new-project. client-fsd=none (waived by human).
7  coverage-checker     Mode: new-project. stage=plan. UX HTML: inputs/ux/**/*.html.
   ── Gate 1 — the important one here:
      • plan/library-decisions.md: each `proposed` row has a pick, an alternative and the npm facts → approve
        (`node tools/task.mjs approve-libs --all-proposed`, or by capability name), or set `rejected`
      • plan/requirements-questions.md: fill the Answer column (blank = the default in that row applies)
        an answer that changes a library → re-run:  library-advisor  Mode: new-project. delta=true. Answers: plan/requirements-questions.md.
      • analysis/ open questions, plan/generated/backend-gaps.md (every endpoint is a proposal for the backend team)
      → node tools/task.mjs save-plan "Gate 1"
8  app-bootstrap        Mode: new-project. Run L.   (re-checks every package with lib-facts --strict, then installs)
… then steps 9–15 of section 1.
```
Want to see the facts yourself? `node tools/lib-facts.mjs @tiptap/react react-dropzone` — pin, license, React 19, last release.

## 1c. One screen of a bigger spec (scoped build) — the budget-friendly way
Example: the FSD and the prototype contain every screen, but you only want the login page now.
**Do not rely on telling each agent "only login"** — they still have to read the whole files to find it, in every session.
Slice once (free), then point every agent at the slice:
```
node tools/scope.mjs init "login page"      # writes inputs/scope.md — open it, check the Keywords line (add the words your FSD uses)
node tools/scope.mjs slice                  # writes inputs/scoped/** — read the report: is anything you need under "dropped"?
                                            #   yes → node tools/scope.mjs slice --also "forgot password"
node tools/task.mjs save-plan "scope"
```
Then the same flow as 1 / 1b with three differences:
1. Every step line uses the sliced paths: `UX HTML: inputs/scoped/ux/**/*.html. Client FSD doc: inputs/scoped/fsd-spec.md. Backend spec: inputs/scoped/api/<file>.`
   (and add `Scope: see inputs/scope.md.`) — agents read `inputs/scope.md` first and ignore everything else.
2. The architect writes at most **2 TASKs** for a single screen (everything below the page, then page + route).
3. Skip `coverage-checker` at the end of Phase 1 and at stage=tasks if budget is tight — Gate 1/2 reading `plan/` replaces it.
   Keep `stage=release` only for the final check, or let the reviewer's design check stand in.
**Budget check:** `node tools/scope.mjs show` prints the tokens saved. Run `node tools/task.mjs next` whenever you are unsure which agent is next.

## 2. Feature in an existing project
Example: add an Order History screen. Put `inputs/ux/order-history.html` in place (and the updated YAML if the backend changed).
```
1  codebase-scanner     Mode: feature.        (returns "current" quickly when PROJECT.md is up to date)
2  app-bootstrap        Mode: feature. Run B. Branch name: feat/order-history.
3  hybrid-api-config    Mode: feature. delta=true. Changed inputs: inputs/api/backend-api.yaml.   ┐ only if the YAML
4  schema-parser        Mode: feature. delta=true. Spec: plan/generated/api-spec.yaml.          │ is new or changed
5  mock-data-generator  Mode: feature. delta=true.                                               ┘
6  wireframe-analyzer   Mode: feature. delta=true. New screens: inputs/ux/order-history.html.  ┐ only if there
6b library-advisor      Mode: feature. delta=true. New screens: inputs/ux/order-history.html.  ┘ is new HTML
7  fsd-planner          Mode: feature. delta=true. Feature: dealers see their past orders with status and a date filter. Place new slices inside the EXISTING structure.
8  coverage-checker     Mode: feature. stage=plan, scope=new screens: inputs/ux/order-history.html.
   ── Gate 1 (short: where the new slices go, API gaps)   → save-plan   → app-bootstrap Run L if libraries were approved
9  architect            Mode: feature. delta=true.
   ── Gate 2   → save-plan
10 store-architect      Mode: feature. delta=true.
11 styling-engineer     Mode: feature. delta=true.     ← only if the screen needs new tokens
   ── task loop
12 reviewer             Mode: feature. scope=release. Baseline from PROJECT.md.
13 coverage-checker     Mode: feature. stage=release, scope=new screens: inputs/ux/order-history.html.
   ── Gate 3
```
Not an FSD / RTK Query / Tailwind project? Nothing changes for you — every agent follows PROJECT.md instead of AGENTS.md.

## 3. Bug
Example: Retry on the Indent screen does nothing. Pick the next free id (BUG-001). Give steps, expected and actual in plain words.
```
1  codebase-scanner     Mode: bugfix.
2  app-bootstrap        Mode: bugfix. Run B. Branch name: fix/indent-retry.
3  debugger             Mode: bugfix. mode=diagnose. Id: BUG-001.
                        Bug: Retry on the Indent screen does nothing.
                        Steps: open /indent with the API mock returning 500, click Retry.
                        Expected: the list reloads. Actual: nothing happens, no request is sent.
4  architect            Mode: bugfix. mode=bugfix. BUG-001 — diagnosis in plan/history/BUG-001.md.
   → node tools/task.mjs save-plan "BUG-001 diagnosis"
   ── task loop for BUG-001 (always tests first: the regression test must FAIL before the fix)
5  reviewer             Mode: bugfix. scope=task, BUG-001. Baseline from PROJECT.md.
   ── Gate 3: the RED → GREEN evidence in plan/history/BUG-001.md + the reviewer's result
```
No Gate 1 or 2. The debugger says `browser-only` and the project has no Playwright → it asks you: add Playwright
(app-bootstrap Run B, needs your OK), fix with manual verification steps, or stop.
Several bugs → one BUG id each, one after the other.

## 4. Delta change — inputs changed, or something is missing
Example A: the backend sent a new YAML that adds `discount` to orders.
Example B: the UX team updated `inputs/ux/indent.html` with a new "Remarks" column.
Always let the coverage-checker find the gaps first:
```
1  coverage-checker     Mode: gap-fill. stage=release. UX HTML: inputs/ux/**/*.html.     → gaps in plan/coverage-matrix.md
2  app-bootstrap        Mode: gap-fill. Run B. Branch name: feat/indent-v2.
```
Then by gap type — API first, then UI. Add `delta=true. Changed inputs: <files>.` to every step line:

| Gap | Run, in this order |
|---|---|
| API changed (A) | hybrid-api-config → schema-parser → mock-data-generator → store-architect |
| UX HTML changed (B) | wireframe-analyzer → library-advisor → fsd-planner → coverage-checker (`stage=plan`) → Gate 1 → architect |
| Element missing, HTML unchanged | architect: `Mode: gap-fill. delta=true. New TASKs from the gaps in plan/coverage-matrix.md.` |
| Colour or token wrong | styling-engineer |
| Behaviour wrong | → the bug flow (section 3) |

Example A, written out:
```
3  hybrid-api-config    Mode: gap-fill. delta=true. Changed inputs: inputs/api/backend-api.yaml.
4  schema-parser        Mode: gap-fill. delta=true. Spec: plan/generated/api-spec.yaml.
5  mock-data-generator  Mode: gap-fill. delta=true.
6  store-architect      Mode: gap-fill. delta=true.
7  architect            Mode: gap-fill. delta=true. New TASKs for the changes in plan/generated/api-changes.md.
```
Then: Gate 2 (new or changed tasks only) → save-plan → task loop → reviewer (`scope=release`) → coverage-checker
(`stage=release`) → Gate 3.

## 5. New module
Example: a Reports module — 3 screens, new endpoints, a new `report` entity.
Use the **feature** flow (section 2) with every optional step on (3–6 and 10–11) and both gates. Two additions:
1. Describe the module in a short section of `inputs/fsd-spec.md` (screens, users, rules, permissions), then:
   `fsd-planner  Mode: feature. delta=true. Feature: Reports module — see inputs/fsd-spec.md §Reports. Place new slices inside the EXISTING structure.`
2. Many tasks → run the reviewer every 4 tasks (`scope=batch`) instead of waiting for the release review.
The module is really a separate app in its own repository? Use the **new-project** flow instead.

## 6. Quick change (≤ 3 source files, no new endpoint / slice / route / state)
Example: rename "Submit" to "Place order" on the cart.
```
1  codebase-scanner     Mode: quick.
2  app-bootstrap        Mode: quick. Run B. Branch name: fix/place-order-label.
3  architect            Mode: quick. mode=quick. Change: rename the Submit button on /cart to "Place order".
   → save-plan → task loop (the tester only if the Files table has test rows)
4  reviewer             Mode: quick. scope=task, TASK-NNN.
```
The architect answers "not quick" → use the feature or bug flow with the same request.

---

## Which flow?
| You have | Flow |
|---|---|
| empty repo + FSD doc + screens | 1 · new project |
| empty repo + only HTML prototypes | 1b · new project from prototypes |
| spec and prototype cover many screens, you want ONE now | 1c · scoped build (slice first) |
| a new screen or capability in a project that exists | 2 · feature (5 · new module if it's several screens + a new entity) |
| something that worked, or should work, and doesn't | 3 · bug |
| the YAML or the HTML changed, or a screen is missing an element | 4 · delta change |
| a label, a colour, one prop | 6 · quick change |
