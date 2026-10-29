# Design fidelity — the screen must match the wireframe

Measured, never eyeballed (Playwright renders the HTML):
- `node tools/design-spec.mjs extract <file.html#screen-id>` → `analysis/design-spec/<file>-<screen-id>.md` (+ .json).
  `#screen-id` picks ONE screen inside a prototype that holds several (`dealer.html#login`); a one-screen file needs no id.
  It records: exact labels and order, table columns/groups/widths, controls (links and buttons alike) with grouping, state,
  underline and where they sit, chips and bars, the **page background — including gradients and background images, which
  live in `background-image`, not in a colour** — the main card/panel, every text's placement (inside/outside the card,
  left/center/right, which text shares its line), underline, contrast against its real background, input styling, fonts,
  colors and the palette (gradient stops included).
- `node tools/design-spec.mjs compare <file.html#screen-id> <route> --start` → `plan/design-diff/<file>-<screen-id>/`:
  design.png, build.png, differences.md. Data values are never compared as content.

## Severities
| Severity | Examples | Effect |
|---|---|---|
| content | a label, column, control, field or cell button missing / extra / renamed | blocks |
| rule | a display rule missing, or state styling the design doesn't have | blocks |
| layout | card missing or not centered, a text outside/inside the card, alignment, two items no longer on one line (e.g. a link that moved off the Password line) | blocks |
| look | the page background (gradient vs flat, other colours), a text/button/link colour that is clearly different (> 40 per RGB channel), underline missing or added, text hard to see on its real background (contrast < 1.6:1), clearly different border colours | blocks |
| style | font size/weight, small colour shifts (13–40), padding, radius, height, width | one-line reason in plan/history, else P1 |
| data | sample values with digits (dates, counts) present in one and not the other | information only |
| accepted | a difference the HUMAN listed in `plan/design-accepted.md` | information only |

## Rules
1. **Content is copied, not interpreted** — labels, order, group headers, button texts, placeholders, exactly.
   A TASK that disagrees with the spec → BLOCKED-DESIGN.
2. **Every measured value maps to a token or a Tailwind step**; nearest step within 1px, otherwise styling-engineer
   adds a token. Never hex, never `style=`.
3. **Colors come only from tokens; tokens come from the spec's Palette.** Page background included.
4. **A gradient or background image is a design value like any colour**: every entry of the spec's "Gradients and
   background images" section becomes one token (`--gradient-<name>`, exact stops and angle) and one class (`bg-<name>`).
   Never approximate it with a flat colour, and never take the page colour from the `<body>` alone — the gradient may sit
   on the screen's own element.
5. **Text must be readable where the design puts it.** White text stays white only on the design's dark gradient — if the
   background is not built, the text vanishes. The check blocks any text under 1.6:1.
6. **Display rules are rules** (conditional colors, "–" for empty, formats) → `analysis/display-rules.md`; unclear →
   Gate 1 question. **Never invent a rule** and **never hard-code the design's sample data** as a fallback — show the API
   value, or the error state. In mock mode the mock returns the design's sample values (mock-data-generator).
7. **Match the design — contrast included.** If a measured design value fails WCAG contrast (e.g. a faint input border),
   KEEP the design value and list it under "Contrast concerns" in plan/design-system.md (where, both ratios). The human
   decides at Gate 1/3; a difference they accept goes into `plan/design-accepted.md` (humans only — agents never edit it).
   Never change a measured look silently.
8. **Pages are compared after their route exists** — the coder wires the route inside the page TASK.
9. **Done** = 0 blocking differences; every style difference has its one-line reason.

Tolerances: font ±0.5px · padding ±2px · heights ±4px · widths ±15% · colors ±12 per RGB channel = same, 13–40 = style,
over 40 = look · gradient angle ±25° · texts on one line ±4px.
Not compared — check by eye at Gate 3: exact vertical spacing between blocks, icons/images, shadows, hover/focus states, animation.

## Screens and overlays are discovered, not described (rule 10)
`node tools/discover-interactions.mjs <file.html>` → `analysis/interactions.md`. It clicks every control of the prototype in a
browser and lists what a static read cannot see: screens reached by a click, the shared top bar, drawers / modals / popovers
(their content is filled in by JavaScript), toasts, controls that change the page in place, hidden messages.
- **No human names screens or overlays in a prompt.** The file is the list; every row must be planned, built and checked.
- A screen is any selector: `node tools/design-spec.mjs extract <file.html#vWb>` or `<file.html#.topbar>` (the shared chrome).
- An overlay is measured with `--open "<trigger name>"` (the trigger's `aria-label`, `title` or text): `extract <screen> --open "Line detail"`
  and `compare <screen> <route> --start --open "Line detail"` → `plan/design-diff/<screen>-open-<trigger>/`. The build must give the
  trigger that exact accessible name; if it doesn't, the check fails with "no visible control named …" — that is a `content` miss.
- Same severities and "Done = 0 blocking differences" as any screen. A drawer or modal that does not exist is a missing feature, not a style gap.
- Not detectable by clicking (check by eye at Gate 3): hover-only tooltips, drag and drop, keyboard shortcuts, behaviour for other roles.

## Colours and fonts come from the design's own variables (rule 11)
`node tools/design-spec.mjs tokens inputs/ux/<file>.html` → `analysis/design-tokens-raw.md` + `.json`: every CSS variable of the design
(light + dark) and every font family (weights, where the design loads it from). wireframe-analyzer runs it; nobody types these values.
- Every design colour is a token in `tokens.css`, by value: light in `:root`, dark in `.dark`. A template default may only stay where the design has no value.
- Every design font family is proposed by library-advisor as a `web-font` row (`@fontsource/<family>`), approved at Gate 1, installed by
  app-bootstrap Run L, imported weight by weight in `base.css` by styling-engineer, and set in `--font-sans` / `--font-mono`. No CDN.
- `node tools/check-tokens.mjs` (styling-engineer, reviewer) compares design and build → `plan/token-check.md`. ✘ = a design colour or font
  is missing; a human accepts one only by naming it in `plan/design-accepted.md`.

## Blocks and the picture (rule 12)
`extract` / `compare` also measure **blocks** — every card / panel (own background, border or shadow) with its heading, row, x, width,
background, border, radius, shadow, padding and the gap to the row above. `compare` matches blocks by heading:
| Difference | Severity |
|---|---|
| a heading exists in the build but not inside a card / panel of its own · a block in another column or row · blocks side by side in the design but stacked in the build · order down the page changed · width off by > 15% of the screen | layout (blocks) |
| width off by 5–15% · shadow, border, radius (> 2px), padding (> 3px) or background different · gap between rows off by > 12px | style (one-line reason) / look (colour > 40) |
`compare` also writes `visual.png` (the design with every 40px area that looks different in red) and `visual` rows in differences.md. They are
information and never block: data and fonts add noise. Look at the picture at Gate 3; a red area nobody can explain is a finding.
