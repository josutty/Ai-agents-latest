# Templates for component-generator

Verified on the reference app (typecheck, strict lint, tests, build, Storybook).
Copy them exactly; adapt only names, fields and paths from the TASK.

## 1. src/entities/product/ui/ProductCard.tsx

```tsx
// src/entities/product/ui/ProductCard.tsx
import type { ReactNode } from 'react';
import type { Product } from '@shared/api';
import { formatPrice } from '@shared/lib/format';

export interface ProductCardProps {
  product: Product;
  /** Slot for feature actions (e.g. <AddToCartButton/>) — entities never import features. */
  actions?: ReactNode;
  onOpen?: (productId: string) => void;
}

export function ProductCard({ product, actions, onOpen }: ProductCardProps) {
  return (
    <article className="flex h-full flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <button type="button" onClick={() => onOpen?.(product.id)} className="rounded-control" aria-label={`Open ${product.name}`}>
        <img src={product.imageUrl} alt={product.name} width={400} height={300} className="aspect-[4/3] w-full rounded-control object-cover" loading="lazy" />
      </button>
      <h3 className="mt-3 text-heading-3 text-fg">{product.name}</h3>
      <p className="mt-1 text-body text-fg-muted">{formatPrice(product.price)}</p>
      {actions ? <div className="mt-auto pt-4">{actions}</div> : null}
    </article>
  );
}
```

## 2. src/entities/product/ui/ProductCard.stories.tsx

```tsx
// src/entities/product/ui/ProductCard.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { productFixtures } from '@mocks/fixtures/product';
import { at } from '@mocks/lib';
import { Button } from '@shared/ui';
import { ProductCard } from './ProductCard';

const meta = {
  component: ProductCard,
  tags: ['autodocs'],
  args: { product: at(productFixtures, 0), onOpen: fn() },
} satisfies Meta<typeof ProductCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithActions: Story = { args: { actions: <Button onClick={fn()}>Add to cart</Button> } };
export const LongName: Story = { args: { product: { ...at(productFixtures, 0), name: 'Extra-long product name that wraps onto several lines in the card' } } };
export const WithoutHandlers: Story = { args: { onOpen: undefined } };
```
