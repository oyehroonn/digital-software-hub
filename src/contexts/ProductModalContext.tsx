/**
 * ProductModalContext — the openProductModal hook + provider for the rich
 * product-detail popup (<ProductDetailModal>).
 *
 * A product card calls `openProductModal(product)`; the provider mounts the
 * modal (lazy-loaded, so the 3D viewer + LLM client only download on demand)
 * and fires the `product_modal_open` analytics event to the STABLE sink.
 *
 * SAFETY: `useProductModal()` never throws outside a provider — it returns an
 * inert no-op. Product cards can therefore call it before the integration step
 * mounts <ProductModalProvider>, without crashing the page.
 */

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from '@/lib/api';
import { track } from '@/lib/stable/analytics';

const ProductDetailModal = lazy(() => import('@/components/ProductDetailModal'));

interface ProductModalContextValue {
  product: Product | null;
  isOpen: boolean;
  openProductModal: (product: Product) => void;
  closeProductModal: () => void;
}

const DEFAULT_VALUE: ProductModalContextValue = {
  product: null,
  isOpen: false,
  openProductModal: () => {},
  closeProductModal: () => {},
};

const ProductModalContext = createContext<ProductModalContextValue>(DEFAULT_VALUE);

export function ProductModalProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product | null>(null);

  const openProductModal = useCallback((next: Product) => {
    setProduct(next);
    // Fire-and-forget analytics on open (STABLE sink; never blocks the UI).
    track({
      event: 'product_modal_open',
      eventType: 'custom',
      productId: next.id,
      elementText: next.name,
      metadata: {
        brand: next.brand,
        category: next.category,
        licenseType: next.licenseType,
        price: next.price,
      },
    });
  }, []);

  const closeProductModal = useCallback(() => setProduct(null), []);

  const value = useMemo<ProductModalContextValue>(
    () => ({ product, isOpen: !!product, openProductModal, closeProductModal }),
    [product, openProductModal, closeProductModal]
  );

  return (
    <ProductModalContext.Provider value={value}>
      {children}
      {product && (
        <Suspense fallback={null}>
          <ProductDetailModal product={product} onClose={closeProductModal} />
        </Suspense>
      )}
    </ProductModalContext.Provider>
  );
}

/** Safe accessor — returns an inert context when no provider is mounted. */
export function useProductModal(): ProductModalContextValue {
  return useContext(ProductModalContext);
}
