# Template: data grid (TanStack Table v8 + Radix)

Verified on the reference app against a design HTML: typecheck, ESLint (strict + jsx-a11y), Steiger,
8 grid tests, production build, and `tools/design-spec.mjs compare` → 0 differences.
Covers: grouped headers, frozen column with a cell button, vertical lines, density toggle, column picker,
editable cells with previous value and keyboard movement, search, display rules (tone colors, "–" for empty).
Tokens it needs (styling-engineer): accent, primary-soft, inverse, label / overline / micro font sizes.
Adapt labels, columns and rules from analysis/design-spec + analysis/display-rules; keep the structure.

## 1. shared/ui/data-grid/columnMeta.ts — per-column classes from the design spec

```typescript
import type { RowData } from '@tanstack/react-table';

// Per-column Tailwind classes, copied from the design spec (width, alignment, font, color).
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- TanStack's declaration needs both type parameters
  interface ColumnMeta<TData extends RowData, TValue> {
    headClass?: string;
    cellClass?: string;
  }
}
export {};
```

## 2. shared/ui/data-grid/DataGrid.tsx

```tsx
import type { ReactNode } from 'react';
import { flexRender, type Table } from '@tanstack/react-table';
import './columnMeta';

export type Density = 'comfortable' | 'compact';

export interface DataGridProps<TData> {
  /** A table instance from useReactTable (columns, pinning, visibility, filtering live with the caller). */
  table: Table<TData>;
  /** Accessible name of the grid, e.g. "Indent plan". */
  label: string;
  density?: Density;
  toolbar?: ReactNode;
  footer?: ReactNode;
}

const pad: Record<Density, string> = { comfortable: 'px-3 py-2.5', compact: 'px-3 py-1' };
const line = 'border-r border-border';

/** Grouped headers, pinned (frozen) columns, vertical lines, density, horizontal scroll. Cells style themselves via column meta. */
export function DataGrid<TData>({ table, label, density = 'comfortable', toolbar, footer }: DataGridProps<TData>) {
  const groups = table.getHeaderGroups();
  return (
    <div className="flex flex-col gap-3">
      {toolbar}
      <div className="mx-6 overflow-x-auto rounded-card border border-border">
        <table aria-label={label} className="w-max min-w-full border-collapse text-body-sm text-fg">
          <thead className="bg-surface-muted">
            {groups.map((group, gi) => {
              const leafRow = gi === groups.length - 1;
              return (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      scope={header.colSpan > 1 ? 'colgroup' : 'col'}
                      className={`${pad[density]} ${line} whitespace-nowrap ${leafRow ? 'border-b text-label font-semibold text-fg' : 'text-left text-overline uppercase text-fg-muted'} ${header.column.getIsPinned() ? 'sticky left-0 z-20 bg-surface-muted' : ''} ${leafRow ? header.column.columnDef.meta?.headClass ?? '' : ''}`}
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              );
            })}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const content = flexRender(cell.column.columnDef.cell, cell.getContext());
                  const cls = `${pad[density]} ${line} border-b whitespace-nowrap ${cell.column.columnDef.meta?.cellClass ?? 'text-right tabular-nums'}`;
                  return cell.column.getIsPinned() ? (
                    <th key={cell.id} scope="row" className={`${cls} sticky left-0 z-10 bg-surface text-left`}>{content}</th>
                  ) : (
                    <td key={cell.id} className={cls}>{content}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
```

## 3. shared/ui/data-grid/EditableNumberCell.tsx

```tsx
import { useId, useState } from 'react';
import { handleGridKeyDown } from './gridKeyboard';

export interface EditableNumberCellProps {
  value: number;
  /** Previous value shown under the input ("was 25"); omit when there is none. */
  previous?: number;
  /** Accessible name, e.g. "W1 for H HSD 20FT BSVI NGB". */
  label: string;
  row: number;
  col: number;
  onCommit: (value: number) => void;
}

export function EditableNumberCell({ value, previous, label, row, col, onCommit }: EditableNumberCellProps) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) { setSynced(value); setDraft(String(value)); } // value changed from outside
  const hintId = useId();

  const commit = () => {
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isInteger(next) || next < 0) { setDraft(String(value)); return; }
    if (next !== value) onCommit(next);
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        aria-describedby={previous !== undefined ? hintId : undefined}
        data-row={row}
        data-col={col}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Escape') setDraft(String(value)); else handleGridKeyDown(e); }}
        className="w-14 rounded border border-border-strong bg-surface px-1.5 py-0.5 text-right text-body-sm tabular-nums"
      />
      {previous !== undefined ? <span id={hintId} className="text-micro text-fg-muted">was {previous}</span> : null}
    </div>
  );
}
```

## 4. shared/ui/data-grid/gridKeyboard.ts

```typescript
import type { KeyboardEvent } from 'react';

const MOVES: Record<string, readonly [number, number]> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Enter: [1, 0],
};

/** Spreadsheet-style movement between editable cells (inputs carrying data-row / data-col). */
export function handleGridKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
  const target = event.currentTarget;
  if (target.dataset.row === undefined) return;
  const move = MOVES[event.key];
  if (!move) return;
  const row = Number(target.dataset.row) + move[0];
  const col = Number(target.dataset.col) + move[1];
  const next = target.closest('table')?.querySelector<HTMLInputElement>(`input[data-row="${row}"][data-col="${col}"]`);
  if (!next) return;
  event.preventDefault();
  next.focus(); // the cell being left commits on blur
  next.select();
}
```

## 5. shared/ui/data-grid/DensityToggle.tsx — toggle-group (Radix)

```tsx
import { ToggleGroup } from 'radix-ui';
import type { Density } from './DataGrid';

export interface DensityToggleProps {
  value: Density;
  onChange: (value: Density) => void;
}

const item = 'rounded-control px-3 py-1.5 text-label text-fg-muted data-[state=on]:bg-surface data-[state=on]:font-semibold data-[state=on]:text-primary';

/** Segmented control (Radix ToggleGroup): arrow keys move, one option always selected. */
export function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => { if (v === 'comfortable' || v === 'compact') onChange(v); }}
      aria-label="Row density"
      className="inline-flex rounded-card bg-surface-muted p-0.5"
    >
      <ToggleGroup.Item value="comfortable" className={item}>Comfortable</ToggleGroup.Item>
      <ToggleGroup.Item value="compact" className={item}>Compact</ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
```

## 6. shared/ui/data-grid/ColumnsMenu.tsx — column-visibility (Radix DropdownMenu)

```tsx
import { DropdownMenu } from 'radix-ui';
import type { Table } from '@tanstack/react-table';
import { Button } from '../button/Button';

export interface ColumnsMenuProps<TData> {
  table: Table<TData>;
  /** Column ids that can be hidden (pinned columns usually can't). */
  hideable: { id: string; label: string }[];
}

/** Column picker (Radix DropdownMenu + TanStack column visibility). */
export function ColumnsMenu<TData>({ table, hideable }: ColumnsMenuProps<TData>) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm"><span aria-hidden="true">☷</span> Columns</Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-48 rounded-card border border-border bg-surface p-1 shadow-card">
          {hideable.map(({ id, label }) => {
            const column = table.getColumn(id);
            return column ? (
              <DropdownMenu.CheckboxItem
                key={id}
                checked={column.getIsVisible()}
                onCheckedChange={(checked) => column.toggleVisibility(checked)}
                onSelect={(e) => e.preventDefault()}
                className="flex cursor-default items-center gap-2 rounded-control px-2 py-1.5 text-body-sm text-fg outline-none data-[highlighted]:bg-surface-muted"
              >
                <span aria-hidden="true" className="w-4">{column.getIsVisible() ? '✓' : ''}</span>
                {label}
              </DropdownMenu.CheckboxItem>
            ) : null;
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

## 7. shared/ui/data-grid/index.ts

```typescript
export { DataGrid, type DataGridProps, type Density } from './DataGrid';
export { EditableNumberCell, type EditableNumberCellProps } from './EditableNumberCell';
export { DensityToggle, type DensityToggleProps } from './DensityToggle';
export { ColumnsMenu, type ColumnsMenuProps } from './ColumnsMenu';
```

## 8. shared/ui/button/Button.tsx — variants the grid toolbar uses (outline, ghost, sm)

```tsx
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary/90',
  secondary: 'border border-border-strong bg-surface text-fg hover:bg-surface-muted',
  outline: 'border border-primary bg-transparent text-primary hover:bg-primary/5',
  ghost: 'border border-transparent bg-transparent text-fg hover:bg-surface-muted',
  danger: 'bg-danger text-danger-fg hover:bg-danger/90',
};
const sizes: Record<Size, string> = { sm: 'h-9 px-3.5', md: 'min-h-10 px-4' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-control text-body-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

## 9. widget example — IndentPlanGrid.tsx (exact labels, display rules, toolbar, footer)

```tsx
import { useMemo, useState } from 'react';
import { createColumnHelper, getCoreRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table';
import { Button } from '@shared/ui';
import { ColumnsMenu, DataGrid, DensityToggle, EditableNumberCell, type Density } from '@shared/ui/data-grid';
import { formatCount } from '@shared/lib/format';

export type StockTone = 'low' | 'warn' | 'ok';

export interface IndentLine {
  id: string;
  description: string;
  fertCode: string;
  mpg: string;
  stock: number;
  /** Display rule from the design: low → danger, warn → warning. Decided by the backend (open question Q1). */
  stockTone: StockTone;
  livePos: number | null;
  pipeline: { confirmed: number; fa: number; fc: number; hotInq: number };
  offtakeL3: number;
  retailL3: number;
  weeks: number[];
  previousWeeks: number[];
}

export interface IndentPlanGridProps {
  lines: IndentLine[];
  monthLabel: string;
  onChangeWeek: (lineId: string, week: number, value: number) => void;
}

const WEEKS = ['W1', 'W2', 'W3', 'W4'] as const;
const TONE: Record<StockTone, string> = { low: 'font-semibold text-danger', warn: 'font-semibold text-warning', ok: '' };
const h = createColumnHelper<IndentLine>();
const single = (id: string, label: string, leaf: ReturnType<typeof h.accessor>) => h.group({ id: `${id}Group`, header: label, columns: [leaf] });

export function IndentPlanGrid({ lines, monthLabel, onChangeWeek }: IndentPlanGridProps) {
  const [search, setSearch] = useState('');
  const [density, setDensity] = useState<Density>('comfortable');

  const columns = useMemo(() => [
    h.accessor('description', {
      id: 'description', header: 'Description',
      meta: { headClass: 'w-64 min-w-64 text-left', cellClass: 'w-64 min-w-64 font-semibold' },
      cell: ({ getValue }) => (
        <span className="inline-flex items-center gap-2">
          {getValue()}
          <button type="button" aria-label={`Details for ${getValue()}`} className="grid size-[22px] place-items-center rounded-control border border-border bg-surface text-caption text-fg-muted">ⓘ</button>
        </span>
      ),
    }),
    single('fertCode', 'Fert code', h.accessor('fertCode', { id: 'fertCode', header: 'FERT code', meta: { cellClass: 'text-left font-mono text-accent' } })),
    single('mpg', 'MPG', h.accessor('mpg', { id: 'mpg', header: 'MPG', meta: { cellClass: 'text-left' } })),
    single('stock', 'Stock ▸', h.accessor('stock', { id: 'stock', header: 'Stock', cell: ({ row, getValue }) => <span className={TONE[row.original.stockTone]}>{getValue()}</span> })),
    single('livePos', 'Live POs ▸', h.accessor('livePos', { id: 'livePos', header: 'Live POs', cell: ({ getValue }) => formatCount(getValue()) })),
    h.group({ id: 'pipeline', header: 'Pipeline ▸', columns: [
      h.accessor((r) => r.pipeline.confirmed, { id: 'confirmed', header: 'Confirmed' }),
      h.accessor((r) => r.pipeline.fa, { id: 'fa', header: 'FA' }),
      h.accessor((r) => r.pipeline.fc, { id: 'fc', header: 'FC' }),
      h.accessor((r) => r.pipeline.hotInq, { id: 'hotInq', header: 'Hot Inq' }),
    ] }),
    single('offtake', 'Offtake L3 ▸', h.accessor('offtakeL3', { id: 'offtakeL3', header: 'Offtake L3' })),
    single('retail', 'Retail L3 ▸', h.accessor('retailL3', { id: 'retailL3', header: 'Retail L3' })),
    h.group({ id: 'indent', header: `Your indent · ${monthLabel}`, columns: WEEKS.map((w, i) => h.display({
      id: w, header: w,
      cell: ({ row }) => (
        <EditableNumberCell value={row.original.weeks[i] ?? 0} previous={row.original.previousWeeks[i]}
          label={`${w} for ${row.original.description}`} row={row.index} col={i} onCommit={(v) => onChangeWeek(row.original.id, i, v)} />
      ),
    })) }),
  ], [monthLabel, onChangeWeek]);

  const table = useReactTable({
    data: lines, columns, getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(),
    state: { globalFilter: search }, onGlobalFilterChange: setSearch,
    globalFilterFn: (row, _id, f: string) => `${row.original.description} ${row.original.fertCode}`.toLowerCase().includes(f.toLowerCase()),
    initialState: { columnPinning: { left: ['description'] } },
  });
  const visible = table.getRowModel().rows.length;

  return (
    <DataGrid
      table={table}
      label="Indent plan"
      density={density}
      toolbar={(
        <div className="flex flex-wrap items-center gap-3 px-6 py-3">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or description"
            aria-label="Search code or description" className="w-72 rounded-control border border-border-strong px-3 py-2 text-body-sm" />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-label text-primary">
            LMD <Button variant="ghost" size="sm" aria-label="Remove LMD">×</Button>
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear all</Button>
          <span className="text-body-sm text-fg-muted"><strong className="text-fg">{visible}</strong> of {lines.length} lines</span>
          <Button variant="outline" size="sm">+ Add FERT</Button>
          <Button variant="ghost" size="sm">Export</Button>
          <DensityToggle value={density} onChange={setDensity} />
          <ColumnsMenu table={table} hideable={[{ id: 'fertCode', label: 'FERT code' }, { id: 'mpg', label: 'MPG' }, { id: 'livePos', label: 'Live POs' }]} />
        </div>
      )}
      footer={(
        <div className="flex items-center justify-end gap-4 px-6 py-3 text-label text-fg-muted">
          <span role="status">Saved just now</span>
          <Button size="sm">Review &amp; submit</Button>
        </div>
      )}
    />
  );
}
```

## 10. tests — IndentPlanGrid.test.tsx (design labels, display rules, capabilities)

```tsx
import { useCallback, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IndentPlanGrid, type IndentLine } from './IndentPlanGrid';

const seed: IndentLine[] = [
  { id: '1', description: 'H HSD 20FT BSVI NGB', fertCode: 'V4130CAF', mpg: 'Pro 2110', stock: 8, stockTone: 'low', livePos: 1, pipeline: { confirmed: 34, fa: 29, fc: 21, hotInq: 103 }, offtakeL3: 84, retailL3: 35, weeks: [24, 23, 23, 25], previousWeeks: [25, 24, 23, 25] },
  { id: '2', description: 'L CBC 22FT BSVI NGB', fertCode: 'V4030DZL', mpg: 'Pro 2110', stock: 17, stockTone: 'ok', livePos: null, pipeline: { confirmed: 28, fa: 25, fc: 18, hotInq: 87 }, offtakeL3: 71, retailL3: 30, weeks: [19, 18, 18, 20], previousWeeks: [20, 19, 18, 20] },
  { id: '3', description: 'M SLP 24FT BSVI NGB', fertCode: 'V4131SLP', mpg: 'Pro 2110', stock: 4, stockTone: 'warn', livePos: 2, pipeline: { confirmed: 15, fa: 13, fc: 10, hotInq: 47 }, offtakeL3: 38, retailL3: 16, weeks: [10, 10, 9, 9], previousWeeks: [10, 10, 9, 9] },
];
function Harness() {
  const [lines, setLines] = useState(seed);
  const onChangeWeek = useCallback((id: string, week: number, value: number) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, weeks: l.weeks.map((v, i) => (i === week ? value : v)) } : l))), []);
  return <IndentPlanGrid lines={lines} monthLabel="July 2026" onChangeWeek={onChangeWeek} />;
}

describe('IndentPlanGrid', () => {
  it('uses the exact column labels and order from the design spec', () => {
    render(<Harness />);
    const headers = within(screen.getByRole('table')).getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers.slice(-15)).toEqual(['Description', 'FERT code', 'MPG', 'Stock', 'Live POs', 'Confirmed', 'FA', 'FC', 'Hot Inq', 'Offtake L3', 'Retail L3', 'W1', 'W2', 'W3', 'W4']);
  });

  it('groups the pipeline and indent columns', () => {
    render(<Harness />);
    expect(screen.getByRole('columnheader', { name: 'Pipeline ▸' })).toHaveAttribute('colspan', '4');
    expect(screen.getByRole('columnheader', { name: 'Your indent · July 2026' })).toHaveAttribute('colspan', '4');
  });

  it('freezes the description column and offers details', () => {
    render(<Harness />);
    expect(screen.getByRole('rowheader', { name: /H HSD 20FT BSVI NGB/ })).toHaveClass('sticky', 'left-0');
    expect(screen.getByRole('button', { name: 'Details for H HSD 20FT BSVI NGB' })).toBeInTheDocument();
  });

  it('applies the display rules: stock tone and dash for empty live POs', () => {
    render(<Harness />);
    expect(screen.getByText('8')).toHaveClass('text-danger');
    expect(screen.getByText('4')).toHaveClass('text-warning');
    const row2 = screen.getByRole('rowheader', { name: /L CBC 22FT/ }).closest('tr');
    expect(row2 && within(row2).getByText('–')).toBeInTheDocument();
  });

  it('switches density with the segmented control', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const compact = screen.getByRole('radio', { name: 'Compact' });
    await user.click(compact);
    expect(compact).toHaveAttribute('data-state', 'on');
    expect(screen.getByRole('rowheader', { name: /H HSD/ })).toHaveClass('py-1');
  });

  it('hides a column from the Columns menu', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('button', { name: /Columns/ }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitemcheckbox', { name: /MPG/ }));
    await user.keyboard('{Escape}'); // the menu stays open for several picks; Esc closes it
    expect(within(screen.getByRole('table')).queryByRole('columnheader', { name: 'MPG' })).not.toBeInTheDocument();
  });

  it('commits an edit with Enter and moves down a row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const w1 = screen.getByRole('textbox', { name: 'W1 for H HSD 20FT BSVI NGB' });
    expect(w1).toHaveAccessibleDescription('was 25');
    await user.clear(w1);
    await user.type(w1, '30{Enter}');
    expect(screen.getByRole('textbox', { name: 'W1 for L CBC 22FT BSVI NGB' })).toHaveFocus();
    expect(w1).toHaveValue('30');
  });

  it('filters rows with search', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByRole('searchbox', { name: 'Search code or description' }), 'V4131');
    expect(within(screen.getByRole('table')).getAllByRole('rowheader')).toHaveLength(1);
  });
});
```

## 11. test/setup.ts addition — Radix in jsdom

```typescript
// Radix primitives (menus, popovers) call these browser APIs that jsdom doesn't implement.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
```

## 12. shared/lib/format — empty values

```typescript
export const formatCount = (value: number | null | undefined): string => (value == null ? '–' : String(value));
```

## 13. e2e recipe — frozen column

```typescript
// Capability recipe: frozen column — after scrolling the grid sideways, the first column has not moved.
import { expect, test } from '@playwright/test';

test('frozen model column stays visible while scrolling', async ({ page }) => {
  await page.goto('/indent');
  const first = page.getByRole('rowheader').first();
  const before = await first.boundingBox();
  await page.locator('table').locator('xpath=..').evaluate((el) => { el.scrollLeft = 600; });
  const after = await first.boundingBox();
  expect(after?.x).toBe(before?.x);
  await expect(first).toBeInViewport();
});
```
