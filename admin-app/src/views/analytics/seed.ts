/**
 * Deterministic SEED telemetry + orders for the Analytics & Heatmaps area.
 *
 * The live read endpoint (GET ?action=telemetry) may not be deployed yet, so
 * every analytics view falls back to this seed so the whole area renders NOW.
 * Unlike the per-component `demo` samplers (which use Math.random and jitter on
 * every render), this generator is fully DETERMINISTIC — a fixed PRNG seed →
 * byte-identical events every call — so hover counts, rankings and funnels stay
 * stable across refreshes. Every row is flagged `_seed: true` and pages/products
 * are internally coherent (a session that orders also views, clicks, scrolls,
 * carries a source, and shows up in the realtime feed) so ALL views light up
 * from one dataset: click/look heatmaps, scroll depth, funnel, rage clicks,
 * search (incl. zero-result), attribution, realtime feed and drop-off index.
 */
import type { Order, TelemetryEvent } from "@/lib/ecommerce";

export const SEED_FLAG = "_seed" as const;

/* Deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeedSource {
  source: string;
  medium: string;
  campaign?: string;
  referrer: string;
  weight: number;
  convBoost: number; // multiplier on conversion likelihood
}

const SOURCES: SeedSource[] = [
  { source: "google", medium: "organic", referrer: "https://www.google.com/", weight: 34, convBoost: 1.1 },
  { source: "(direct)", medium: "none", referrer: "", weight: 22, convBoost: 1.0 },
  { source: "facebook", medium: "cpc", campaign: "summer_sale", referrer: "https://l.facebook.com/", weight: 15, convBoost: 0.8 },
  { source: "newsletter", medium: "email", campaign: "july_promo", referrer: "", weight: 10, convBoost: 1.6 },
  { source: "linkedin", medium: "social", campaign: "thought_leadership", referrer: "https://www.linkedin.com/", weight: 8, convBoost: 1.2 },
  { source: "bing", medium: "organic", referrer: "https://www.bing.com/", weight: 6, convBoost: 0.9 },
  { source: "google", medium: "cpc", campaign: "brand_search", referrer: "https://www.google.com/", weight: 5, convBoost: 1.4 },
];

interface SeedProduct {
  id: string;
  name: string;
  path: string;
  price: number;
  sku: string;
}

const PRODUCTS: SeedProduct[] = [
  { id: "dsm", name: "DSM Suite", path: "/products/dsm", price: 1490, sku: "DSM-SUITE" },
  { id: "vto", name: "Virtual Try-On", path: "/products/virtual-try-on", price: 890, sku: "VTO-PRO" },
  { id: "vsz", name: "Virtual Sizing", path: "/products/virtual-sizing", price: 640, sku: "VSZ-STD" },
  { id: "pbk", name: "Pointblank", path: "/products/pointblank", price: 320, sku: "PBK-CORE" },
  { id: "vpo", name: "VPO Platform", path: "/products/vpo", price: 2100, sku: "VPO-ENT" },
];

/** page -> click hotspots (normalized), used to make the click heatmap look real. */
const HOTSPOTS: Record<string, { x: number; y: number; id: string; text: string }[]> = {
  "/": [
    { x: 0.5, y: 0.06, id: "nav-quote", text: "Get My Quote" },
    { x: 0.42, y: 0.33, id: "hero-cta", text: "Start Free" },
    { x: 0.62, y: 0.34, id: "hero-demo", text: "Watch Demo" },
    { x: 0.3, y: 0.62, id: "card-dsm", text: "DSM Suite" },
    { x: 0.72, y: 0.62, id: "card-vto", text: "Virtual Try-On" },
  ],
  "/products": [
    { x: 0.5, y: 0.12, id: "search-box", text: "Search products" },
    { x: 0.24, y: 0.4, id: "grid-1", text: "DSM Suite" },
    { x: 0.5, y: 0.4, id: "grid-2", text: "Virtual Try-On" },
    { x: 0.76, y: 0.4, id: "grid-3", text: "VPO Platform" },
  ],
  "/pricing": [
    { x: 0.28, y: 0.4, id: "plan-starter", text: "Starter" },
    { x: 0.5, y: 0.38, id: "plan-pro", text: "Professional" },
    { x: 0.72, y: 0.42, id: "plan-ent", text: "Enterprise" },
    { x: 0.5, y: 0.72, id: "pricing-cta", text: "Buy Now" },
  ],
  "/ai-lab": [
    { x: 0.5, y: 0.5, id: "advisor", text: "Ask the IT Advisor" },
    { x: 0.5, y: 0.8, id: "callback", text: "Book a Callback" },
  ],
  pdp: [
    { x: 0.35, y: 0.28, id: "gallery", text: "Product image" },
    { x: 0.72, y: 0.4, id: "buy", text: "Buy Now" },
    { x: 0.72, y: 0.5, id: "cart", text: "Add to Cart" },
    { x: 0.72, y: 0.62, id: "compare", text: "Compare" },
  ],
};

const SEARCH_POOL: { q: string; results: number }[] = [
  { q: "virtual try on", results: 8 },
  { q: "dsm license", results: 5 },
  { q: "3d avatar", results: 6 },
  { q: "sizing api", results: 3 },
  { q: "pointblank", results: 2 },
  { q: "bulk pricing", results: 1 },
  { q: "refund policy", results: 0 },
  { q: "student discount", results: 0 },
  { q: "crack download", results: 0 },
  { q: "vpo integration", results: 0 },
  { q: "compare editions", results: 4 },
];

const DEVICES = [
  { ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36", device: "desktop", vw: 1440, vh: 900 },
  { ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36", device: "desktop", vw: 1536, vh: 864 },
  { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1 Mobile Safari", device: "mobile", vw: 390, vh: 844 },
  { ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari", device: "mobile", vw: 412, vh: 915 },
  { ua: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1 Safari", device: "tablet", vw: 834, vh: 1112 },
];

const GEO = [
  { city: "Sydney", country: "AU" },
  { city: "Melbourne", country: "AU" },
  { city: "London", country: "GB" },
  { city: "Dubai", country: "AE" },
  { city: "Singapore", country: "SG" },
  { city: "Toronto", country: "CA" },
  { city: "Austin", country: "US" },
  { city: "Berlin", country: "DE" },
];

const FIRST = ["Aisha", "Liam", "Noah", "Mia", "Omar", "Sofia", "Ethan", "Layla", "Lucas", "Zara", "Hana", "Jack", "Nora", "Ravi", "Elena"];
const LAST = ["Khan", "Nguyen", "Smith", "Patel", "Garcia", "Chen", "Okafor", "Rossi", "Kim", "Haddad", "Brown", "Silva"];

interface Ctx {
  events: TelemetryEvent[];
  orders: Order[];
  now: number;
}

const DAY = 86_400_000;
const DOC_H = 3200;

/** Weighted pick from a list using rng in [0,1). */
function weighted<T extends { weight: number }>(rng: () => number, items: T[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function pickOne<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function push(
  ctx: Ctx,
  base: {
    sessionId: string;
    anonymousId: string;
    page: string;
    t: number;
    productId?: string;
    ua: string;
    vw: number;
    vh: number;
  },
  ev: {
    event: string;
    eventType: string;
    x?: number;
    y?: number;
    elementId?: string;
    elementText?: string;
    meta?: Record<string, unknown>;
  },
) {
  ctx.events.push({
    _seed: true,
    timestamp: new Date(base.t).toISOString(),
    storeName: "DSM",
    sessionId: base.sessionId,
    anonymousId: base.anonymousId,
    event: ev.event,
    eventType: ev.eventType,
    pageUrl: `https://dsm.example${base.page}`,
    elementId: ev.elementId ?? "",
    elementText: ev.elementText ?? "",
    productId: base.productId ?? "",
    userAgent: base.ua,
    x: ev.x,
    y: ev.y,
    metadata: { vw: base.vw, dh: DOC_H, vh: base.vh, ...(ev.meta ?? {}) },
  } as TelemetryEvent);
}

/**
 * Build the full deterministic seed dataset. `now` is injected so the realtime
 * feed and "last 14 days" window are relative to render time while the shape
 * stays deterministic.
 */
export function generateSeed(now = Date.now(), sessions = 260): { events: TelemetryEvent[]; orders: Order[] } {
  const rng = mulberry32(0x0d5_ada7);
  const ctx: Ctx = { events: [], orders: [], now };

  for (let i = 0; i < sessions; i++) {
    const src = weighted(rng, SOURCES);
    const dev = pickOne(rng, DEVICES);
    const geo = pickOne(rng, GEO);
    const sessionId = `seed-s${i.toString().padStart(3, "0")}`;
    const anonymousId = `anon-${(i * 7 + 13).toString(36)}`;

    // ~14% of sessions land in the last 12 minutes (feeds the realtime feed);
    // the rest spread across the prior 14 days.
    const recent = i % 7 === 0;
    const start = recent
      ? now - Math.floor(rng() * 12 * 60_000)
      : now - Math.floor((0.02 + rng() * 0.98) * 14 * DAY);
    let t = start;
    const step = () => (t += 1500 + Math.floor(rng() * 9000));

    const landing = weighted(rng, [
      { page: "/", weight: 40 },
      { page: "/products", weight: 22 },
      { page: "/pricing", weight: 18 },
      { page: "/ai-lab", weight: 8 },
      { page: "pdp", weight: 12 },
    ] as { page: string; weight: number }[]);
    const landingProduct = landing.page === "pdp" ? pickOne(rng, PRODUCTS) : null;
    const landingPath = landingProduct ? landingProduct.path : landing.page;

    const shared = { sessionId, anonymousId, ua: dev.ua, vw: dev.vw, vh: dev.vh };
    const attrMeta = {
      utm_source: src.source,
      utm_medium: src.medium,
      utm_campaign: src.campaign ?? "",
      referrer: src.referrer,
      device: dev.device,
      city: geo.city,
      country: geo.country,
      landing: landingPath,
    };

    // 1) Landing page_view (carries first-touch attribution).
    push(ctx, { ...shared, page: landingPath, t: step(), productId: landingProduct?.id }, {
      event: "page_view",
      eventType: "view",
      meta: attrMeta,
    });

    // Helper to emit the on-page interaction bundle (clicks + hover + scroll).
    const engage = (page: string, productId?: string) => {
      const spots = HOTSPOTS[page] ?? HOTSPOTS[productId ? "pdp" : "/"] ?? [];
      const nClicks = 1 + Math.floor(rng() * 3);
      for (let c = 0; c < nClicks && spots.length; c++) {
        const s = spots[Math.floor(rng() * spots.length) % spots.length];
        const jx = (rng() - 0.5) * 0.05;
        const jy = (rng() - 0.5) * 0.04;
        push(ctx, { ...shared, page, t: step(), productId }, {
          event: "click",
          eventType: "click",
          x: Math.round(Math.max(0, Math.min(1, s.x + jx)) * dev.vw),
          y: Math.round(Math.max(0, Math.min(1, s.y + jy)) * DOC_H),
          elementId: s.id,
          elementText: s.text,
        });
        // A dwell/hover sample near each click (feeds the Look map).
        push(ctx, { ...shared, page, t: step(), productId }, {
          event: "hover",
          eventType: "hover",
          x: Math.round(Math.max(0, Math.min(1, s.x + jx * 0.5)) * dev.vw),
          y: Math.round(Math.max(0, Math.min(1, s.y + jy * 0.5)) * DOC_H),
          elementId: s.id,
          elementText: s.text,
          meta: { dwellMs: 800 + Math.floor(rng() * 6000) },
        });
      }
      // Scroll depth for this page.
      const maxDepth = Math.min(100, Math.round((1 - Math.pow(rng(), 0.6)) * 100));
      for (let d = 15; d <= maxDepth; d += 20) {
        push(ctx, { ...shared, page, t: step(), productId }, {
          event: "scroll",
          eventType: "scroll",
          y: d,
          meta: { depth: d },
        });
      }
    };

    engage(landingPath, landingProduct?.id);

    // 2) Optional search (~28% of sessions).
    if (rng() < 0.28) {
      const q = pickOne(rng, SEARCH_POOL);
      push(ctx, { ...shared, page: "/products", t: step() }, {
        event: "search",
        eventType: "search",
        elementText: q.q,
        meta: { query: q.q, resultCount: q.results },
      });
      if (q.results > 0 && rng() < 0.7) engage("/products");
    }

    // 3) Product journey: most sessions view at least one PDP.
    let product = landingProduct;
    if (!product && rng() < 0.72) {
      product = weighted(
        rng,
        PRODUCTS.map((p, idx) => ({ ...p, weight: 5 - Math.min(4, idx) })),
      );
      push(ctx, { ...shared, page: product.path, t: step(), productId: product.id }, {
        event: "product_view",
        eventType: "view",
        elementText: product.name,
        meta: { productName: product.name },
      });
      engage(product.path, product.id);
    } else if (product) {
      push(ctx, { ...shared, page: product.path, t: step(), productId: product.id }, {
        event: "product_view",
        eventType: "view",
        elementText: product.name,
        meta: { productName: product.name },
      });
    }

    // 4) Rage / dead clicks (~9% of sessions) on a stubborn Buy button.
    if (product && rng() < 0.09) {
      const rageX = Math.round(0.72 * dev.vw);
      const rageY = Math.round(0.4 * DOC_H);
      const bursts = 3 + Math.floor(rng() * 4);
      for (let r = 0; r < bursts; r++) {
        t += 120 + Math.floor(rng() * 260); // rapid succession
        push(ctx, { ...shared, page: product.path, t, productId: product.id }, {
          event: "click",
          eventType: "click",
          x: rageX + Math.round((rng() - 0.5) * 6),
          y: rageY + Math.round((rng() - 0.5) * 6),
          elementId: "buy",
          elementText: "Buy Now",
          meta: { rage: true, dead: true, noResponse: true },
        });
      }
    }

    // 5) Funnel progression, boosted by source quality.
    const wantCart = product && rng() < 0.34 * src.convBoost;
    if (wantCart && product) {
      push(ctx, { ...shared, page: product.path, t: step(), productId: product.id }, {
        event: "add_to_cart",
        eventType: "click",
        elementId: "cart",
        elementText: "Add to Cart",
        meta: { productName: product.name, price: product.price },
      });
      const wantCheckout = rng() < 0.6;
      if (wantCheckout) {
        push(ctx, { ...shared, page: "/checkout", t: step(), productId: product.id }, {
          event: "begin_checkout",
          eventType: "checkout",
          meta: { productName: product.name, price: product.price },
        });
        const wantOrder = rng() < 0.55 * src.convBoost;
        if (wantOrder) {
          const ot = step();
          push(ctx, { ...shared, page: "/checkout", t: ot, productId: product.id }, {
            event: "order",
            eventType: "order",
            meta: { productName: product.name, price: product.price },
          });
          const name = `${pickOne(rng, FIRST)} ${pickOne(rng, LAST)}`;
          const qty = 1 + Math.floor(rng() * 3);
          ctx.orders.push({
            _seed: true,
            timestamp: new Date(ot).toISOString(),
            storeName: "DSM",
            customerName: name,
            email: `${name.toLowerCase().replace(/[^a-z]/g, ".")}@example.com`,
            phone: `+61 4${Math.floor(rng() * 90_000_000 + 10_000_000)}`,
            city: geo.city,
            country: geo.country,
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            quantity: qty,
            price: product.price,
            currency: "USD",
            notes: src.campaign ? `via ${src.source}/${src.campaign}` : `via ${src.source}`,
          } as Order);
        }
      }
    }

    // 6) Occasional AI outage (~5%).
    if (rng() < 0.05) {
      push(ctx, { ...shared, page: landingPath, t: step() }, {
        event: "ai_outage",
        eventType: "error",
        meta: {
          service: pickOne(rng, ["vps", "codex-proxy", "simli"]),
          feature: pickOne(rng, ["Instant Quote Genie", "Smart Search", "Talking Advisor", "Concierge"]),
          error: "timeout",
        },
      });
    }
  }

  // Stable chronological order (newest last) so realtime slicing is predictable.
  ctx.events.sort((a, b) => Date.parse(String(a.timestamp)) - Date.parse(String(b.timestamp)));
  return { events: ctx.events, orders: ctx.orders };
}

/** True if a row came from the seed generator. */
export function isSeed(row: Record<string, unknown>): boolean {
  return row[SEED_FLAG] === true;
}
