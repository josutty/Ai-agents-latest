# Running only ONE screen (example: the Home screen of dealer.html)

Do **not** just tell each agent "only Home" — they still read the whole files. Slice the inputs first, then point every agent at the slice.

## What the slicer does with this prototype (tested)
- **UX file (`dealer.html`):** kept whole. Home and the Indent workbook live in one file and are switched by JavaScript, so the file cannot be cut. The `Screens:` line (step 1) is what keeps the other screens out.
- **FSD (`fsd-spec.md`):** only 3 of 27 sections matched the word "home"; the Dealer and Indent sections were dropped. Widen the keywords (step 1).
- **Backend YAML:** 0 paths matched. The agents will propose and mock the endpoints, which is fine for a first screen.

---

## Step 0 — install the project first (app-bootstrap Run 1)
The slicer and the design tools need packages (`jsdom`, `@playwright/test`) that **app-bootstrap Run 1** installs. Run it first:

| # | Agent | Prompt to type |
|---|---|---|
| 1 | app-bootstrap | `Mode: new-project. Run 1 (Phase 0). Branch name: feat/dealer-home.` |

Also check:
- Node is **22.18+ or 24.0+** (`node -v`) — Node 24.7 and 24.12 are fine. Older versions break `jsdom` and `steiger`.
- `npx playwright install chromium` (the design tools open the prototype in a browser). If PowerShell blocks `npm` / `npx`, prefix the same command with `node tools/run.mjs`.

If you see `Cannot find package '@playwright/test'`, Run 1 has not run yet (or `npm install` has not finished).

## Step 1 — slice (free, no model is used)
```
node tools/scope.mjs init "home screen" --keywords "home,dashboard,dealer,indent progress,summary,needs attention"
```
Open `inputs/scope.md` and add one line so the agents know exactly which screen:
```
Screens: dealer.html#vHome (and the shared top bar)
```
Then:
```
node tools/scope.mjs slice
```
Read the report. If something you need is listed under "dropped", add its words and slice again:
```
node tools/scope.mjs slice --also "<word>"
```
Save it:
```
node tools/task.mjs save-plan "scope"
```
`node tools/scope.mjs show` prints what was kept and dropped.

---

## Step 2 — run the rest of the agents in order, with the sliced paths
Add `Scope: see inputs/scope.md.` to every prompt. (`/new-project` uses the full inputs, so use this by-hand order. Step 1 of the order, app-bootstrap Run 1, is already done in Step 0.)

| # | Agent | Prompt to type |
|---|---|---|
| 2 | wireframe-analyzer | `Mode: new-project. UX HTML: inputs/scoped/ux/**/*.html. Client FSD doc: inputs/scoped/fsd-spec.md. Scope: see inputs/scope.md.` |
| 2b | library-advisor | `Mode: new-project. UX HTML: inputs/scoped/ux/**/*.html. Scope: see inputs/scope.md.` |
| 3 | hybrid-api-config | `Mode: new-project. Backend spec: inputs/scoped/api/backend-api.yaml (partial). Scope: see inputs/scope.md.` |
| 4 | schema-parser | `Mode: new-project. Spec: plan/generated/api-spec.yaml. Scope: see inputs/scope.md.` |
| 5 | mock-data-generator | `Mode: new-project. Scope: see inputs/scope.md.` |
| 6 | fsd-planner | `Mode: new-project. Client FSD doc: inputs/scoped/fsd-spec.md. Scope: see inputs/scope.md.` |
| 7 | coverage-checker | `Mode: new-project. stage=plan. UX HTML: inputs/scoped/ux/**/*.html. Scope: see inputs/scope.md.` |

**Gate 1**, then steps 8–15 (Run L, architect, coverage-checker, Gate 2, store-architect, styling-engineer, app-bootstrap Run 2, the task loop, reviewer, coverage-checker, Gate 3) are exactly as in `RUN-ORDER-new-project.md`. Keep `Scope: see inputs/scope.md.` in each prompt, and use `inputs/scoped/ux/**/*.html` wherever a UX path is given.

For a single screen the architect writes at most **2 tasks** (everything below the page, then the page and its route). If budget is tight you may skip `coverage-checker` at `stage=plan` and `stage=tasks`; reading `plan/` at the gates replaces it. Keep `stage=release`.

---

## What to check at Gate 1 (scoped run)
1. **`analysis/interactions.md` still lists all screens.** The crawler clicks through the whole file. The analyzer and coverage-checker were given a rule to ignore rows outside your `Screens:` line (the shared top bar stays in scope). Check that `analysis/components.md` has an **Out of scope** section for the Login and Indent workbook rows, and that nothing for them is planned.
2. **Links to the Workbook.** Home has "Continue indent →", "Open →" and "Show →", which go to the Workbook. That screen is not built, so expect an Open question about where they should go. Answer it in `plan/requirements-questions.md`.
3. **The Export window.** It opens from Home, so it is in scope. Keep it.
4. **The slice report.** Anything you need under "dropped" must be added with `--also` before you continue.

## Adding the next screen later
Edit `inputs/scope.md` (add the screen to the `Screens:` line and any new keywords), run `node tools/scope.mjs slice` again, then use `Mode: feature` or `Mode: gap-fill` for the new screen (see `PROMPTS.md`, sections 2 and 4).

## Not tested
I tested the slicer on `dealer.html`. I have not run this scoped flow end to end with the agents.
