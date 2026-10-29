# Project Conventions (single source of truth for ALL agents and humans)

OpenCode loads this file into every agent's context, so it is ALREADY in your context — never open it with a read tool. When an agent file and this file
disagree, THIS file wins — report the conflict in your HANDOFF reason. Team mechanics (modes, delta runs, lite and
batch review, no-git mode, HANDOFF) live in `agent-docs/rules/team-protocol.md`; team agents read it, context packs don't need it.

**Existing projects:** if `PROJECT.md` exists at the repo root (written by codebase-scanner), its "Rules for NEW code",
"Command map" and path map override §1–§6 here (stack, data mechanism, styling, test runner, paths, commands).
§7 Git, §8 Sensitive data and HANDOFF always apply. Never migrate existing code to these conventions unless the TASK says so.

## 1. Stack (pinned majors — do not upgrade without human approval)

React 19 · TypeScript 5 (strict) · Vite 6 · Redux Toolkit 2 (+ RTK Query) · react-redux 9 ·
react-router 7 · Tailwind CSS 3.4 · Vitest 3 + React Testing Library 16 + user-event 14 +
jest-dom 6 · MSW 2 · Storybook 8 · @faker-js/faker 9 · ESLint 9 (flat config) + Steiger 0.7 (FSD linter) ·
react-hook-form 7 + zod 4 · Playwright 1 + @axe-core/playwright 4 · jsdom 30 · Prettier 3 + lint-staged 16

Runtime: **Node ≥ 22.22 (or ≥ 24.15)** — jsdom 30 and Steiger 0.7 require it.
The exact install commands and configs live in app-bootstrap Run 1. They were verified together on
a reference app (typecheck, lint, tests, coverage, build, Storybook build) — change them together.

Env vars (Vite): read ONLY through `src/shared/config/env.ts`, never `process.env`.
- `VITE_API_BASE_URL` — prefix for every API path ('' in dev → Vite proxy; `http://localhost` in tests)
- `VITE_API_MODE` — `mock` (all MSW) | `hybrid` (MSW for `x-mock` endpoints only) | `real` (no MSW)

## 2. Feature-Sliced Design

```
src/
├── app/        providers, store root, router, global styles import — composition only
├── pages/      one folder per route — composition only, zero business logic
├── widgets/    large self-contained UI blocks composed of features + entities
├── features/   user actions (filter-products, add-to-cart, login)
├── entities/   business nouns (product, cart, session, user)
└── shared/     api, ui kit, lib, config — no business knowledge
mocks/          MSW handlers, fixtures, factories (outside src/, not an FSD layer)
test/           Vitest setup + render helpers (outside src/, not an FSD layer)
```

Import matrix (a layer may import only from layers BELOW it):

| Layer | May import |
|---|---|
| app | pages, widgets, features, entities, shared |
| pages | widgets, features, entities, shared (composition only — no business logic) |
| widgets | features, entities, shared |
| features | entities, shared |
| entities | shared (cross-entity only via `@x` public API, and only if planned) |
| shared | npm packages only — never any layer above |

- No imports between two slices of the SAME layer (features/a → features/b is forbidden).
- Import another slice only through its `index.ts` public API, never deep paths.
- Segments inside a slice: `ui/`, `model/`, `api/`, `lib/`, `config/`. No `store/`, `types/`, `hooks/` segment names.
- Aliases: `@app @pages @widgets @features @entities @shared @mocks @test`.
- `RootState`, `AppStore`, `AppDispatch` are GLOBAL types declared in `src/app/store/types.d.ts`.
  Nothing below `app/` ever imports from `@app`.

## 3. Data contract (one mechanism, no exceptions)

- **Server data → RTK Query only.** `baseApi` lives in `src/shared/api/baseApi.ts`. Endpoints are
  added with `baseApi.injectEndpoints` in `entities/<e>/api/` (or `features/<f>/api/` for
  feature-only mutations). Components use the generated hooks (`useListProductsQuery`, …).
- **Client state → `createSlice`** in `entities/<e>/model/` or `features/<f>/model/`, combined in
  `src/app/store` with `combineSlices`. Read with `slice.selectors.*` via `useAppSelector`.
- `createAsyncThunk` only for multi-step workflows RTK Query can't express, and only when the TASK names it.
- Forbidden in components: `fetch`, `axios`, `useState`/`useEffect` holding server data, importing `baseApi`.
- All API errors are normalized to `ApiError` (`src/shared/api/errors.ts`). Show them with `getErrorMessage(error)`.
- Every server-data consumer handles 4 states: loading · error (with retry) · empty · success.
- Endpoints with optional params take the params object (callers pass `{}`), never `Params | void`.
- Mutation errors render from the hook's `error` — no `useState` copy of server errors.

## 6. Quality gates (commands every agent uses — never invent others)

| Command | Checks |
|---|---|
| `npm run typecheck` | `tsc --noEmit` strict |
| `npm run lint` | ESLint (no-any, no-console, no `style=`, no fetch/axios in tsx, max 250 lines per .tsx, a11y, hooks) + Steiger (FSD) |
| `npm test` | Vitest run |
| `npm run coverage` | Vitest + thresholds |
| `npm run build` | Vite production build |
| `npm run build-storybook` | Storybook builds (all stories compile) |
| `npm run e2e` | Playwright + axe: smoke per route, e2e regressions |
| `npm run format` | Prettier (new projects; existing projects only if they already use Prettier) — a hook also formats every file an agent writes |

Existing projects: use the command map in PROJECT.md. app-bootstrap's retrofit run adds missing
scripts under these names (as aliases to the project's own tools) so permissions keep working.

**Read command output economically (every agent).** Tests: `npm test -- --reporter=dot` or
`npx vitest run <files> --reporter=dot` (Jest projects: `--silent`). Build: `npm run build -- --logLevel warn`.
On a failure read the failing test names, the error message and ~20 lines around it — never the whole
log. In plan/history write one line per failure, never pasted logs.

**Windows PowerShell blocks npm/npx** ("running scripts is disabled") → don't stop or change the policy: prefix the SAME
command with `node tools/run.mjs` (`node tools/run.mjs npm run typecheck`, `node tools/run.mjs npx vitest related <files> --run`).

## 7. Git

- One working branch per run, created by app-bootstrap (Run 1 for new projects, Run B for every
  other mode): `feat/<run-name>` or `fix/<bug-slug>`. Never commit to the base branch (`main`, or
  `base-branch` in PROJECT.md).
- Commit your own files at the end of your step: `git add <your paths>` then
  `git commit -m "TASK-NNN(<agent>): <summary>"`. Never `git add -A`, `git add .`, or `git commit -a` —
  they stage other agents' files and break the reviewer's owner check.
- Agents run one at a time. Nothing runs in parallel (one working tree, one committer).
- Never: `git push`, `--force`, `reset --hard`, `rebase`, `checkout -- .`, `clean -fd`, `stash`. Humans push.
- To undo your own change to a file: `git restore --source=<start-sha> -- <file>`.
- No git (`git: off` in `plan/run-options.md`) → see `agent-docs/rules/team-protocol.md` §7b for the replacements.
- While a TASK is `in-progress`, a hook blocks edits to `src/`, `test/`, `e2e/` files outside its Files table (`tools/hooks/`).

## 8. Sensitive data (organization policy — applies to code, mocks, fixtures, logs, docs)

Never generate, store, log, or display: SSN, Aadhaar, PAN, passport numbers, driver's licence
numbers, credit card numbers, or patient records — not even fake-looking ones. If an API field
requires such a value, mocks use the literal `"REDACTED"` and UI shows a masked placeholder.
Mock emails use `@example.com`; mock phones use obviously fictional numbers.

## 9. Logging

No `console.*` anywhere in `src/` except `src/shared/lib/logger/`. Stories use `fn()` from `@storybook/test`.

## Rules kept in separate files
Read the ones your agent file lists under **Read first** (team agents always read `team-protocol.md`). The reviewer reads all of them.
References like "AGENTS.md §12" point to these files.

| § | Topic | File |
|---|---|---|
| 0, 6b, 7b, 10 | Team protocol: modes, delta runs, lite + batch review, fast checks, no-git mode, agent-guard, HANDOFF | `agent-docs/rules/team-protocol.md` |
| 4 | Styling | `agent-docs/rules/styling.md` |
| 5 | Testing (incl. E2E) | `agent-docs/rules/testing.md` |
| 11 | Key files — who owns what | `agent-docs/rules/ownership.md` |
| 12 | UI conventions (a11y, forms, routing, performance) | `agent-docs/rules/ui-conventions.md` |
| — | Libraries: capability detection, catalog, decision rules | `agent-docs/rules/libraries.md` |
| — | One test recipe per capability feature | `agent-docs/rules/capability-tests.md` |
| — | Design fidelity: measure the design, copy labels exactly, compare build vs design | `agent-docs/rules/design-fidelity.md` |
| — | Pinned APIs: the right syntax for each pinned major (packs include it) | `agent-docs/rules/pinned-apis.md` |

Code templates live in `agent-docs/templates/<agent>.md`; agents open them only when writing a file of that kind.
