# Templates for app-bootstrap

Verified on the reference app (typecheck, strict lint, tests, build, Storybook).
Copy them exactly; adapt only names, fields and paths from the TASK.

## 1. 2. package.json + dependencies (pinned majors — AGENTS.md §1) (bash)

```bash
npm i react@^19 react-dom@^19 @reduxjs/toolkit@^2 react-redux@^9 react-router@^7 react-error-boundary@^5 \
  react-hook-form@^7 zod@^4 @hookform/resolvers@^5
npm i -D typescript@^5 vite@^6 @vitejs/plugin-react@^4 @types/react@^19 @types/react-dom@^19 @types/node \
  tailwindcss@^3.4 postcss@^8 autoprefixer@^10 \
  vitest@^3 @vitest/coverage-v8@^3 jsdom@^30 @testing-library/react@^16 @testing-library/dom@^10 \
  @testing-library/jest-dom@^6 @testing-library/user-event@^14 \
  msw@^2 @faker-js/faker@^9 \
  eslint@^9 @eslint/js@^9 typescript-eslint@^8 eslint-plugin-react-hooks@^5 eslint-plugin-jsx-a11y@^6 globals@^17 \
  steiger@^0.7 @feature-sliced/steiger-plugin@^0.8 \
  storybook@^8 @storybook/react-vite@^8 @storybook/addon-essentials@^8 @storybook/addon-a11y@^8 \
  @storybook/addon-themes@^8 @storybook/test@^8 \
  openapi-typescript@^7 @redocly/cli@^2 \
  @playwright/test@^1 @axe-core/playwright@^4 \
  prettier@^3 eslint-config-prettier@^10 lint-staged@^16
npx msw init public --save          # creates public/mockServiceWorker.js — dev MSW fails without it
npx playwright install chromium     # one browser is enough; needs network (report if it fails, don't retry in a loop)
```

## 2. 3. package.json scripts (json)

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc --noEmit",
  "lint": "eslint . --cache --cache-location node_modules/.cache/eslint/ && steiger ./src",
  "test": "vitest run",
  "test:watch": "vitest",
  "coverage": "vitest run --coverage",
  "e2e": "playwright test",
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build --quiet",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

Also in package.json — lint-staged (run by `.githooks/pre-commit` on staged files only):
```json
"lint-staged": {
  "*.{ts,tsx,js,mjs,cjs}": ["prettier --write", "eslint --fix --no-warn-ignored"],
  "*.{json,css,md,yml,yaml,html}": ["prettier --write"]
}
```

`.prettierrc.json` (the format hook and lint-staged only run Prettier when this file exists):
```json
{ "singleQuote": true, "printWidth": 120, "trailingComma": "all" }
```

`.prettierignore`:
```
dist
coverage
storybook-static
playwright-report
test-results
public/mockServiceWorker.js
src/shared/api/generated
plan
analysis
notes
inputs
package-lock.json
```

## 3. / <reference types="vitest/config" />

```typescript
/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@app': r('./src/app'), '@pages': r('./src/pages'), '@widgets': r('./src/widgets'),
        '@features': r('./src/features'), '@entities': r('./src/entities'), '@shared': r('./src/shared'),
        '@mocks': r('./mocks'), '@test': r('./test'),
      },
    },
    server: { proxy: env.VITE_API_PROXY_TARGET ? { '/api': { target: env.VITE_API_PROXY_TARGET, changeOrigin: true } } : undefined },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'], // e2e/ belongs to Playwright
      setupFiles: ['./test/setup.ts'],
      env: { VITE_API_BASE_URL: 'http://localhost', VITE_API_MODE: 'mock' },
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.stories.tsx', 'src/**/index.ts', 'src/**/*.d.ts', 'src/shared/api/generated/**',
          'src/app/main.tsx', 'src/app/App.tsx', 'src/app/router.tsx', 'src/app/providers/**'], // app shell: covered by e2e
        thresholds: {
          lines: 70, functions: 70, branches: 70, statements: 70,
          'src/features/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
          'src/widgets/**': { lines: 80, functions: 80, branches: 80, statements: 80 },
        },
      },
    },
  };
});
```

## 4. 5. tsconfig.json (json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "incremental": true,
    "tsBuildInfoFile": "node_modules/.cache/tsconfig.tsbuildinfo",
    "resolveJsonModule": true,
    "types": ["vite/client", "node"],
    "paths": {
      "@app/*": ["./src/app/*"], "@pages/*": ["./src/pages/*"], "@widgets/*": ["./src/widgets/*"],
      "@features/*": ["./src/features/*"], "@entities/*": ["./src/entities/*"], "@shared/*": ["./src/shared/*"],
      "@mocks/*": ["./mocks/*"], "@test/*": ["./test/*"]
    }
  },
  "include": ["src", "mocks", "test", "e2e", ".storybook", "*.ts"]
}
```

## 5. 6. eslint.config.js (flat) — these rules are how the team's contracts are enforced (javascript)

```javascript
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier/flat'; // turns off rules that fight Prettier — keep it after the other configs

export default tseslint.config(
  { ignores: ['dist', 'storybook-static', 'coverage', 'public', 'playwright-report', 'test-results', 'src/shared/api/generated'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  jsxA11y.flatConfigs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/**/*.test.tsx', 'src/**/*.stories.tsx'],
    rules: {
      'max-lines': ['error', { max: 250 }],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use RTK Query hooks (AGENTS.md §3)' }],
      'no-restricted-imports': ['error', { paths: [
        { name: 'axios', message: 'Use RTK Query' },
        { name: '@shared/api/baseApi', message: 'Components use entity/feature hooks, not baseApi' },
      ] }],
      'no-restricted-syntax': ['error',
        { selector: "JSXAttribute[name.name='style']", message: 'Tailwind classes only (AGENTS.md §4)' },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'XSS risk: render text, or sanitize in shared/lib with a reviewed library' },
        // hex colors (#fff, #ffffff, bg-[#ff0000]) — not in-page anchors like "#add-to-cart"
        { selector: "Literal[value=/(^|[\\s\\[(:,])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\\w-])/]", message: 'Use semantic color tokens' },
        { selector: "TemplateElement[value.raw=/(^|[\\s\\[(:,])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![\\w-])/]", message: 'Use semantic color tokens' },
      ],
    },
  },
  prettierConfig,
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { globals: globals.node } },
  { files: ['src/shared/lib/logger/**'], rules: { 'no-console': 'off' } },
);
```

## 6. 6. eslint.config.js (flat) — these rules are how the team's contracts are enforced (typescript)

```typescript
import { defineConfig } from 'steiger';
import fsd from '@feature-sliced/steiger-plugin';

export default defineConfig([
  ...fsd.configs.recommended,
  // A slice with one consumer is normal while TASKs land bottom-up — report it, don't block the loop.
  { rules: { 'fsd/insignificant-slice': 'warn' } },
  // AGENTS.md fixes app/ segments as store/ and providers/ (team-wide contract).
  { files: ['./src/app/**'], rules: { 'fsd/segments-by-purpose': 'off' } },
]);
```

## 7. .storybook/main.ts

```typescript
// .storybook/main.ts
import type { StorybookConfig } from '@storybook/react-vite';
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.tsx'],
  core: { disableTelemetry: true },
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y', '@storybook/addon-themes'],
};
export default config;
```

## 8. 7. Other files (typescript)

```typescript
import { defineConfig, devices } from '@playwright/test';
const PORT = 5179;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { VITE_API_MODE: 'mock', VITE_API_BASE_URL: '' },
  },
});
```

## 9. Usage: node tools/list-html-elements.mjs <file.html>

Ships ready-made in `tools/list-html-elements.mjs` (like `tools/design-spec.mjs`). Never re-create or edit it.

## 10. Usage: node tools/check-contrast.mjs [tokens.css] [pairs.json]

Ships ready-made in `tools/check-contrast.mjs`. Never re-create or edit it.

## 11. src/app/main.tsx

```tsx
// src/app/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { env } from '@shared/config';
import { applyTheme } from '@shared/ui/theme';
import '@shared/ui/theme/base.css';
import { App } from './App';

async function enableMocking() {
  if (!import.meta.env.DEV || env.apiMode === 'real') return; // never in production builds
  const { worker } = await import('@mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' }); // hybrid: real endpoints pass through
}

const container = document.getElementById('root');
if (!container) throw new Error('#root not found');

applyTheme('system');
void enableMocking().then(() => {
  createRoot(container).render(<StrictMode><App /></StrictMode>);
});
```

## 12. src/app/App.tsx

```tsx
// src/app/App.tsx
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router/dom'; // DOM entry of react-router 7
import { ErrorBoundary } from 'react-error-boundary';
import { store } from './store';
import { router } from './router';
import { AppCrashFallback } from './providers/AppCrashFallback';

export function App() {
  return (
    <ErrorBoundary FallbackComponent={AppCrashFallback}>
      <Provider store={store}>
        <RouterProvider router={router} />
      </Provider>
    </ErrorBoundary>
  );
}
```

## 13. src/app/router.tsx — one lazy route per page in plan/fsd-structure.md

```tsx
// src/app/router.tsx — one lazy route per page in plan/fsd-structure.md
import { createBrowserRouter } from 'react-router';
import { routes } from '@shared/config';
import { RequireAuth } from './providers/RequireAuth';
import { RouteErrorFallback } from './providers/RouteErrorFallback';

export const router = createBrowserRouter([
  {
    path: routes.products,
    lazy: async () => ({ Component: (await import('@pages/products')).ProductsPage }),
    errorElement: <RouteErrorFallback />,
  },
  {
    element: <RequireAuth />, // guarded group — only when the plan has a session entity + sign-in route
    errorElement: <RouteErrorFallback />,
    children: [
      { path: routes.account, lazy: async () => ({ Component: (await import('@pages/account')).AccountPage }) },
    ],
  },
  { path: '*', lazy: async () => ({ Component: (await import('@pages/not-found')).NotFoundPage }) },
]);
```

## 14. src/app/providers/RequireAuth.tsx — pathless layout route (verified with a redir

```tsx
// src/app/providers/RequireAuth.tsx — pathless layout route (verified with a redirect test)
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAppSelector } from '@shared/lib/store';
import { sessionSlice } from '@entities/session';
import { routes } from '@shared/config';

export function RequireAuth() {
  const isAuthenticated = useAppSelector(sessionSlice.selectors.selectIsAuthenticated);
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to={routes.signIn} replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
```
