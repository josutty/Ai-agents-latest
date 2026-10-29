# AGENTS.md §12 — UI conventions

Part of AGENTS.md, kept in its own file so only the agents that need it load it.

## 12. UI conventions (senior-level defaults — PROJECT.md may override for existing projects)

**Accessibility — WCAG 2.2 AA is the bar, not a nice-to-have**
- Semantic elements first (`button`, `a`, `nav`, `main`, `h1–h3`, `ul/li`, `table`); one `h1` per page;
  heading levels never skip.
- Every interactive element has an accessible name; icon-only buttons use `aria-label`.
- Visible focus everywhere (base.css ring — never `outline-none` without a replacement); logical tab
  order; no keyboard traps; dialogs trap focus and return it on close; Escape closes overlays.
- Targets ≥ 24×24 px (2.2 AA); text contrast ≥ 4.5:1, control borders/focus ≥ 3:1 (checked by script).
- Errors use `role="alert"`; async regions use `aria-busy`; loading skeletons are `aria-hidden` with
  a labelled container.
- Respect `prefers-reduced-motion` (base.css); never convey state by color alone.

**Forms**
- react-hook-form + `zodResolver`; the schema lives in `<slice>/lib/<form>Schema.ts` (zod 4 syntax:
  `z.email({ error: '…' })`).
- Every field: visible `<label htmlFor>`; invalid → `aria-invalid` + `aria-describedby` pointing at the
  error text; `autoComplete` set; `noValidate` on the form (the schema is the validator).
- Submit: button shows `loading` and is disabled while submitting; mutation via `.unwrap()`; server
  field errors mapped with `setError`; a form-level server error renders in `role="alert"`.

**Routing & auth**
- Route paths only from `routes` in `@shared/config`; every page is a lazy route with `errorElement`.
- Guarded routes sit under app-bootstrap's `RequireAuth` layout route (redirects to sign-in with
  `state.from`); pages never check auth themselves. A 401 dispatches `sessionExpired`, which clears
  the session and sends guarded routes to sign-in.

**Text, numbers, dates**
- Numbers, currency and dates via `Intl` helpers in `shared/lib/format` — never string concatenation.
- i18n only when the client FSD doc or PROJECT.md requires it; then every user-facing string goes
  through the project's i18n library.

**Performance**
- Route-level code splitting (lazy routes) is the default; images carry `width`/`height` and
  `loading="lazy"` below the fold; lists over ~100 rows are virtualized only when a TASK says so.
- Vite's "Some chunks are larger than 500 kB" warning on `npm run build` is a reviewer P2 finding.

**Responsive**
- Mobile-first; every page is checked at phone width by the e2e mobile project (no horizontal overflow).
