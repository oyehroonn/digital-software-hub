/**
 * VPS Flask product API client (UNSTABLE backend). Every call may time out /
 * 500 / be offline — callers must handle rejection and degrade gracefully.
 *
 * Read endpoints exist today (/products, /products/<id>, /search).
 * Write + regen endpoints (assumed, secret-gated) are what edits push to:
 *   POST /admin/products/<id>   { changes }         -> update catalog/price/stock
 *   POST /admin/regen/<id>                          -> trigger 3D box regen
 */
import { httpGet, httpPost } from "./rpc";
import type { AppConfig } from "./config";

export interface Product {
  id: string | number;
  name: string;
  category?: string;
  brand?: string;
  licenseType?: string;
  price?: string | number;
  stock?: number;
  status?: string;
  description?: string;
  viewer?: string;
  link?: string;
  tags?: string[];
  [k: string]: unknown;
}

export interface ProductsResponse {
  count: number;
  products: Product[];
  page?: number;
  totalPages?: number;
}

export async function getProducts(
  cfg: AppConfig,
  params: { page?: number; limit?: number; q?: string } = {},
): Promise<ProductsResponse> {
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  sp.set("limit", String(params.limit ?? 100));
  if (params.q) sp.set("q", params.q);
  const text = await httpGet(`${cfg.vps_base}/products?${sp}`, { timeoutMs: 6000 });
  const data = JSON.parse(text);
  return {
    count: data.count ?? data.products?.length ?? 0,
    products: data.products ?? [],
    page: data.page,
    totalPages: data.totalPages,
  };
}

export interface ProductEdit {
  price?: string | number;
  stock?: number;
  status?: string;
  name?: string;
  description?: string;
  category?: string;
  // Extended, optional catalog fields (SEO editor, bundle/cross-sell, model
  // coverage, bulk import). All additive — older callers are unaffected.
  brand?: string;
  licenseType?: string;
  sku?: string;
  salePrice?: string | number;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  viewer?: string; // 3D viewer / box URL
  crossSell?: (string | number)[]; // recommended companion product ids
}

/** Push a single edit to the VPS. Rejects if the VPS is unreachable. */
export async function pushProductEdit(
  cfg: AppConfig,
  productId: string | number,
  changes: ProductEdit,
): Promise<void> {
  await httpPost(
    `${cfg.vps_base}/admin/products/${productId}`,
    JSON.stringify({ changes, secret: cfg.ecommerce_secret }),
    "application/json",
    { timeoutMs: 12000 },
  );
}

/** Trigger a 3D box regen on the VPS. Rejects if unreachable. */
export async function triggerBoxRegen(cfg: AppConfig, productId: string | number): Promise<void> {
  await httpPost(
    `${cfg.vps_base}/admin/regen/${productId}`,
    JSON.stringify({ secret: cfg.ecommerce_secret }),
    "application/json",
    { timeoutMs: 12000 },
  );
}
