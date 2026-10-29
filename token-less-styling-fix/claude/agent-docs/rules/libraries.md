# Libraries & capability detection

Which library a component uses is decided from EVIDENCE in the wireframes, never from memory:
`node tools/detect-ui-capabilities.mjs inputs/ux/**/*.html` reports every complex capability, and
`node tools/lib-facts.mjs <pkg>[@range] …` gives the CURRENT facts (pin, license, React 19, types, last release, size).
The **library-advisor** writes `plan/library-decisions.md`; fsd-planner only adds rows for capabilities found later.

## Decision rules (in this order)
1. **Existing project:** PROJECT.md already lists a library for the capability → use it. Never add a second one.
2. **Plain is fine?** Check the catalog's last column first. Fewer dependencies is the default.
3. **Catalog row** → its library, installed at the exact version `lib-facts` gives (the catalog shows only the major).
4. **Not in the catalog** → research 2 candidates with `lib-facts`, pick one, name the other as the alternative.
5. **Hard rules** (a ✘ from `lib-facts` = not eligible): license on the allowlist (MIT, ISC, Apache-2.0, BSD-2/3-Clause,
   0BSD, Unlicense, BlueOak; **`@fontsource/*` font packages: SIL OFL 1.1 as well — it is the font's own licence**) · supports React 19 (peerDependencies) or doesn't touch React · not deprecated · on npm.
   **Warnings** (⚠) need one line of justification in Why: last release > 12 months ("finished, widely used, no open
   advisories" is a valid reason) · no TypeScript types · pin older than newest (supply-chain rule: never a release < 14 days old).
6. Also prefer: headless or lightly styled (styled with our tokens), keyboard + screen-reader support, tree-shakeable, small.
7. **Never** a second library for something the base stack does: data fetching/cache (RTK Query), state (Redux Toolkit),
   forms/validation (react-hook-form + zod), styling (Tailwind), routing (react-router), dates in plain format (`Intl`).
8. **Status:** `approved` = plain decision, or the human approved it · `proposed` = the advisor recommends it, the human
   decides at Gate 1 · `needs-approval` = found after Gate 1 (fsd-planner/architect) · `rejected` = the human said no.
   Approve in one go: `node tools/task.mjs approve-libs --all-proposed` (or name the capabilities).
9. Libraries are installed only by app-bootstrap (Run L), only from rows marked `approved`, after `lib-facts --strict` passes.

## Catalog
| Capability (detector id) | Use | Install (pinned) | Plain is fine when |
|---|---|---|---|
| data-grid — frozen/sticky column or header, grouped headers, editable cells, sortable columns | TanStack Table (template: `agent-docs/templates/data-grid.md`) | `@tanstack/react-table@^8` | `simple-table`: none of those features |
| virtual-list — ≥ 200 rows/items | TanStack Virtual | `@tanstack/react-virtual@^3` | fewer than 200 |
| dialog — modal, drawer, alert dialog | Radix Dialog / AlertDialog | `radix-ui@^1` | never plain (focus trap, Esc, return focus) |
| dropdown-menu | Radix DropdownMenu | `radix-ui@^1` | never plain |
| tooltip — hover/focus hints, info icons | Radix Tooltip (Popover if it holds links/buttons) | `radix-ui@^1` | never `title=` for information users need |
| tabs | Radix Tabs | `radix-ui@^1` | — |
| toggle-group — segmented control (Comfortable / Compact) | Radix ToggleGroup (template: `data-grid.md` → DensityToggle) | `radix-ui@^1` | the buttons are unrelated actions, not one choice |
| column-visibility — a "Columns" picker | TanStack column visibility + Radix DropdownMenu (template: `data-grid.md` → ColumnsMenu) | `@tanstack/react-table@^8 radix-ui@^1` | — |
| select — custom-styled dropdown | Radix Select | `radix-ui@^1` | the design looks like a native select → `<select>` |
| combobox — autocomplete, searchable select | cmdk | `cmdk@^1` | — |
| date-picker — calendar UI | react-day-picker + date-fns | `react-day-picker@^9 date-fns@^4` | the design shows a plain date field → `<input type="date">` |
| chart | Recharts | `recharts@^3` | — |
| drag-drop | dnd-kit | `@dnd-kit/core@^6` | — |
| toast | Sonner | `sonner@^2` | — |
| icons | Lucide | `lucide-react@^1` | the design ships its own SVGs |
| rich-text — editable formatted text, a B / I / list toolbar | Tiptap (headless) | `@tiptap/react@^3 @tiptap/starter-kit@^3` | no formatting toolbar → `<textarea>` |
| file-upload — drag-and-drop zone, several files, previews | react-dropzone | `react-dropzone@^20` | a single file picker → `<input type="file">` (styled label) |
| map — interactive map, markers | MapLibre GL + vis.gl wrapper (react-leaflet: license not on the allowlist) | `maplibre-gl@^6 @vis.gl/react-maplibre@^8` | a fixed location → a static image or a link to a maps app |
| export — CSV / Excel / PDF / print buttons | CSV: plain (`Blob` + text) · Excel: write-excel-file · PDF: print CSS first, @react-pdf/renderer for a designed document | `write-excel-file@^4` · `@react-pdf/renderer@^4` | CSV and "Print" are always plain |
| web-font — the design uses a non-system font family (Google Fonts link, `@font-face`, a named `font-family`); listed in `analysis/design-tokens-raw.md` | Fontsource: one self-hosted package per family (no CDN, no `<link>`); import only the weights the design uses | `@fontsource/<family-slug>@^5` (e.g. `@fontsource/ibm-plex-sans`) | the design uses only system fonts → `—` |
| carousel — slides, prev/next, dots | Embla | `embla-carousel-react@^8` | no autoplay / loop → CSS `scroll-snap` |
| i18n — language switcher, `dir="rtl"` | i18next + react-i18next | `i18next@^26 react-i18next@^17` | one language only → plain strings (still no hard-coded text in logic) |
| auth — SSO / OIDC login (asked, not detected) | oidc-client-ts + react-oidc-context | `oidc-client-ts@^3 react-oidc-context@^3` | own email + password API → RTK Query endpoints, no library |
| error-tracking (asked, not detected) | Sentry | `@sentry/react@^11` | not wanted, or no account yet → `shared/lib/logger` only |

Radix and the others are headless or lightly styled: style them ONLY with the semantic Tailwind tokens so
the result matches the wireframe. Never import a library's default theme CSS.

## Tests
One test per detected feature — recipes in `agent-docs/rules/capability-tests.md`.
