# Templates for test-engineer

Verified on the reference app (typecheck, strict lint, tests, build, Storybook).
Copy them exactly; adapt only names, fields and paths from the TASK.

## 1. test/setup.ts

```typescript
// test/setup.ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '@mocks/node';
import { resetDb } from '@mocks/db';

// jsdom lacks matchMedia; applyTheme() and responsive hooks rely on it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  });
}

// Radix primitives (menus, popovers) call these browser APIs that jsdom doesn't implement.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup(); // explicit: RTL auto-cleanup needs Vitest globals, which we don't enable
  server.resetHandlers();
  resetDb();
});
afterAll(() => server.close());
```

## 2. test/test-utils.tsx

```tsx
// test/test-utils.tsx
import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { makeStore } from '@app/store';

interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  preloadedState?: Parameters<typeof makeStore>[0];
  store?: ReturnType<typeof makeStore>;
  route?: string;
}

/** Fresh store per call (AGENTS.md §5). Returns the store and a user-event instance. */
export function renderWithProviders(ui: ReactElement, { preloadedState, store = makeStore(preloadedState), route = '/', ...options }: ProviderOptions = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Provider>
    );
  }
  return { store, user: userEvent.setup(), ...render(ui, { wrapper: Wrapper, ...options }) };
}

export * from '@testing-library/react';
```

## 3. connected component — all four data states, retry, mutation

```tsx
// connected component — all four data states, retry, mutation
import { describe, expect, it } from 'vitest';
import { renderWithProviders, screen, within } from '@test/test-utils';
import { server } from '@mocks/node';
import { scenarios } from '@mocks/scenarios';
import { productFixtures } from '@mocks/fixtures/product';
import { at } from '@mocks/lib';
import { ProductCatalog } from './ProductCatalog';

describe('ProductCatalog', () => {
  it('shows a loading skeleton first', () => {
    server.use(...scenarios.productsSlow);
    renderWithProviders(<ProductCatalog />);
    expect(screen.getByRole('list', { name: 'Loading products' })).toBeInTheDocument();
  });

  it('renders products on success', async () => {
    renderWithProviders(<ProductCatalog />);
    expect(await screen.findByRole('heading', { name: at(productFixtures, 0).name })).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(20);
  });

  it('shows the empty state', async () => {
    server.use(...scenarios.productsEmpty);
    renderWithProviders(<ProductCatalog />);
    expect(await screen.findByText('No products match your filters')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    server.use(...scenarios.productsServerError);
    const { user } = renderWithProviders(<ProductCatalog />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Something went wrong')).toBeInTheDocument();
    server.resetHandlers(); // the next request succeeds
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: at(productFixtures, 0).name })).toBeInTheDocument();
  });
});
```

## 4. form (excerpt — imports as in the presentational test) — accessible errors, no s

```tsx
// form (excerpt — imports as in the presentational test) — accessible errors, no submit on invalid input
it('shows linked field errors and does not submit invalid input', async () => {
  const onSubmit = vi.fn(() => Promise.resolve());
  const user = userEvent.setup();
  render(<SignInForm onSubmit={onSubmit} />);
  await user.type(screen.getByLabelText('Email'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  const email = screen.getByLabelText('Email');
  expect(email).toHaveAttribute('aria-invalid', 'true');
  expect(email).toHaveAccessibleDescription('Enter a valid email address');
  expect(onSubmit).not.toHaveBeenCalled();
});
```

## 5. e2e/products.spec.ts — page smoke: render, a11y (light + dark), no overflow, no 

```typescript
// e2e/products.spec.ts — page smoke: render, a11y (light + dark), no overflow, no console errors
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('/ (products)', () => {
  test('renders, has no serious a11y violations, and no horizontal overflow', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();

    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
    expect(consoleErrors).toEqual([]);
  });

  test('dark mode keeps a11y clean', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
    expect(violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });
});
```
