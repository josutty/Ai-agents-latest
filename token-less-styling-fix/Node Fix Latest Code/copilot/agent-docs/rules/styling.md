# AGENTS.md §4 — Styling

Part of AGENTS.md, kept in its own file so only the agents that need it load it.

## 4. Styling

- Tailwind utilities only. Colors via SEMANTIC tokens (`bg-surface`, `text-fg`, `bg-primary`,
  `text-danger`, `border-border`), which map to CSS variables in `src/shared/ui/theme/tokens.css`.
- Forbidden in `.tsx`: `style=`, hex/rgb literals, CSS modules, raw palette classes (`bg-blue-600`),
  dynamically built class names (`bg-${color}`) — use a map of full class strings instead.
- Dark mode = `class` on `<html>`; semantic tokens switch automatically, so `dark:` is rarely needed.
- Mobile-first breakpoints (`sm: md: lg: xl:`).
- Token names and state recipes: `plan/design-system.md` (styling-engineer). Contrast is verified
  by `node tools/check-contrast.mjs` (WCAG 2.2 AA, light and dark), never by eye.
