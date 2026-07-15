/**
 * CompareContext — a lightweight side-by-side product comparison tray.
 *
 * The provider holds a small list of products the shopper flagged with the
 * "Compare" button (in <ProductDetailModal>). It renders the persistent
 * "Compare (n)" drawer trigger (<CompareTray>) so any page that mounts the
 * provider gets the tray for free.
 *
 * SAFETY: `useCompare()` never throws when called outside a provider — it
 * returns an inert no-op context. This lets product cards / the detail modal
 * reference the compare API before the integration step mounts the provider,
 * without crashing the page (resilience-first, matching <AIFeature>).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from '@/lib/api';
import { track } from '@/lib/stable/analytics';
import CompareTray from '@/components/CompareTray';

/** Hard cap so the side-by-side table stays readable. */
export const MAX_COMPARE = 4;

interface CompareContextValue {
  items: Product[];
  count: number;
  isComparing: (id: Product['id']) => boolean;
  /** Toggle a product in/out of the tray. Returns the resulting state. */
  toggleCompare: (product: Product) => void;
  addToCompare: (product: Product) => void;
  removeFromCompare: (id: Product['id']) => void;
  clearCompare: () => void;
  atCapacity: boolean;
}

const noop = () => {};

const DEFAULT_VALUE: CompareContextValue = {
  items: [],
  count: 0,
  isComparing: () => false,
  toggleCompare: noop,
  addToCompare: noop,
  removeFromCompare: noop,
  clearCompare: noop,
  atCapacity: false,
};

const CompareContext = createContext<CompareContextValue>(DEFAULT_VALUE);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Product[]>([]);

  const isComparing = useCallback(
    (id: Product['id']) => items.some((p) => String(p.id) === String(id)),
    [items]
  );

  const addToCompare = useCallback((product: Product) => {
    setItems((prev) => {
      if (prev.some((p) => String(p.id) === String(product.id))) return prev;
      if (prev.length >= MAX_COMPARE) return prev;
      track({
        event: 'compare_add',
        eventType: 'custom',
        productId: product.id,
        elementText: product.name,
        metadata: { count: prev.length + 1 },
      });
      return [...prev, product];
    });
  }, []);

  const removeFromCompare = useCallback((id: Product['id']) => {
    setItems((prev) => prev.filter((p) => String(p.id) !== String(id)));
  }, []);

  const toggleCompare = useCallback(
    (product: Product) => {
      setItems((prev) => {
        const exists = prev.some((p) => String(p.id) === String(product.id));
        if (exists) return prev.filter((p) => String(p.id) !== String(product.id));
        if (prev.length >= MAX_COMPARE) return prev;
        track({
          event: 'compare_add',
          eventType: 'custom',
          productId: product.id,
          elementText: product.name,
          metadata: { count: prev.length + 1 },
        });
        return [...prev, product];
      });
    },
    []
  );

  const clearCompare = useCallback(() => setItems([]), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      items,
      count: items.length,
      isComparing,
      toggleCompare,
      addToCompare,
      removeFromCompare,
      clearCompare,
      atCapacity: items.length >= MAX_COMPARE,
    }),
    [items, isComparing, toggleCompare, addToCompare, removeFromCompare, clearCompare]
  );

  return (
    <CompareContext.Provider value={value}>
      {children}
      <CompareTray />
    </CompareContext.Provider>
  );
}

/** Safe accessor — returns an inert context when no provider is mounted. */
export function useCompare(): CompareContextValue {
  return useContext(CompareContext);
}
