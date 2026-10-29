# Agent team — revision changelog

## 22 Oct — manual-mode hardening, hooks, fewer tokens

Goal: excellent results with fewer tokens when you run agents by hand (SENIOR-WORKFLOW.md), without weakening team runs.

### Fixed (were real gaps)
| Gap | Fix |
|---|---|
| Plain / manual sessions had no guard: frontmatter hooks only run for a named agent | Project-level task-scope + secrets hook: `.claude/settings.json` (Claude), `.opencode/plugins/agent-team.js` (OpenCode, every agent incl. Build), every agent's frontmatter (Copilot). New **pack-builder** / **pack-tester** agents for pack sessions |
| Claude: MCP write tools (e.g. serena `replace_symbol_body`) skipped the agent-guard | Hook matcher now also matches `mcp__.*`; guard classifies MCP tools by name + path |
| coder / debugger had `bash: "*"` + deny list (`cat > file`, `node -e`, `npx <pkg>`, `$(…)` got through) | Allowlists for coder, debugger, pack agents; guard splits commands quote-aware, checks `$(…)`/backticks, treats `> file` / `tee` as edits; `npx -y` denied everywhere |
| No formatter | Prettier 3 + eslint-config-prettier + lint-staged in the stack; format-on-write hook (only if the project has a Prettier config) |
| app-bootstrap could edit the team's own tools | `tools/hooks/**` and the shipped tools are humans-only |
| Copilot / OpenCode: team agents not selectable by hand | Copilot `user-invocable: true`; OpenCode `mode: all` |
| Claude opened every session as the orchestrator | `"agent"` removed from settings; team runs: `claude --agent orchestrator` |

### Fewer tokens
| Change | Saving (measured on the reference app where noted) |
|---|---|
| "Read first: AGENTS.md" removed from all 19 agents — every tool already loads it | ~3k tokens per agent dispatch |
| AGENTS.md split: team mechanics → `agent-docs/rules/team-protocol.md` | AGENTS.md 11.8 KB → 9.1 KB in every session |
| Packs no longer copy AGENTS.md (`--with-core` to add), only the UI-convention topics the task needs, design-fidelity tool notes only for pages | builder pack 4,342 → 3,250 tokens (−25 %) |
| Builders self-check (`task.mjs check` / `red`) from the pack | one fewer human round-trip per task |
| Team runs: test-engineer writes the builder pack; builders read it instead of task + rules + spec | builder input ≈ pack size |
| Batch review is the default (1 reviewer per 4 TASKs; BUGs / quick keep 1 per task; `review: every-task` restores the old way) | ~75 % of reviewer tokens |
| `list-html-elements.mjs` and `check-contrast.mjs` ship in `tools/` instead of being retyped by app-bootstrap | one template read + two files of output per project |
| Claude: explicit `tools:` for 12 agents; all MCP servers off by default | smaller tool lists per turn |

### Better results
- `agent-docs/rules/pinned-apis.md` — the right syntax per pinned major (zod 4, Tailwind 3.4, MSW 2, RTK 2, Storybook 8 …); in every pack.
- ESLint rule against `dangerouslySetInnerHTML` (XSS).
- app-bootstrap Run L: `npm audit --omit=dev --audit-level=high` before committing new libraries.
- `.github/workflows/quality-gates.yml` — CI runs the same gates + gitleaks + npm audit on every push / PR.
- `.githooks/pre-commit` — base-branch block + lint-staged + gitleaks (if installed).
- `set-models` and `check-install` warn when all tiers share one model or the reviewer uses the coder's model.
- Agents that mention serena/qartez now say how to do the same lookup with Grep/Read when MCP is off.

### Models (22 Oct, same day)
- Tiers per agent: **store-architect → strongest** (it builds the data layer every agent uses; runs once) and
  **coverage-checker → strong** (it feeds every gate). Everything else unchanged.
- Shipped model names, checked against each tool's model list on 22 Oct 2026:
  | Tier | Claude Code | Copilot | OpenCode Go |
  |---|---|---|---|
  | strongest | `opus` | Claude Opus 5.5 | `deepseek-v4-pro` |
  | strong | `sonnet` | Claude Sonnet 5.5 | `deepseek-v4.1-flash` |
  | reviewer | `opus` | GPT-6.1 Sol | `glm-5.2` |
  | fast | `haiku` | Claude Haiku 5.5 | `deepseek-v4.1-flash` |
- Copilot previously used Claude Opus 4.7 and GPT-5.4, both retired in October 2026. OpenCode previously used
  `deepseek-v4-flash`, no longer on the Go list. `set-models.mjs` has been run, so every agent file already carries its model.

### Prompts cheat sheet + save-plan (22 Oct, same day)
- `PROMPTS.md`: the agent order and copy-paste step lines for a new project, feature, bug, delta change (gap-fill),
  new module and quick change, with worked examples. Linked from PLAYBOOK.md and SENIOR-WORKFLOW.md.
- `node tools/task.mjs save-plan "<message>"`: commits the planning agents' output (plan/, analysis/, notes/, inputs/,
  PROJECT.md, generated API types). Those agents can't commit, so in manual mode `start` refused a dirty tree after
  planning. Zero tokens; lists anything else it left alone; does nothing with `git: off`.

### Library advisor (22 Oct, same day)
- New agent **library-advisor** (strongest tier), right after wireframe-analyzer in new-project, feature and gap-fill runs:
  one decision per detected capability — plain JSX when enough, else a pick + one alternative with CURRENT npm facts —
  and `plan/requirements-questions.md` for what the HTML can't show (languages, login type, offline, devices …), each
  with a default. The base stack stays fixed; a client-required swap becomes a question, never a proposal.
- New tool `tools/lib-facts.mjs <pkg>[@range] …`: pin (newest stable ≥ 14 days old), license vs allowlist, React 19
  peer support, types, last release, weekly downloads, size. ✘ (license, React 19, deprecated, not on npm) blocks;
  ⚠ (stale, no types) needs a one-line reason. Example catch: react-leaflet is Hippocratic-2.1 → MapLibre instead.
- Detector learns rich-text, file-upload, map, export, carousel and i18n (no change on the reference prototypes).
- `libraries.md`: selection rules, statuses (`proposed` / `approved` / `needs-approval` / `rejected`), 8 new catalog rows.
- `node tools/task.mjs approve-libs --all-proposed | <capability …>` flips Status at Gate 1.
- fsd-planner plans WITH the advisor's decisions (adds only `needs-approval` rows for anything missed); orchestrator,
  coverage-checker (lists open decisions + unanswered questions for Gate 1), app-bootstrap Run L (`lib-facts --strict`
  before installing) and wireframe-analyzer updated. PROMPTS.md: new section 1b — new project from HTML prototypes only.

### Budget and guard fixes after a real run (22 Oct, same day)
A real Copilot run of one login screen (new-project, 1,900-unit budget, 32 % already used) spent ~712 units on planning before the first
task and then died in Task 1. Findings and fixes:
| Finding | Fix |
|---|---|
| **Bug:** the task-scope hook treated `create_directory` as an edit of a file outside the Files table → every new feature was denied at its first step | Folder tools are never scope-checked; a folder holding a listed file is allowed; Copilot's string-typed `toolArgs` are parsed (they bypassed the hook before) |
| **Bug:** the command allowlist denied nearly every PowerShell command (`cd x; npm …`, `Get-Content`, `Select-Object`, `mkdir`, `$env:CI=…`) → denial loops, each retry costing tokens | Read-only PowerShell/cmd commands, `cd`, folder creation and env assignments allowed for every agent with a shell allowlist; writers (`Set-Content`, `Out-File`, `Remove-Item`, redirects) still denied |
| Denials led to retries and to switching to the orchestrator (≈430 units) | Denial message and every agent now say STOP (no variants); pack agents never switch agents; new free `node tools/task.mjs next` names the agent + prompt for the current state; PROMPTS.md "Lost? Stuck?" box |
| "Only login" in the prompt does not stop agents reading the whole FSD and every screen — in every one of ~14 sessions | New `tools/scope.mjs` (init / slice / show): slices UX HTML (screens inside combined files), FSD by heading, OpenAPI paths + referenced schemas into `inputs/scoped/**`; team-protocol §0b; check-install warns on a stale slice |
| 5 TASKs for a login page (the "one slice per TASK" rule) | Single-screen scope → ≤ 2 TASKs (architect rule) |
| Agent files are small (5–13K tokens loaded per session); cost is turns on a growing context | team-protocol §0c turn economy (batch reads, write once, no read-back, no narration) pointed to from every agent |
| 3 Opus agents ≈ 270 of ~1,290 usable units; store-architect had been moved to the top tier by me | store-architect back to `strong`; Copilot `models.json` is a BUDGET profile: Sonnet 5 only for wireframe-analyzer, library-advisor, fsd-planner, architect, debugger; Haiku 5.5 elsewhere; no Opus |
Not done (deliberately): merging or removing planning agents — you asked to keep the full process; deterministic replacements for schema-parser /
coverage-checker are the next candidates if the budget is still tight.

### New files
`tools/scope.mjs` · `tools/hooks/{scope-lib,pre-tool,format}.mjs` (+ `stop-check.mjs`, Claude) · `tools/list-html-elements.mjs` · `tools/check-contrast.mjs` ·
`tools/port-drift.mjs` (maintainers) · `agent-docs/rules/team-protocol.md` · `agent-docs/rules/pinned-apis.md` · pack-builder / pack-tester agents ·
`.github/workflows/quality-gates.yml` · `.opencode/plugins/agent-team.js` (OpenCode)

### Options (`plan/run-options.md`, one line each)
`scope-guard: off` · `format: prettier-only` or `format: off` · `autocheck: on` (Claude, manual mode only) · `review: every-task`

### Verify in your setup
1. OpenCode: if your version loads plugins only from `.opencode/plugin/` (singular), rename the folder.
2. Copilot: hooks in agent frontmatter are a VS Code preview feature — `node tools/check-install.mjs` checks the two settings.
3. OpenCode `models.json`: all four tiers are still one model. Put your strongest model in `strongest` and a different one in `reviewer`, then `node tools/set-models.mjs`.
4. CI: organization-owned GitHub repos need a free `GITLEAKS_LICENSE` secret for the gitleaks step (or delete the step).

## Earlier revisions

## New file: AGENTS.md
Single source of truth for conventions: stack pins, FSD import matrix, data contract, styling,
testing, quality-gate commands, git rules, sensitive-data policy, HANDOFF format, file ownership.
OpenCode loads `AGENTS.md` from the project root into every agent, so put it at the repo root.
Agent files now reference it instead of repeating (and contradicting) each other.

## Architecture decisions made (review these first)
| Decision | Was | Now | Why |
|---|---|---|---|
| Server data | hand-written thunks + normalized slices | RTK Query (`baseApi` + `injectEndpoints`) | loading/error/cache/tags built in; removes most store bugs |
| Client state | nested `entities/features` reducers | `combineSlices` + `slice.selectors` | nested plain objects in `configureStore` don't work |
| RootState | imported from `@app` everywhere | global types in `app/store/types.d.ts` | removes the upward-import FSD violation |
| Test runner | Jest + ts-jest | Vitest (config inside vite.config.ts) | same aliases/env as Vite; no ESM/jsdom/MSW polyfill pain |
| Types from spec | LLM-written interfaces | `openapi-typescript` (deterministic) + alias file | no hallucinated fields |
| Spec format | custom JSON | valid OpenAPI 3 + `x-mock` / `x-proposed` | schema-parser, redocly and MSW all need real OpenAPI |
| Mocks location | `src/__mocks__` | root `mocks/` and `test/` | outside FSD layers (Steiger), no clash with Vitest `__mocks__` |
| Dev API modes | `NODE_ENV` + `REACT_APP_`/`VITE_` mix | `VITE_API_MODE` = mock / hybrid / real | hybrid = MSW only for mock endpoints, real ones pass through |
| FSD layers | no widgets, `store/types/hooks` segments | + `widgets/`, `ui/model/api/lib/config` | standard FSD; Steiger understands it |
| FSD validation | qartez at plan time (empty graph) | Steiger + ESLint in `npm run lint`; qartez optional | deterministic, works without MCP |
| Styling | hex tokens + `dark:` everywhere + CSS modules | semantic CSS-variable tokens, Tailwind 3.4 pinned | dark mode automatic; one styling mechanism |
| Contracts | prose rules | ESLint rules (max-lines 250, no fetch/axios/style/hex/console/any) | machine-enforced |

If you prefer to keep Jest or hand-written thunks, tell me and I'll revert those parts only.

## Workflow changes (orchestrator)
- Phase 1 order: wireframe-analyzer → hybrid-api-config → schema-parser → mock-data-generator → fsd-planner.
- mock-data-generator ALWAYS runs (tests need handlers even with a complete backend).
- Store + styling are a Phase 3a foundation (the only parallel step), not per-task work.
- Explicit per-TASK loop: test-engineer (RED) → component-generator → coder (GREEN) → reviewer(task).
- app-bootstrap Run 2 moved to after all TASKs; reviewer runs again at release scope.
- Every subagent returns `next=orchestrator`; full routing table incl. BLOCKED-TEST, NEEDS-RESEARCH from any agent, loop guards.
- Gate 1 rejection routes to the agent that produced the rejected artifact (not architect).

## Per-file changes
| File | Main fixes |
|---|---|
| 00b-hybrid-api-config | OpenAPI output; runs after wireframe-analyzer; query-param gaps ≠ new endpoints; backend-gaps.md; no-spec mode; removed localStorage idea; valid HANDOFFs |
| 01-schema-parser | openapi-typescript; bash allowlist for lint/tsc; carries mock flag into endpoints-map.json |
| 02-wireframe-analyzer | can now write `analysis/**`; API-neutral data needs; new design-tokens.md |
| 03-fsd-planner | widgets layer; component Kind (presentational/connected/page); RTK Query integration table |
| 04-architect | TASK Files table with owner per file; sizing/order rules; no longer writes store-design.md |
| 05-store-architect | RTK Query baseApi (auth, 401 event, error normalization); fixed selectors; makeStore for tests |
| 5_5-mock-data-generator | typed handlers for every endpoint; seeded faker; db + resetDb; test scenarios; browser/node split; PII rule |
| 06-component-generator | presentational only; tokens; stories with `fn()` + fixtures; can't edit tests |
| 07-styling-engineer | CSS-variable semantic tokens; Tailwind 3.4 config fixed; contrast check; runs before components |
| 08-test-engineer | Vitest; true RED-first per TASK with valid-RED rules; fresh store per test; fixed example bugs |
| 09-coder | connected components + pages; bash denies for destructive git/npm install; Cortex removed |
| 10-reviewer | bash allowlist; command-backed gates A–F; diff-vs-Files scope check; fixed grep syntax; PII scan |
| 11-orchestrator | see workflow changes above |
| 12-app-bootstrap | pinned deps; all configs incl. ESLint/Steiger/Storybook; `msw init`; branch; error boundaries; env module |
| 13-researcher | source search order; can't overwrite api-schema.md |
| 14-reflector | dedup + ESCALATE on recurrence; proposes concrete prompt edits |
| 15-debugger | can't edit tests (BLOCKED-TEST instead); known-failure table for this stack |

## Please verify in your OpenCode version
1. **Permission rule order.** My understanding is that OpenCode applies the LAST matching pattern,
   so every file now lists `"*"` FIRST and specific rules after it. Your original files had
   `"*": deny` LAST, which under last-match-wins would deny everything. Check your version's
   permissions docs; if it is first-match-wins instead, move `"*"` to the end of each block.
2. **bash can bypass edit permissions** (e.g. `sed -i`). Coder/debugger/app-bootstrap have broad
   bash; the reviewer's diff-vs-Files-table check is the real enforcement.
3. **Model tiering.** All agents still use `opencode-go/deepseek-v4-flash`; comments mark
   architect, fsd-planner, reviewer, debugger and orchestrator as candidates for a stronger model,
   and reviewer ideally a different model than coder.
4. **qartez tool names** (`qartez_diff_impact`, `qartez_cochange`, `qartez_unused`) — confirm they
   exist in your qartez build; agents treat qartez as optional now.
5. **Version pins** (React 19, Vite 6, Vitest 3, Storybook 8, Tailwind 3.4) — adjust in AGENTS.md
   §1 and app-bootstrap if your org standardises on others.

---

# Revision 2 — modes, scanner, coverage, FSD doc

## New
| File | Purpose |
|---|---|
| 16-codebase-scanner.md | Read-only scan of an existing project → `PROJECT.md` (real conventions, command map, baseline failures) |
| 17-coverage-checker.md | Traces every HTML element, UI state, endpoint and data need → component → slice → TASK → file → test; writes `plan/coverage-matrix.md` |
| PLAYBOOK.md | How to install and run the team, with copy-paste prompts for each mode |

## Changed
| File | Change |
|---|---|
| AGENTS.md | §0 modes + `PROJECT.md` precedence (never migrate old code unasked) + delta rules; BUG-NNN ids; new owned files |
| 11-orchestrator | Intake step; four modes (new-project, gap-fill, feature, bugfix) with their own routes; coverage checks before every gate; hybrid-api-config now always runs so later YAML versions can be diffed |
| 00b-hybrid-api-config | Delta mode: merges new backend YAML into the baseline, flips mock → real, records contract drift in `api-changes.md` |
| 01-schema-parser | Delta: stable alias names, reports files that stop compiling |
| 02-wireframe-analyzer | `Source:` selector per component (for tracing); delta mode + `analysis/CHANGES.md` |
| 03-fsd-planner | Client FSD doc REQUIRED in new-project mode and authoritative; compliance table; delta/feature placement from PROJECT.md |
| 04-architect | Delta TASKs from coverage gaps (`Closes gaps:`); BUG-NNN template |
| 05-store-architect | Delta from api-changes.md; extends an existing project's own data mechanism instead of adding RTK Query |
| 5_5-mock-data-generator | Delta: new handlers, real endpoints leave `mockOnlyHandlers` |
| 08-test-engineer | Bugfix regression-test rule (must fail on current code for the reported reason) |
| 10-reviewer | Compares against PROJECT.md baseline — pre-existing failures aren't blamed on the agents |
| 12-app-bootstrap | Run R (retrofit): adds missing standard npm scripts as aliases, never new tools; ships `tools/list-html-elements.mjs` |
| 15-debugger | `mode=diagnose` for bug reports: root cause first, no fix before the regression test |

## Important: agent names
OpenCode names agents after their file names. Rename the files as listed in PLAYBOOK.md,
otherwise the orchestrator's dispatches (`coder`, `reviewer`, …) won't find them.

---

# Revision 3 — branch safety, non-FSD projects, browser-only bugs

## Fixed
| File | Change |
|---|---|
| orchestrator, app-bootstrap, AGENTS.md §7 | **Run B** always runs first in feature / bugfix / gap-fill: creates `feat/<name>` or `fix/<slug>` from the base branch, stops on a dirty tree. Previously a run on a project with all scripts present committed to whatever branch was checked out. Retrofit folded into Run B. |
| codebase-scanner | Records `base-branch` in PROJECT.md; test commands run with `CI=true` (Jest watch mode hung); `-u` deny narrowed to the exact flag (it blocked `git status -uno` etc.) |
| reviewer | Release diff uses `<base-branch>...HEAD` instead of hardcoded `main`; P0 if work is on the base branch |
| coder, component-generator, store-architect | Path permissions widened to `src/**` with explicit denies, so non-FSD projects (`src/components`, `src/store`, Next.js `src/app`) are editable. TASK Files table + reviewer scope check remain the real boundary (AGENTS.md §7). |
| coder, debugger, app-bootstrap | bash denies close easy bypasses: `rm *` (was only `rm -rf*`), `sed -i`, `perl -i`, `curl`, `wget`, `git checkout`/`switch`/`stash`. Revert with `git restore --source=<start-sha>`. |
| debugger | Edit permissions now match its own "Never" list (no store/api/config/theme). New **browser-only** path: optional Playwright MCP, otherwise an `unverified` code-reading diagnosis + manual repro steps → BLOCKED for a human decision. |
| coverage-checker | Removed `node -e*` permission (ESM `import` failed without `--input-type=module`, and it let the agent write files). Uses only `tools/list-html-elements.mjs` (Run B ships it) or a grep fallback. |
| orchestrator, fsd-planner | Client FSD doc can be waived explicitly (`client-fsd=none`); backend YAML is optional (no-spec mode already existed but intake demanded a YAML). |
| orchestrator, app-bootstrap | Run 2 is incremental: pages are routed as their TASKs pass, so the app is clickable mid-run. Final Run 2 still checks every page exists. |
| AGENTS.md, fsd-planner, coder | Pages rule aligned with the import matrix: composition only, widgets preferred, features/entities allowed. |
| researcher, hybrid-api-config | `wireframes.html` → `inputs/ux/*.html`; spec path → `inputs/api/…` |
| mock-data-generator | Existing projects use their own base-URL helper; no MSW → BLOCKED instead of assuming |
| PLAYBOOK, README | Waivers, Run B, browser-only bugs, model-tiering table; README filled in |

## Not changed (your decision)
- `model:` lines — pick models from your provider using the PLAYBOOK tiering table.
- Version pins (Tailwind 3.4, Vite 6, Storybook 8) — newer majors exist; bump AGENTS.md §1 + app-bootstrap together if your org wants them.
- test-engineer, wireframe-analyzer, styling-engineer weren't part of this revision's files; check
  they honour Run B (no branch creation of their own), `*.spec.*` test naming, and PROJECT.md paths.

---

# Revision 4 — verified templates, the three missing agents, quick mode, E2E

Method: a reference app was built from the agents' own templates and every quality gate was run on
it (typecheck, ESLint + Steiger, Vitest, coverage, production build, Storybook build, contrast
check). Templates were then re-extracted from the edited agent files and re-run, so the text you
ship is the text that passed. Not executed: Playwright e2e (the verification sandbox couldn't
download a browser) — config and specs typecheck and lint.

## New agents
| File | Purpose |
|---|---|
| wireframe-analyzer | UX HTML → components (props + traceable Source selector), UI states, classified data needs, raw design tokens; delta mode with CHANGES.md |
| styling-engineer | Semantic CSS-variable tokens (light + dark), Tailwind theme, base styles (focus ring, reduced motion), applyTheme(), machine-checked WCAG contrast, design-system.md |
| test-engineer | RED-first tests with classified failure reasons, start-sha, harness (setup + renderWithProviders), Playwright smoke + axe per route, e2e regression tests for browser-only bugs |

## Bugs found by running the templates (each would have blocked or misled the team)
| Where | Problem | Fix |
|---|---|---|
| Steiger config | `insignificant-slice` errors on every slice with ≤ 1 consumer (normal while TASKs land bottom-up); `segments-by-purpose` rejects the `app/store`, `app/providers` folders AGENTS.md requires → `npm run lint` could never pass | `insignificant-slice: warn`; `segments-by-purpose` off for `src/app/**`. Cross-slice imports still fail (verified) |
| store-architect | `ListProductsParams \| void` fails strict lint (`no-invalid-void-type`) | params object, callers pass `{}` |
| component-generator, tests | `productFixtures[0]!` fails strict lint (`no-non-null-assertion`) | `at()` helper in `mocks/lib.ts` |
| ESLint config | `tools/*.mjs` fail `no-undef` (process, console) | node globals for js/mjs/cjs |
| ESLint + reviewer grep | hex rule flagged `href="#add-to-cart"`, missed template literals | tighter selectors + portable ERE grep (both verified) |
| vite.config.ts | Vitest collected Playwright specs from `e2e/` | `test.include` |
| hybrid-api-config, schema-parser | redocly's default ruleset errors on valid specs that only lack summaries/security → BLOCKED on style | `--extends=minimal` decides; style findings go to backend-gaps.md "Spec quality" |
| app-bootstrap deps | unpinned `jsdom` now installs v30 (Node ≥ 22.22); Steiger 0.7 needs Node ≥ 22.18 | Node precondition + `engines` + `.nvmrc`; every dev dep pinned to the verified major |
| app-bootstrap | `"type": "module"` never set, yet every config file is ESM | `npm init` step sets it |
| coder vs component-generator | the two ProductCard examples had different props — copying both didn't compile | slot pattern `actions?: ReactNode` everywhere |
| component-generator | could never report a clean typecheck on mixed TASKs (RED tests import coder files that don't exist yet) | TS2307 in coder-owned test files explicitly allowed and logged |
| orchestrator | the parallel foundation step had two agents committing to one working tree (index.lock collisions, `git add .` staging each other's files) | sequential; path-only staging in AGENTS.md §7; `git add -A/./--all`, `git commit -a` denied |
| test harness | RTL only auto-cleans with Vitest globals (not enabled) | explicit `cleanup()`; matchMedia polyfill |
| app shell | `RouterProvider` from `react-router` (non-DOM entry) | `react-router/dom` |
| Storybook | telemetry on by default | `disableTelemetry: true` |

## New capabilities
- **`quick` mode** — branch → one small TASK → review, for changes ≤ 3 files; architect bounces anything bigger ("not quick").
- **E2E** — Playwright (desktop + mobile) against dev in mock mode; per-route smoke: axe WCAG 2.2 AA in light and dark, no mobile overflow, no console errors. Reviewer gate G. Browser-only bugs get e2e regression tests instead of a human block.
- **AGENTS.md §12 UI conventions** — accessibility bar (WCAG 2.2 AA, targets ≥ 24px, focus, dialogs), forms (react-hook-form + zod 4, verified), routing + `RequireAuth` guard (verified with a redirect test), Intl formatting, performance, responsive.
- **tools/check-contrast.mjs** — contrast is computed, not eyeballed (verified to fail on a bad pair).
- Extractor prints `role` and `data-state`, so UI states in the HTML are traceable.

## Still your decision
- `model:` lines — biggest remaining quality lever (PLAYBOOK tiering table).
- Toolchain age — pins are 1–2 majors behind (Vite 8, Vitest 5, Storybook 10, Tailwind 4, ESLint 10, TS 7, MSW 3, React Router 8 are current) and ESLint 9 is marked unsupported. Upgrade as its own verified revision, all pins together.

---

# Revision 5 — works for non-technical users

| File | Change |
|---|---|
| orchestrator | New "Talking to the human" rules: a plain-language status card after every step, a Problem / Why / numbered-options format for failures, gate checklists with ready replies, typed commands (`status`, `help`, `explain`, `resume`, `undo last step`), recognition of common situations, no raw HANDOFF lines or error codes shown, never asks the human to run git/terminal commands |
| orchestrator | Resume now detects an interrupted step (no final HANDOFF, cut-off files) and re-runs only that agent to repair it |
| orchestrator | A page TASK is not finished until its page is wired — even when told "stop after the review" (this was the cause of the blank "Bootstrapping" screen) |
| app-bootstrap | The placeholder screen tells the user what to say instead of "Bootstrapping…" |
| PLAYBOOK | Plain-language "if something goes wrong" table |

---

# Revision 6 — token optimization (same rules, same output)
| Change | Effect (measured on the agent files) |
|---|---|
| AGENTS.md split: core stays; §4 Styling, §5 Testing, §11 Ownership, §12 UI conventions move to `agent-docs/rules/` and each agent reads only what it needs (the reviewer reads all) | AGENTS.md 3,534 → 2,169 tokens |
| Code templates of test-engineer, component-generator, coder and app-bootstrap moved to `agent-docs/templates/` (byte-identical — verified); agents open them only when writing that kind of file | app-bootstrap 9,219 → 5,845 tokens per call |
| Per-task fixed instructions (test-engineer + component-generator + coder + reviewer) | 22,576 → 19,566 tokens (−13%), re-sent at every agent step |
| Reviewer: coverage and build move to release scope; tests use the dot reporter | less command output per task |
| Every agent: compact command output (`--reporter=dot`, `--logLevel warn`), read failing lines only | 545 vs 994 bytes per test run on the reference app |
| Orchestrator keeps only HANDOFF lines + one-line summaries; ends every batch of 4 tasks with a fresh-session suggestion | orchestrator 8,093 → 6,828 tokens per call, history no longer grows across the whole run |
No rule was removed: every line of the old AGENTS.md exists in the new AGENTS.md or a rules file (checked by script).

---

# Revision 7 — automatic library decisions; complex features can't get lost
| Change | Where |
|---|---|
| `tools/detect-ui-capabilities.mjs`: reads the HTML screens and reports data grids (frozen column, grouped headers, editable cells, sortable, totals, horizontal scroll), dialogs, menus, tabs, tooltips, comboboxes, date pickers, charts, drag-drop, toasts, long lists — deterministic | wireframe-analyzer, coverage-checker |
| `agent-docs/rules/libraries.md`: decision rules, pinned catalog, "plain is fine when…", capability test recipes | read by the planning agents, test-engineer, reviewer |
| `plan/library-decisions.md` (fsd-planner) approved at Gate 1; app-bootstrap **Run L** installs only approved rows | orchestrator, app-bootstrap |
| Every feature → TASK Acceptance bullet + test line (architect) → test (test-engineer) → library import (component-generator/coder) | architect, test-engineer, builders |
| coverage-checker `Capabilities` table traces every feature plan → task → code → test; a ✘ blocks the stage | coverage-checker |
| reviewer: P0 for unapproved dependencies; P1 for a hand-built capability or a missing capability test | reviewer |
| `agent-docs/templates/data-grid.md`: TanStack Table v8 grid — frozen column, grouped headers, editable cells with previous value, keyboard movement, search, totals. Verified: typecheck, ESLint + Steiger, 7 tests, build | component-generator, coder, test-engineer |

---

# Revision 8 — design fidelity: measured, copied, compared
Problem found: the builders never opened the HTML design — they worked from a text description, so labels, columns,
sizes and colors drifted. Fix, verified on a recreation of the indent screen: an old-style build had **51 differences**;
the new process reached **0** (labels, columns, groups, widths, fonts, colors, lines, controls, chips, display rules).
| Change | Where |
|---|---|
| `tools/design-spec.mjs`: `extract` measures a design in Chromium; `compare` diffs design vs build (content / rule / style) + screenshots | wireframe-analyzer, builders, reviewer |
| `agent-docs/rules/design-fidelity.md`: copy labels exactly, tokens from the measured palette, never invent display rules, tolerances | 6 agents |
| `analysis/design-spec/*`, `analysis/display-rules.md` (+ Gate 1 questions about unclear rules) | wireframe-analyzer, orchestrator |
| Every UI TASK gets a Design section; page TASKs must reach 0 content/rule differences | architect, component-generator, coder |
| Reviewer design check: content/rule difference = P0; Gate 3 shows design.png vs build.png | reviewer, coverage-checker, orchestrator |
| Tokens from the palette (accent, primary-soft, inverse; label/overline/micro sizes) | styling-engineer |
| Detector + catalog: toggle-group (Radix ToggleGroup), column-visibility (Columns picker) | libraries.md, detector |
| Grid template: vertical lines, density, column picker, per-column classes, display rules, Radix test setup | data-grid.md, test-engineer |

---

# Revision 9 — speed
Measured on the reference app, per round of checks: typecheck 11.3s → 4.8s (incremental), lint 4.6s → 1.7s
(cache / task files), tests 15.7s → 5.2s (only related tests), Storybook build 19s per task → once at release.
One check round: ~53s → ~12s. Agents run several rounds per task.
| Change | Where |
|---|---|
| Fast checks inside a TASK; full set once in the reviewer; Storybook/coverage/e2e/all-screens design check at release | AGENTS.md §6, component-generator, coder, test-engineer |
| tsconfig `incremental`, ESLint `--cache` in new projects | app-bootstrap |
| Small TASKs (≤ 2 files): one builder — 3 hand-offs instead of 4 | architect |
| `fast` / `batch: all`: no stop every 4 tasks; status card shows time per task + ETA from ⏱ lines | orchestrator, all builders |
| Copilot + Claude Code: routine commands and edits pre-approved (guard still limits each agent) | .vscode/settings.json, .claude/settings.json |

---

# Revision 10 — lite mode (opt-in)
| Change | Where |
|---|---|
| Every TASK carries `tests: first | after`; rules for which is which (unsure → first; BUGs always first) | architect |
| Lite loop: tests-first TASKs as before; tests-after TASKs build directly; per 4 TASKs one batch test step + one batch review | orchestrator |
| Builders can be first on a TASK (record start-sha, status in-progress → built) and must pass fast checks + design check | coder, component-generator |
| `scope=batch` for tests (must pass) and review (all gates, per-TASK findings) | test-engineer, reviewer |

---

# Revision 11 — tuned from the pilot run (login screen)
Pilot findings: ~1h35m for one page task (33 min logged agent work, ~1h in reviewer/orchestrator gaps), a design
check that reported 215 meaningless differences, and a login screen with a white page instead of navy.
Verified in the sandbox on a recreation (multi-screen `dealer.html`): a build with the pilot's mistakes → 8 blocking
differences (navy background, card, logo placement, missing cycle banner, "Forgot password?" placement and line,
"Request failed"); a correct build → 0. Indent screen regression: still 0.
| Change | Where |
|---|---|
| `design-spec.mjs`: `file.html#screen-id` scope; page background, card, text placement (card / align / same line), inputs; severities content/rule/layout block, style needs a reason, data = info; hidden screens ignored | tool, design-fidelity.md, reviewer |
| Page TASKs wire their own route (coder owns router.tsx/routes.ts rows); app-bootstrap writes the app shell once after the foundation | coder, architect, app-bootstrap, orchestrator |
| `plan/run-options.md` keeps `lite`/`fast` across resumes; lite never dispatches per-task reviews; model requests in prompts are redirected to models.json | orchestrator |
| Builders and test-engineer run Steiger; tests never import `@app/*` | AGENTS.md §6, coder, component-generator, test-engineer |
| Run L before any TASK; its commits are exempt from the scope check | app-bootstrap, reviewer |
| Reviewer: related tests per task, full suite per batch/release, ⏱ timing line | reviewer |
| `.env.development` → `npm run dev` uses mocks | app-bootstrap |
| Never hard-code the design's sample data as a fallback | design-fidelity.md |

---

# Revision 12 — senior-developer workflow
| Change | Where |
|---|---|
| `tools/task.mjs` (Node built-ins only, zero model tokens): `status`, `start` (branch/clean-tree guard, start-sha), `pack` (context pack: task + design spec + display rules + libraries + API rows + existing files + public APIs + only the rules the role needs), `red` (TDD proof), `check` (typecheck, eslint on task files, Steiger, related tests, optional design check; writes a compact `failures.md`), `scope`/library check, `done` (all checks → status → commit by path) | tools |
| `SENIOR-WORKFLOW.md`: manual planning chain with prompts, per-task loop, release checklist, token habits, limits, troubleshooting | docs |
| Architect writes `Route:` in each page TASK's Design section (the tool needs it) | architect |
| check-install verifies the tool | tools/check-install.mjs |
Verified on a two-task sample project: start guards (main, dirty tree), valid-RED proof, compact failure reports, out-of-scope edit refused, unapproved library refused / approved allowed, design mismatch refused, clean commit of exactly the task's files, re-run after a failed commit. Pack for a page task ~4.4k tokens (design spec included) vs ~6.1k loaded by the coder agent at start, before it searches the plan.

---

# Revision 13 — works without git
| Change | Where |
|---|---|
| No-git mode (`git: off` in `plan/run-options.md`, or auto-detected when git is missing / not a repository): agents run no git command — no branch, no commit, no start-sha | AGENTS.md §7, app-bootstrap, orchestrator, codebase-scanner, test-engineer, builders, reviewer |
| `tools/task.mjs`: `start` saves a file snapshot + backup of the task's files; scope compares against it (edited, new, deleted files); library check uses the snapshot's package.json; `done` skips the commit; new `undo` (preview, then `--yes`) restores edited files and removes created ones | tools/task.mjs |
| Permissions: app-bootstrap may write `plan/run-options.md`; test-engineer, component-generator, reviewer may run `node tools/task.mjs` | frontmatter, policy.json |
| check-install says what to do when git is missing or the folder isn't a repository | tools/check-install.mjs |
Verified: no `.git` folder, and a broken `git` command on PATH — auto-detect, snapshot, scope (modified + deleted + new file), unapproved library, undo (byte-identical restore, created folders removed), done; git mode re-tested after the change.

---

# Revision 14 — works when PowerShell blocks npm/npx
Pilot finding: schema-parser BLOCKED — PowerShell's execution policy rejected `npx.ps1`, and every workaround was refused
because the agent was only allowed the exact commands `npx openapi-typescript*`, `npx @redocly/cli lint*`, `npx tsc*`.
| Change | Where |
|---|---|
| `tools/run.mjs`: runs npm, npx or an installed tool THROUGH NODE (no .ps1/.cmd, no shell); exit codes pass through | tools |
| Rule in AGENTS.md §6 (+ schema-parser, hybrid-api-config): prefix the same command with `node tools/run.mjs`; never change the execution policy; never BLOCK only because npx is unavailable | agents |
| Permissions: every npm/npx allow/deny rule exists in the wrapper form too (so the same limits apply, e.g. builders still cannot install packages); schema-parser and hybrid-api-config also get the bare forms | frontmatter, policy.json |
| Claude Code / Copilot pre-approve the wrapper; check-install verifies it | settings, tools/check-install.mjs |
Verified with a PATH that cannot find npm/npx: npm, npx, tsc, vitest, openapi-typescript (200-line schema generated), redocly, `npm run typecheck`, `npm run lint`, exit codes.

---

# Revision 15 — packs are attachable
Pilot finding: `plan/packs/TASK-001.tests.md` was created but missing from OpenCode's `@` picker (the other plan files were listed).
Cause: the picker skips git-ignored files, and `tools/task.mjs` had added `plan/packs/` to `.git/info/exclude`.
| Change | Where |
|---|---|
| Packs are no longer git-ignored; the tool removes the old ignore line it had added (design screenshots stay ignored) | tools/task.mjs |
| Untracked packs don't make the tree "dirty" for `start`, are exempt from the scope check, and are never committed (commit is by path) | tools/task.mjs |
| `pack` prints the fallback sentence ("Read the file … and …") for when the picker still doesn't list it; scope line counts only task files | tools/task.mjs |
| SENIOR-WORKFLOW: attach fallback + troubleshooting row | docs |
Verified on a repo created by the old tool: ignore line removed, pack not ignored, `start`/`scope`/`done` with untracked packs present, commit holds only the task's files.

---

# Revision 16 — the page background and other "looks" are measured
Pilot finding (your real login design): the build had a light grey page instead of the dark gradient; the white logo and banner text
vanished on it; the link was pale and not underlined; the button text was dark; input borders were darker.
Cause, reproduced on your real HTML: the gradient sits on `#login` as a `background-image`; my tool only read colours, recorded the
page as the `<body>` canvas (`rgb(244, 246, 248)` — exactly the grey in your build), kept the gradient colours out of the palette,
did not measure underline, never checked text visibility, and treated any colour difference as a non-blocking style note.
| Change | Where |
|---|---|
| `design-spec.mjs`: reads gradients/background images (page, card, buttons) and puts their stops in the palette; underline; text contrast against the REAL background; own text only (a label that contains a link); links count as controls whether `<a>` or `<button>`; controls' "same line as"; colour differences graded (≤12 same, 13–40 style, >40 `look`); new blocking severity `look`; `plan/design-accepted.md` (human-owned); `extract --out` fixed | tools/design-spec.mjs |
| design-fidelity.md rewritten: gradients are tokens, text must be readable, **match the design including contrast** (report concerns, never change a measured look silently) | agent-docs |
| styling-engineer: `--gradient-*` tokens + `backgroundImage` classes; measured values that fail contrast are reported, not adjusted | styling-engineer |
| mock-data-generator seeds fixtures with the values shown in the design; wireframe-analyzer records those literal values | agents |
| task tool counts `look` as blocking | tools/task.mjs |
Verified on your real login HTML: a build reproducing your screenshot → 15 blocking differences (old tool: none of the visual ones); a faithful rebuild with different markup → 0 blocking; link moved below the field → caught; indent screen → 0.

## Prototype crawler — screens, drawers, modals and the top bar are discovered, not described

Problem: a prototype keeps drawers, modals, popovers and whole screens in JavaScript (an empty `<aside>` until a click fills it, a hidden `<div>` until a nav button shows it). The extractors read the static HTML, so those parts were never listed, planned, built or compared — and junior developers cannot be expected to name them in a prompt.

| Change | Effect |
|---|---|
| New `tools/discover-interactions.mjs` | Opens the prototype in a real browser, clicks every control in a fresh page, diffs before/after, follows new screens (sign-in → home → workbook). Writes `analysis/interactions.md` (+ `.json`, screenshots): screens, shared chrome, overlays with their full content, toasts, in-place controls, reveals, select options, hidden messages, controls with no visible change |
| `design-spec.mjs`: `--open "<control>"` | Extracts / compares what a click opens (drawer, modal, popover, toast) in the design AND the build |
| `design-spec.mjs`: any CSS selector as a screen | `file.html#.topbar` measures the shared top bar, which was outside every screen's scope |
| `design-spec.mjs`: class-switched screens | `.view` / `.view.on` screens are switched by class instead of forced to `display:block` (the old forcing broke flex layouts such as the workbook) |
| wireframe-analyzer Step 1a, coverage-checker, architect, coder, component-generator | Every row of interactions.md must be analysed, planned (shared chrome = its own TASK before the pages), built with an accessible trigger name, and design-checked with `--open` |
| agent-guard policy, check-install, ownership | The new tool is allowed for wireframe-analyzer and coverage-checker, denied for editing, required by check-install |

## Design fidelity round — the design's colours, fonts and layout are measured, installed and checked

Problem: the build looked different from the design (wrong top-bar colour, system fonts instead of IBM Plex, cards and panels in the wrong places) and nothing failed. The design's colours were only "mapped" by a model, no agent owned fonts (the styling rules even forbade them), the design check ignored panels, shadows and spacing, and a junior developer had no command for "fix what differs".

| Change | Effect |
|---|---|
| `design-spec.mjs tokens <html>` (new) → `analysis/design-tokens-raw.md/.json` | Every CSS variable of the design (light + dark) and every font family with its weights and source, read by a tool — nobody types them |
| `tools/check-tokens.mjs` (new) → `plan/token-check.md` | Compares the design with the build's `tokens.css` by value (light and dark), checks each font is in a `--font-*` variable, its `@fontsource` package is installed and every weight imported. Exit 1 on any miss; a human accepts one only in `plan/design-accepted.md` |
| wireframe-analyzer Step 5 | Runs `tokens`; every colour variable must be a row of `design-tokens.md` (new token names for colours the semantic list lacks) |
| library-advisor + `libraries.md` | Every design font becomes a `web-font` row (`@fontsource/<family>`), approved at Gate 1, installed by Run L. `lib-facts` accepts SIL OFL 1.1 for `@fontsource/*` only |
| styling-engineer | Design values first, template defaults only for what the design lacks; imports each weight in `base.css`; `font-mono`; token gate = `check-tokens` exit 0; the "no fonts" rule is replaced by "no CDN, only approved packages" |
| reviewer / coverage-checker | Release runs `check-tokens`; ✘ is P0 `look` / `missing`; `visual.png` is inspected |
| `design-spec` blocks | Every card / panel is measured (heading, row, x, width, background, border, radius, shadow, padding, gaps) and compared by heading: wrong column / row, stacked instead of side by side, order, width off by > 15% = layout (blocking) |
| `design-spec compare` → `visual.png` | The design with every 40px area that looks different in red, plus `visual` rows in `differences.md` (information, never blocking) |
| `design-spec` bug fixed | `--open` name matching used a regex missing its backslash (`/s+/`) |
| orchestrator `design-fix` mode, `/fix-design` command, prompt.txt "Fix round" | One line from the human: the reviewer re-measures every screen / overlay + tokens, the architect writes one BUG per screen, styling-engineer / coder fix until 0 blocking, max 2 rounds per run |
| policy, ownership, check-install | New tool allowed for styling-engineer and reviewer, denied for editing; `/fix-design` required |
