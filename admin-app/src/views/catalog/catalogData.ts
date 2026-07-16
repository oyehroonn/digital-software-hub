/**
 * Shared data layer for the Product & Catalog area.
 *
 * Real catalog rows come from the UNSTABLE VPS Flask API (`/products`). Data is
 * REAL-only: when that box is offline (returns nothing) the loaders return an
 * empty catalog and the UI renders a clean empty state — never fabricated rows.
 * The moment `/products` answers, real rows render with no code change.
 *
 * Performance/trending views join this catalog with the STABLE Telemetry +
 * Orders sheets (via lib/ecommerce + lib/analytics), which are likewise
 * real-only.
 */
import type { AppConfig } from "@/lib/config";
import { getProducts, type Product } from "@/lib/products";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import { buildProductAnalytics, type ProductStat } from "@/lib/analytics";

/** A catalog product with the extended fields the catalog tools read/write. */
export interface CatProduct extends Product {
  sku?: string;
  salePrice?: string | number;
  seoTitle?: string;
  seoDescription?: string;
  slug?: string;
  viewer?: string; // 3D box / model viewer URL ("" or missing = no coverage)
  model?: string; // model / GLB reference
  updatedAt?: string;
  _seed?: boolean;
}

export interface CatalogResult {
  products: CatProduct[];
  seeded: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ *
 * Catalog loader (real → seed fallback)
 * ------------------------------------------------------------------ */

export async function loadCatalog(cfg: AppConfig): Promise<CatalogResult> {
  try {
    const res = await getProducts(cfg, { limit: 500 });
    const rows = (res.products ?? []) as CatProduct[];
    return { products: rows.map(normalizeCat), seeded: false };
  } catch (e) {
    // Real data only — a VPS outage yields an empty catalog + clean empty state.
    return {
      products: [],
      seeded: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Ensure derived helper fields exist on a real row without clobbering data. */
function normalizeCat(p: CatProduct): CatProduct {
  const slug =
    p.slug ??
    (typeof p.name === "string"
      ? p.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      : String(p.id));
  return { ...p, slug };
}

/* ------------------------------------------------------------------ *
 * Performance data (catalog joined with telemetry + orders)
 * ------------------------------------------------------------------ */

export interface PerfResult {
  stats: ProductStat[];
  events: TelemetryEvent[];
  orders: Order[];
  seeded: boolean;
}

/**
 * Fetch telemetry + orders (stable sheets) and build the per-product analytics
 * join. REAL data only — when the sheets are empty the join is empty and the UI
 * renders a clean empty state (never fabricated rows).
 */
export async function loadPerformance(cfg: AppConfig): Promise<PerfResult> {
  let events: TelemetryEvent[] = [];
  let orders: Order[] = [];
  try {
    [events, orders] = await Promise.all([
      fetchTelemetry(cfg),
      fetchOrders(cfg).catch(() => [] as Order[]),
    ]);
  } catch {
    events = [];
    orders = [];
  }
  const stats = buildProductAnalytics(events, orders);
  return { stats, events, orders, seeded: false };
}

/* ------------------------------------------------------------------ *
 * Scoring helpers (pure)
 * ------------------------------------------------------------------ */

/**
 * A 0–100 performance score blending demand (views), engagement (CTR),
 * conversion and revenue — each normalized against the best performer in the
 * set so the score is comparable across the catalog. Weighted:
 * views 20% · CTR 20% · conversion-rate 25% · revenue 35%.
 */
export interface ScoredProduct extends ProductStat {
  score: number;
  convRate: number; // conversions / views
}

export function scoreProducts(stats: ProductStat[]): ScoredProduct[] {
  const maxViews = Math.max(1, ...stats.map((s) => s.views));
  const maxRev = Math.max(1, ...stats.map((s) => s.revenue));
  const maxCtr = Math.max(0.0001, ...stats.map((s) => s.ctr));
  const rows = stats.map((s) => {
    const convRate = s.views ? s.conversions / s.views : 0;
    const maxConv = Math.max(
      0.0001,
      ...stats.map((x) => (x.views ? x.conversions / x.views : 0)),
    );
    const score =
      (s.views / maxViews) * 20 +
      (s.ctr / maxCtr) * 20 +
      (convRate / maxConv) * 25 +
      (s.revenue / maxRev) * 35;
    return { ...s, score: Math.round(score * 10) / 10, convRate };
  });
  return rows.sort((a, b) => b.score - a.score);
}

/**
 * Trend momentum from a product's daily-views sparkline: recent-half views vs
 * previous-half views. Returns percentage change (+/-) and raw recent volume.
 */
export interface TrendPoint {
  productId: string;
  name: string;
  recent: number;
  previous: number;
  changePct: number; // (recent - previous) / previous, clamped for zero base
  views: number;
  spark: number[];
  revenue: number;
  currency: string;
}

export function trendingProducts(stats: ProductStat[]): TrendPoint[] {
  const out: TrendPoint[] = stats.map((s) => {
    const n = s.spark.length;
    const half = Math.floor(n / 2);
    const previous = s.spark.slice(0, half).reduce((a, b) => a + b, 0);
    const recent = s.spark.slice(half).reduce((a, b) => a + b, 0);
    const changePct =
      previous > 0 ? (recent - previous) / previous : recent > 0 ? 1 : 0;
    return {
      productId: s.productId,
      name: s.name,
      recent,
      previous,
      changePct,
      views: s.views,
      spark: s.spark,
      revenue: s.revenue,
      currency: s.currency,
    };
  });
  return out
    .filter((t) => t.recent > 0)
    .sort((a, b) => b.changePct - a.changePct || b.recent - a.recent);
}

/* ------------------------------------------------------------------ *
 * Cross-sell affinity (co-occurrence within a session, from telemetry)
 * ------------------------------------------------------------------ */

export interface Affinity {
  productId: string;
  together: number; // sessions in which both products appeared
}

/**
 * For every product, the products most often seen in the SAME session — the
 * signal behind "customers who viewed X also viewed Y". Pure telemetry derived.
 */
export function crossSellMap(events: TelemetryEvent[]): Map<string, Affinity[]> {
  const bySession = new Map<string, Set<string>>();
  for (const e of events) {
    const pid = String(e.productId ?? "").trim();
    if (!pid) continue;
    const sk = String(e.sessionId ?? e.anonymousId ?? "");
    if (!sk) continue;
    let set = bySession.get(sk);
    if (!set) bySession.set(sk, (set = new Set()));
    set.add(pid);
  }
  const pair = new Map<string, Map<string, number>>();
  const bump = (a: string, b: string) => {
    let m = pair.get(a);
    if (!m) pair.set(a, (m = new Map()));
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (const set of bySession.values()) {
    const ids = [...set];
    for (let i = 0; i < ids.length; i++)
      for (let j = 0; j < ids.length; j++) if (i !== j) bump(ids[i], ids[j]);
  }
  const out = new Map<string, Affinity[]>();
  for (const [a, m] of pair) {
    out.set(
      a,
      [...m.entries()]
        .map(([productId, together]) => ({ productId, together }))
        .sort((x, y) => y.together - x.together),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Duplicate / variation detection (pure)
 * ------------------------------------------------------------------ */

const EDITION_WORDS =
  /\b(standard|professional|pro|enterprise|premium|ultimate|basic|lite|plus|edition|version|v?\d+(\.\d+)?|20\d\d|annual|monthly|subscription|perpetual|1[- ]?year|3[- ]?year|single|multi|team|business|home|student)\b/gi;

/** Canonical base name: lowercased, edition/version noise stripped. */
export function baseName(name: string): string {
  return String(name ?? "")
    .toLowerCase()
    .replace(EDITION_WORDS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface DupGroup {
  base: string;
  members: CatProduct[];
}

/** Group products whose base name collides (2+ members = duplicate/variation). */
export function findDuplicates(products: CatProduct[]): DupGroup[] {
  const groups = new Map<string, CatProduct[]>();
  for (const p of products) {
    const b = baseName(p.name ?? String(p.id));
    if (!b) continue;
    let arr = groups.get(b);
    if (!arr) groups.set(b, (arr = []));
    arr.push(p);
  }
  return [...groups.entries()]
    .filter(([, m]) => m.length > 1)
    .map(([base, members]) => ({ base, members }))
    .sort((a, b) => b.members.length - a.members.length);
}

/* ------------------------------------------------------------------ *
 * Field helpers used across catalog views
 * ------------------------------------------------------------------ */

export function priceNumber(p: CatProduct): number | null {
  const raw = p.salePrice ?? p.price;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function stockNumber(p: CatProduct): number | null {
  if (p.stock == null || (p.stock as unknown) === "") return null;
  const n = typeof p.stock === "number" ? p.stock : parseFloat(String(p.stock));
  return Number.isFinite(n) ? n : null;
}

export function hasModel(p: CatProduct): boolean {
  const v = (p.viewer ?? p.model ?? (p as Record<string, unknown>).boxUrl ?? "") as string;
  return typeof v === "string" && v.trim().length > 0;
}

export function isPriceless(p: CatProduct): boolean {
  return priceNumber(p) == null;
}

export const LOW_STOCK_THRESHOLD = 5;
