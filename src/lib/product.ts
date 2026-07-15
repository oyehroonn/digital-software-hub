/**
 * product.ts — small presentational helpers shared by the product detail modal
 * and the compare tray. Pure functions, no side effects.
 *
 * The live /products API returns a few loosely-typed fields (stock, imagery,
 * variable pricing) that aren't in the strict `Product` interface, so we read
 * them defensively here rather than widening the type everywhere.
 */

import type { Product } from './api';

/** Fields the API may include beyond the strict Product interface. */
export interface ProductExtras {
  stock?: number | string | null;
  inStock?: boolean;
  image?: string;
  imageUrl?: string;
  thumbnail?: string;
  priceFrom?: number | string;
  fromPrice?: number | string;
  variablePricing?: boolean;
  shortDescription?: string;
}

export type ProductLike = Product & ProductExtras;

/**
 * Human price string. Handles the "from AED" variable-pricing case: a product
 * priced as a range, flagged `variablePricing`, or carrying a `priceFrom` reads
 * as e.g. "from AED 1,200".
 */
export function displayPrice(product: ProductLike): string {
  const raw = (product.price ?? '').toString().trim();
  const from = product.priceFrom ?? product.fromPrice;

  const looksVariable =
    !!product.variablePricing ||
    /[-–—]/.test(raw) ||
    /\bfrom\b/i.test(raw) ||
    from != null;

  if (!raw && from != null) {
    const f = from.toString().trim();
    return /aed/i.test(f) ? `from ${f}` : `from AED ${f}`;
  }
  if (!raw) return 'Contact for price';
  if (looksVariable && !/\bfrom\b/i.test(raw)) return `from ${raw}`;
  return raw;
}

/** Short availability label derived from stock / inStock / status fields. */
export function stockLabel(product: ProductLike): string {
  const { stock, inStock, status } = product;

  if (typeof stock === 'number') {
    if (stock <= 0) return 'Out of stock';
    if (stock <= 5) return `Low stock — ${stock} left`;
    return 'In stock';
  }
  if (typeof stock === 'string' && stock.trim()) return stock.trim();
  if (typeof inStock === 'boolean') return inStock ? 'In stock' : 'Out of stock';
  if (status && status.trim()) {
    const s = status.trim().toLowerCase();
    if (s === 'active' || s === 'available' || s === 'published') return 'In stock';
    return status.trim();
  }
  return 'Available on order';
}

/** True when the item is known to be unavailable. */
export function isOutOfStock(product: ProductLike): boolean {
  if (typeof product.stock === 'number') return product.stock <= 0;
  if (typeof product.inStock === 'boolean') return !product.inStock;
  return /out of stock|unavailable|discontinued/i.test(stockLabel(product));
}

/** First usable image URL, if the API supplied one. */
export function productImage(product: ProductLike): string | undefined {
  return product.image || product.imageUrl || product.thumbnail || undefined;
}

/** A tight, single-line blurb for deep-link prompts (≤160 chars). */
export function shortBlurb(product: ProductLike): string {
  const src = (product.shortDescription || product.description || '').replace(/\s+/g, ' ').trim();
  if (src.length <= 160) return src;
  return `${src.slice(0, 157).trimEnd()}…`;
}
