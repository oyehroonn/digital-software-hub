/**
 * Shared data layer for the Product & Catalog area.
 *
 * Real catalog rows come from the UNSTABLE VPS Flask API (`/products`). Because
 * that box may be offline (and today often is), every loader falls back to a
 * DETERMINISTIC seed — same input, same output — with every row flagged
 * `_seed: true` so the UI can badge it and nothing looks broken while the VPS
 * is down. The moment `/products` answers, real rows replace the seed with no
 * code change.
 *
 * Performance/trending views join this catalog with the STABLE Telemetry +
 * Orders sheets (via lib/ecommerce + lib/analytics). Telemetry/orders have
 * their own seed fallback so the join always renders.
 */
import type { AppConfig } from "@/lib/config";
import { getProducts, type Product } from "@/lib/products";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import { buildProductAnalytics, type ProductStat } from "@/lib/analytics";
import { generateSeedEvents } from "@/analytics/telemetryClient";

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
    if (rows.length > 0) return { products: rows.map(normalizeCat), seeded: false };
    return { products: generateSeedProducts(), seeded: true };
  } catch (e) {
    return {
      products: generateSeedProducts(),
      seeded: true,
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
 * join. Falls back to the deterministic telemetry seed + derived seed orders so
 * performance/trending always render.
 */
export async function loadPerformance(cfg: AppConfig): Promise<PerfResult> {
  let events: TelemetryEvent[] = [];
  let orders: Order[] = [];
  let seeded = false;
  try {
    [events, orders] = await Promise.all([
      fetchTelemetry(cfg),
      fetchOrders(cfg).catch(() => [] as Order[]),
    ]);
  } catch {
    events = [];
  }
  if (events.length === 0) {
    events = generateSeedEvents() as unknown as TelemetryEvent[];
    seeded = true;
  }
  if (orders.length === 0) {
    orders = deriveSeedOrders(events);
    if (orders.length > 0 && events.some((e) => (e as { _seed?: boolean })._seed)) seeded = true;
  }
  const stats = buildProductAnalytics(events, orders);
  return { stats, events, orders, seeded };
}

/** Turn the seed telemetry `order` conversion events into Orders-sheet rows. */
function deriveSeedOrders(events: TelemetryEvent[]): Order[] {
  const out: Order[] = [];
  const names = seedNames();
  for (const e of events) {
    const name = String(e.event ?? "").toLowerCase();
    if (!/^order$|purchase|order_?placed/.test(name)) continue;
    const pid = String(e.productId ?? "").trim();
    if (!pid) continue;
    const meta = (typeof e.metadata === "object" && e.metadata ? e.metadata : {}) as Record<
      string,
      unknown
    >;
    const value = Number(meta.value ?? meta.price ?? 0) || 199 + (hash(pid) % 900);
    out.push({
      timestamp: e.timestamp,
      customerName: "Seed Customer",
      email: `${pid}@seed.dsm`,
      productId: pid,
      productName: names[pid] ?? pid,
      quantity: Number(meta.qty ?? 1) || 1,
      price: value,
      currency: String(meta.currency ?? "USD"),
    });
  }
  return out;
}

function seedNames(): Record<string, string> {
  const m: Record<string, string> = {};
  for (const p of generateSeedProducts()) m[String(p.id)] = p.name;
  return m;
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

/* ------------------------------------------------------------------ *
 * Deterministic seed catalog
 * ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * ~40 realistic catalog rows. The first six use the same ids the telemetry seed
 * emits (dsm, virtual-sizing, …) so the performance/trending join lights up.
 * Deliberately seeded with gaps the catalog tools are built to catch:
 *   - some rows have NO price (Contact-for-pricing auditor)
 *   - some are low/zero stock (stock alerts)
 *   - some have NO 3D model (box coverage)
 *   - several are edition variations of one base (duplicate cleanup)
 *   - some have thin/empty SEO fields (SEO editor)
 */
export function generateSeedProducts(): CatProduct[] {
  const rnd = mulberry32(20260715);
  const out: CatProduct[] = [];

  // DSM's own flagship products (ids match telemetry seed where applicable).
  const flagship: Array<Partial<CatProduct> & { id: string; name: string }> = [
    { id: "dsm", name: "DSM Design Suite", brand: "DSM", category: "3D CAD", price: 1499, stock: 40 },
    { id: "virtual-sizing", name: "Virtual Sizing", brand: "DSM", category: "Retail Tech", price: 899, stock: 22 },
    { id: "virtual-try-on", name: "Virtual Try-On", brand: "DSM", category: "Retail Tech", price: 1190, stock: 3 },
    { id: "pointblank", name: "Pointblank Analytics", brand: "DSM", category: "Analytics", price: undefined, stock: 15 },
    { id: "vpo", name: "VPO Cloud", brand: "DSM", category: "Cloud", price: 349, stock: 0 },
    { id: "techrealm", name: "TechRealm Platform", brand: "TechRealm", category: "Platform", price: 2400, stock: 8 },
    { id: "preservemyworld", name: "PreserveMy.World", brand: "DSM", category: "Archival", price: undefined, stock: 12 },
    { id: "logicpacks", name: "LogicPacks Automation", brand: "DSM", category: "Automation", price: 599, stock: 30 },
    { id: "lazyware", name: "Lazyware", brand: "DSM", category: "Automation", price: 129, stock: 120 },
    { id: "bringit", name: "Bringit Logistics", brand: "DSM", category: "Logistics", price: 459, stock: 2 },
    { id: "flyaquab", name: "FlyAquab", brand: "DSM", category: "IoT", price: undefined, stock: 5 },
    { id: "apex", name: "Apex Render Engine", brand: "DSM", category: "3D CAD", price: 1990, stock: 18 },
    { id: "ummah-directory", name: "Ummah Directory", brand: "DSM", category: "Directory", price: 0, stock: 999 },
  ];

  const CATS = ["3D CAD", "Analytics", "Cloud", "Automation", "Retail Tech", "Platform"];
  const LICENSES = ["Standard", "Professional", "Enterprise"];

  for (const f of flagship) {
    const price = f.price;
    const withModel = rnd() > 0.35;
    const thinSeo = rnd() > 0.55;
    out.push({
      id: f.id,
      name: f.name,
      brand: f.brand,
      category: f.category,
      licenseType: LICENSES[Math.floor(rnd() * LICENSES.length)],
      price: price,
      salePrice: rnd() > 0.8 && price ? Math.round((price as number) * 0.85) : undefined,
      stock: f.stock,
      status: f.stock === 0 ? "out_of_stock" : "active",
      sku: `DSM-${f.id.slice(0, 4).toUpperCase()}-${Math.floor(rnd() * 900 + 100)}`,
      description:
        rnd() > 0.75
          ? ""
          : `${f.name} — production-grade tooling from DSM. Trusted since 1994.`,
      slug: f.id,
      viewer: withModel ? `https://dsm-api.techrealm.ai/viewer/${f.id}` : "",
      seoTitle: thinSeo ? "" : `${f.name} | DSM`,
      seoDescription: thinSeo ? "" : `Buy ${f.name} from DSM. Licensing, pricing and support.`,
      tags: [f.category ?? "software", f.brand ?? "DSM"],
      updatedAt: new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 14))).toISOString(),
      _seed: true,
    });

    // Emit edition variations for a couple of flagships (duplicate cleanup demo).
    if (f.id === "dsm" || f.id === "apex") {
      for (const lic of ["Professional", "Enterprise"]) {
        out.push({
          id: `${f.id}-${lic.toLowerCase()}`,
          name: `${f.name} ${lic} Edition`,
          brand: f.brand,
          category: f.category,
          licenseType: lic,
          price: price ? Math.round((price as number) * (lic === "Enterprise" ? 1.8 : 1.3)) : undefined,
          stock: Math.floor(rnd() * 25),
          status: "active",
          sku: `DSM-${f.id.slice(0, 4).toUpperCase()}-${lic.slice(0, 3).toUpperCase()}`,
          description: `${f.name} ${lic} Edition.`,
          slug: `${f.id}-${lic.toLowerCase()}`,
          viewer: withModel ? `https://dsm-api.techrealm.ai/viewer/${f.id}` : "",
          seoTitle: "",
          seoDescription: "",
          tags: [f.category ?? "software", lic],
          updatedAt: new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 14))).toISOString(),
          _seed: true,
        });
      }
    }
  }

  // Generic long-tail catalog to fill out the tables.
  const bases = [
    "Photon Modeler",
    "Nimbus Vault",
    "Quanta Ledger",
    "Helix Studio",
    "Orbit Scheduler",
    "Vertex Forge",
    "Cobalt Insights",
    "Aperture Scan",
    "Strata Sync",
    "Lumen Board",
    "Cascade Flow",
    "Ironclad Backup",
  ];
  for (let i = 0; i < bases.length; i++) {
    const name = bases[i];
    const priced = rnd() > 0.22;
    const stock = Math.floor(Math.pow(rnd(), 1.6) * 80);
    const withModel = rnd() > 0.5;
    out.push({
      id: `sku-${1000 + i}`,
      name,
      brand: i % 3 === 0 ? "TechRealm" : "DSM",
      category: CATS[Math.floor(rnd() * CATS.length)],
      licenseType: LICENSES[Math.floor(rnd() * LICENSES.length)],
      price: priced ? 79 + Math.floor(rnd() * 1500) : undefined,
      stock,
      status: stock === 0 ? "out_of_stock" : rnd() > 0.9 ? "draft" : "active",
      sku: `TR-${1000 + i}`,
      description: rnd() > 0.7 ? "" : `${name} keeps teams moving.`,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      viewer: withModel ? `https://dsm-api.techrealm.ai/viewer/sku-${1000 + i}` : "",
      seoTitle: rnd() > 0.5 ? `${name} | DSM` : "",
      seoDescription: rnd() > 0.5 ? `Get ${name} today.` : "",
      tags: [],
      updatedAt: new Date(Date.UTC(2026, 6, 1 + Math.floor(rnd() * 14))).toISOString(),
      _seed: true,
    });
  }

  return out;
}
