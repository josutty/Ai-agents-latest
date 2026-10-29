# Templates for coder

Verified on the reference app (typecheck, strict lint, tests, build, Storybook).
Copy them exactly; adapt only names, fields and paths from the TASK.

## 1. src/widgets/product-catalog/ui/ProductCatalog.tsx

```tsx
// src/widgets/product-catalog/ui/ProductCatalog.tsx
import { useAppSelector } from '@shared/lib/store';
import { getErrorMessage } from '@shared/api';
import { EmptyState, ErrorBanner } from '@shared/ui';
import { ProductCard, ProductCardSkeleton, useListProductsQuery } from '@entities/product';
import { FiltersPanel, filterProductsSlice } from '@features/filter-products';
import { AddToCartButton } from '@features/add-to-cart';

export function ProductCatalog() {
  const filters = useAppSelector(filterProductsSlice.selectors.selectFilters);
  const page = useAppSelector(filterProductsSlice.selectors.selectPage);
  const { data, isLoading, isFetching, isError, error, refetch } = useListProductsQuery({ ...filters, page });

  return (
    <section aria-labelledby="catalog-heading" className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <h2 id="catalog-heading" className="sr-only">Products</h2>
      <FiltersPanel disabled={isLoading} />
      {isLoading ? (
        <ProductGridSkeleton count={8} />
      ) : isError ? (
        <ErrorBanner message={getErrorMessage(error)} onRetry={() => void refetch()} />
      ) : !data?.data.length ? (
        <EmptyState title="No products match your filters" />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={isFetching}>
          {data.data.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} actions={<AddToCartButton productId={p.id} productName={p.name} />} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductGridSkeleton({ count }: { count: number }) {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading products">
      {Array.from({ length: count }, (_, i) => <li key={i}><ProductCardSkeleton /></li>)}
    </ul>
  );
}
```

## 2. src/features/add-to-cart/ui/AddToCartButton.tsx — mutation: loading + error come

```tsx
// src/features/add-to-cart/ui/AddToCartButton.tsx — mutation: loading + error come from the hook
import { getErrorMessage } from '@shared/api';
import { Button } from '@shared/ui';
import { useAddToCartMutation } from '../api/cartApi';

export interface AddToCartButtonProps {
  productId: string;
  productName: string;
}

export function AddToCartButton({ productId, productName }: AddToCartButtonProps) {
  const [addToCart, { isLoading, isError, error }] = useAddToCartMutation();

  const handleClick = async () => {
    try {
      await addToCart({ productId, quantity: 1 }).unwrap();
    } catch {
      // the hook's `error` renders below — nothing else to do here
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={() => void handleClick()} loading={isLoading} aria-label={`Add ${productName} to cart`} className="w-full">
        {isLoading ? 'Adding…' : 'Add to cart'}
      </Button>
      {isError ? <p role="alert" className="text-caption text-danger">{getErrorMessage(error)}</p> : null}
    </div>
  );
}
```
