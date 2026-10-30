# Prototype crawler — what was changed

## The problem
`inputs/ux/dealer.html` keeps parts of the UI in JavaScript: the line-detail drawer, the popups, the Export / Add FERT / Review & submit windows, and the Home and Indent workbook screens only appear after a click. The agents read only the static HTML, so those parts were never listed, planned, built or compared. That is why the drawer was missing from the build.

## What was done
A new tool opens the prototype in a real browser, clicks every control, and records what each click does. The agents now have to use its report, so nobody has to describe screens or drawers in a prompt.

On `dealer.html` it found:
- 3 screens (Login, Home, Indent workbook) and the shared top bar
- the line-detail drawer (sections: Vehicle, Your stock on hand, Offtake and retail, Last cycle), opened by the ⓘ button in each table row
- the Export, Add FERT and Review & submit windows, the filter popups and the column picker
- 6 toast messages, plus sort, filter, density and theme controls

## Files created
| File | Purpose |
|---|---|
| `tools/discover-interactions.mjs` | The crawler. Writes `analysis/interactions.md`, `.json` and screenshots |

## Files changed
| File | Change |
|---|---|
| `tools/design-spec.mjs` | `--open "<control>"` measures what a click opens; any CSS selector can be a screen (`file.html#.topbar`); class-switched screens (`.view.on`) are switched properly instead of forced to `display:block` |
| `tools/check-install.mjs` | Install check now requires the new tool |
| `.github/agents/wireframe-analyzer.agent.md` | New Step 1a: run the crawler, account for every row; Step 1c and validation list updated |
| `.github/agents/architect.agent.md` | Plans every overlay, interaction and select; the shared top bar is its own TASK before the pages |
| `.github/agents/coder.agent.md` | Builds each overlay with an accessible trigger name; runs `--open` checks |
| `.github/agents/component-generator.agent.md` | Same overlay checks |
| `.github/agents/coverage-checker.agent.md` | Re-runs the crawler into `plan/coverage-check`; checks overlay design diffs |
| `.github/agents/app-bootstrap.agent.md` | One line: the new tool ships with the package |
| `.github/agent-guard/policy.json` | Crawler allowed for wireframe-analyzer and coverage-checker, denied for editing (3 entries) |
| `agent-docs/rules/design-fidelity.md` | New rule 10: "Screens and overlays are discovered, not described" |
| `agent-docs/rules/ownership.md` | Lists the new tool and `analysis/interactions.md` |
| `CHANGELOG.md` | New section at the end |

Not touched: `inputs/`, `output/`, `prompt.txt`, `AGENTS.md`, `models.json`, `PLAYBOOK.md`, `SENIOR-WORKFLOW.md`, `PROMPTS.md`. `tools/port-drift.mjs` was skipped on purpose; if you keep a second copy of this package, copy the new tool there and add it to that file's list.

## Correction to the earlier analysis
`design-spec` did not hide the top bar. The top bar was never measured because measurement covered only the screen's own element. The `display:block` layout break was a separate problem. Both are fixed.

## Tested
- The crawler and the `design-spec` changes, on the real `dealer.html` (Chrome via Playwright). The drawer screenshot matches the design.
- Syntax check of `design-spec.mjs` and `check-install.mjs`.

## Not tested
- A full agent run.
- `compare --open` against a built app (there is no built app in this folder).

## Not done yet
- Fonts and colours. The design uses IBM Plex Sans / Mono and a specific navy and blue palette. The agents default to system fonts and a neutral palette. Next step: have `library-advisor` propose the fonts from the design's `<link>` tags and `styling-engineer` copy the design's CSS variables.

## Limits
- Hover-only tooltips, drag and drop, keyboard shortcuts and screens for other roles are not found by clicking. The persona dropdown lists ASM, RSM, Vertical Head and ISO; those screens are probably in other files.
- Controls that share a name (the nine "All▾" filter buttons) are listed, but the report says to measure them by hand.
- A crawl takes 1–3 minutes. The project needs `npx playwright install chromium`, which `design-spec` already requires.

## Also applied to the other ports
The same changes were applied to `claude/` and `opencode/` (the text edits are identical; only paths and permission syntax differ).

| In each port | What |
|---|---|
| `tools/` | `discover-interactions.mjs` added; `design-spec.mjs` replaced with the new version (the old ones in both ports were identical to each other and differed only by my edits); `check-install.mjs` requires the new tool |
| Agents (`wireframe-analyzer`, `architect`, `coder`, `component-generator`, `coverage-checker`, `app-bootstrap`) | Same text edits as the Copilot version |
| `agent-docs/rules/` | `design-fidelity.md` rule 10, `ownership.md` rows |
| `CHANGELOG.md` | Same new section |
| Permissions | **claude:** `.claude/agent-guard/policy.json` — 3 entries (same as Copilot). **opencode:** permissions live in each agent's frontmatter — allow in `wireframe-analyzer` and `coverage-checker`, deny-edit in `app-bootstrap` |

Not changed in the ports: `port-drift.mjs`, `README*`, `CLAUDE.md`, `settings.json`, `opencode.json`, hooks and plugins.

---

# Round 2 — fonts, colours, layout check and the fix round

## Problems fixed
1. **Fonts and design colours had no owner.** Now a tool reads the design's CSS variables and fonts, library-advisor proposes the font packages, styling-engineer must carry every colour and import every weight, and a checker fails if anything is missing.
2. **The design check missed layout.** Now it also compares every card / panel (position, width, row, order, background, border, radius, shadow, padding, gaps) and writes a picture with the differing areas in red.
3. **Fix prompt for junior developers.** One command, `/fix-design`, plus a "Fix round" section in `prompt.txt`.

## New files
| File | Purpose |
|---|---|
| `tools/check-tokens.mjs` | Design colours + fonts vs the build's `tokens.css`, `package.json` and font imports → `plan/token-check.md` |
| `.github/prompts/fix-design.prompt.md`, `claude/.claude/commands/fix-design.md`, `opencode/.opencode/commands/fix-design.md` | The `/fix-design` command |

## Changed files (the same edits in all three locations unless noted)
| File | Change |
|---|---|
| `tools/design-spec.mjs` | New `tokens` command; blocks measured and compared; `visual.png`; fixed a missing-backslash regex in `--open` |
| `tools/lib-facts.mjs` | Accepts the SIL OFL 1.1 licence for `@fontsource/*` packages only |
| `tools/check-install.mjs` | Requires `check-tokens.mjs` and the `/fix-design` command |
| `agents/wireframe-analyzer` | Step 5 runs `tokens`; every colour variable must be mapped |
| `agents/library-advisor` | Step 1b: one `web-font` row per design font |
| `agents/styling-engineer` | Design values first; fonts imported per weight; token gate; CDN fonts still forbidden |
| `agents/reviewer`, `agents/coverage-checker` | Run / read the token check; layout and visual findings |
| `agents/orchestrator` | New `design-fix` mode (max 2 rounds per run) |
| `agent-docs/rules/` | `libraries.md` (web-font row, OFL), `design-fidelity.md` (rules 11, 12), `ownership.md` |
| Permissions | `check-tokens` allowed for styling-engineer and reviewer, denied for editing in app-bootstrap (Copilot + claude `policy.json`; opencode agent headers) |
| `prompt.txt` (main folder only) | Gate 1 / Gate 3 lists, "Fix round" steps 16–21 |
| `PLAYBOOK.md` (main + claude) | `/fix-design` mentioned |
| `CHANGELOG.md` | New "Design fidelity round" section |

## Tested
- `tokens` on `dealer.html`: all 22 colours (light and dark) and both IBM Plex fonts with weights and package names.
- `check-tokens` against fake builds: default tokens fail (and name each missing colour), a missing font weight fails, a complete build passes (exit 0).
- Blocks: Home 12, Workbook 5, Login 1. Identical pages compare to 0 differences; a damaged copy is flagged (lost card, width, radius, padding, alignment) and `visual.png` marks the right area.
- Syntax of every changed script, JSON validity of both policy files, and the three tool copies are byte-identical.

## Not tested
- A full agent run, the new `design-fix` mode, installing a font through app-bootstrap Run L, and a real `lib-facts` registry lookup for an `@fontsource` package (the licence rule was unit-tested only).

## Limits
- Block matching uses each block's heading; a card with no clear heading is listed but not compared.
- `visual.png` is information only. Real data and fonts add red areas that are not defects.
- Styling-engineer, coder and component-generator still run on Haiku in `models.json`; moving them to a stronger model is a separate setting.

## Small fix — missing Playwright
`tools/design-spec.mjs` and `tools/discover-interactions.mjs` now stop with a clear message (run app-bootstrap Run 1, or `npm i -D @playwright/test jsdom` + `npx playwright install chromium`) instead of a Node stack trace when `@playwright/test` is missing. Same files updated in `claude/tools/` and `opencode/tools/`. `RUN-ORDER-one-screen.md` and `HOW-TO-pick-scope-keywords.md` now say to run app-bootstrap Run 1 before slicing or extracting (the slicer also needs `jsdom`), and to use Node 22.22+ / 24.15+.
