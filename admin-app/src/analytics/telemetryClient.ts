/**
 * Telemetry data layer for the DSM admin Analytics dashboard.
 *
 * Responsibilities
 *  1. Fetch raw telemetry rows from the STABLE ecommerce Apps Script
 *     (`GET ?action=telemetry&secret=…&since=…&limit=…` → `{ ok, rows:[…] }`),
 *     routed through the Tauri http bridge (`httpGet`) to dodge CORS.
 *  2. Normalize every row into a single typed `TelemetryEvent` shape,
 *     accepting BOTH the sheet's snake_case keys (`event_name`, `received_at`,
 *     `session_id`, `product_id`, `metadata_json`, …) AND any camelCase drift,
 *     coercing `x/y` to numbers and parsing `metadata_json`.
 *  3. Provide pure, memo-friendly aggregation helpers (by product / page /
 *     event / time bucket / x-y density bins / scroll-depth bands / funnel).
 *  4. Emit a DETERMINISTIC seed of 500–700 realistic events (each flagged
 *     `_seed: true`) so the dashboards render richly until the Apps Script read
 *     endpoint ships. `fetchEvents()` transparently falls back to the seed when
 *     production returns no rows.
 *
 * IMPORTANT (backend gap): as of this build the Apps Script only implements
 * `GET ?action=schema`. No read action exists, so live fetches return `[]` and
 * the seed is served. The moment `?action=telemetry` → `{rows:[…]}` ships, real
 * data flows through the exact same path. This file needs no change then.
 */
import { httpGet } from "@/lib/rpc";
import type { AppConfig } from "@/lib/config";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Types
 * ────────────────────────────────────────────────────────────────────────── */

/** Fully normalized telemetry event. Snake_case + camelCase inputs collapse here. */
export interface TelemetryEvent {
  /** ISO-ish timestamp string (from `received_at`). */
  timestamp: string;
  /** Epoch millis parsed from `timestamp`; NaN-safe (0 when unparseable). */
  ts: number;
  storeName: string;
  sessionId: string;
  anonymousId: string;
  userId: string;
  /** Normalized event name (from `event_name`), lower-cased for matching. */
  event: string;
  /** Coarse type (from `event_type`), lower-cased. e.g. click | scroll | view. */
  eventType: string;
  pageUrl: string;
  elementId: string;
  elementText: string;
  /** Raw pointer coordinate; NaN when absent. */
  x: number;
  y: number;
  /** Scroll direction, lower-cased ("up" | "down" | ""). */
  direction: string;
  productId: string;
  metadata: Record<string, unknown>;
  userAgent: string;
  /** True only for locally generated seed rows. Never set on real data. */
  _seed?: boolean;
  /** Escape hatch for unexpected columns. */
  [k: string]: unknown;
}

export interface FetchOptions {
  /** Only pull events at/after this instant (Date | ISO string | epoch ms). */
  since?: Date | string | number;
  /** Max rows to request from the backend. Default 5000. */
  limit?: number;
  /** Network timeout for the bridge call (ms). Default 12000. */
  timeoutMs?: number;
  /**
   * Seed fallback behaviour when production returns 0 rows:
   *  - "auto"  (default) → serve deterministic seed
   *  - "never" → return [] (surface a real Empty state)
   *  - "only"  → skip the network entirely, return seed (dev/offline)
   */
  seed?: "auto" | "never" | "only";
}

export interface FetchResult {
  events: TelemetryEvent[];
  /** True when the returned events are the local deterministic seed. */
  seeded: boolean;
  /** Rows the backend actually returned (0 today — read endpoint pending). */
  liveCount: number;
  /** Non-fatal fetch error message, if any (UI can surface it). */
  error?: string;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Normalization
 * ────────────────────────────────────────────────────────────────────────── */

/** First present, non-empty value among the given keys (snake_case OR camelCase). */
function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function toStr(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return typeof v === "string" ? v : String(v);
}

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function parseMeta(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string" && v.trim()) {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* leave empty */
    }
  }
  return {};
}

/**
 * Map one raw sheet/API row → a `TelemetryEvent`.
 * Accepts either casing for every field so it survives serialization drift.
 */
export function normalizeEvent(raw: unknown): TelemetryEvent {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const timestamp = toStr(pick(row, "received_at", "receivedAt", "timestamp", "time", "created_at"));
  const parsed = Date.parse(timestamp);

  return {
    timestamp,
    ts: Number.isNaN(parsed) ? 0 : parsed,
    storeName: toStr(pick(row, "store_name", "storeName")),
    sessionId: toStr(pick(row, "session_id", "sessionId")),
    anonymousId: toStr(pick(row, "anonymous_id", "anonymousId")),
    userId: toStr(pick(row, "user_id", "userId")),
    event: toStr(pick(row, "event_name", "event", "eventName")).toLowerCase(),
    eventType: toStr(pick(row, "event_type", "eventType", "type")).toLowerCase(),
    pageUrl: toStr(pick(row, "page_url", "pageUrl", "url", "path")),
    elementId: toStr(pick(row, "element_id", "elementId")),
    elementText: toStr(pick(row, "element_text", "elementText", "text")),
    x: toNum(pick(row, "x")),
    y: toNum(pick(row, "y")),
    direction: toStr(pick(row, "direction")).toLowerCase(),
    productId: toStr(pick(row, "product_id", "productId")),
    metadata: parseMeta(pick(row, "metadata", "metadata_json", "metadataJson", "meta")),
    userAgent: toStr(pick(row, "user_agent", "userAgent", "ua")),
    _seed: row._seed === true ? true : undefined,
  };
}

/** Defensive extraction of the rows array from whatever the endpoint returns. */
function parseRows(text: string): unknown[] {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    for (const key of ["rows", "events", "data", "telemetry", "items"]) {
      if (Array.isArray((data as Record<string, unknown>)?.[key])) {
        return (data as Record<string, unknown>)[key] as unknown[];
      }
    }
    return [];
  } catch {
    return [];
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Fetch
 * ────────────────────────────────────────────────────────────────────────── */

function toIso(v: Date | string | number | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  const p = Date.parse(v);
  return Number.isNaN(p) ? undefined : new Date(p).toISOString();
}

/**
 * Fetch + normalize live telemetry, with deterministic seed fallback.
 * Never throws — network/parse failures collapse into `{ error, seeded }`.
 */
export async function fetchEvents(cfg: AppConfig, opts: FetchOptions = {}): Promise<FetchResult> {
  const { since, limit = 5000, timeoutMs = 12000, seed = "auto" } = opts;

  if (seed === "only") {
    return { events: generateSeedEvents(), seeded: true, liveCount: 0 };
  }

  const params = new URLSearchParams({ action: "telemetry", limit: String(limit) });
  if (cfg.ecommerce_secret) params.set("secret", cfg.ecommerce_secret);
  const sinceIso = toIso(since);
  if (sinceIso) params.set("since", sinceIso);

  let live: TelemetryEvent[] = [];
  let error: string | undefined;
  try {
    const text = await httpGet(`${cfg.ecommerce_url}?${params.toString()}`, { timeoutMs });
    live = parseRows(text).map(normalizeEvent);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (live.length > 0) {
    // Apply `since` client-side too, in case the backend ignores it.
    const floor = sinceIso ? Date.parse(sinceIso) : 0;
    const events = floor ? live.filter((e) => e.ts >= floor) : live;
    return { events, seeded: false, liveCount: live.length, error };
  }

  if (seed === "never") {
    return { events: [], seeded: false, liveCount: 0, error };
  }
  return { events: generateSeedEvents(), seeded: true, liveCount: 0, error };
}

/* Convenience: plain array (seeded fallback), for callers that don't need meta. */
export async function fetchTelemetryEvents(
  cfg: AppConfig,
  opts: FetchOptions = {},
): Promise<TelemetryEvent[]> {
  return (await fetchEvents(cfg, opts)).events;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Classification helpers
 * ────────────────────────────────────────────────────────────────────────── */

export const isClick = (e: TelemetryEvent): boolean =>
  e.eventType === "click" || /click|tap|press/.test(e.event);

export const isScroll = (e: TelemetryEvent): boolean =>
  e.eventType === "scroll" || /scroll/.test(e.event);

export const isPageView = (e: TelemetryEvent): boolean =>
  /page_?view|pageview|visit|session_?start/.test(e.event) || e.eventType === "pageview";

export const isProductView = (e: TelemetryEvent): boolean =>
  /product_?view|view_?product|pdp/.test(e.event);

export const isOutage = (e: TelemetryEvent): boolean => e.event === "ai_outage";

/* ────────────────────────────────────────────────────────────────────────── *
 *  Generic aggregation primitives
 * ────────────────────────────────────────────────────────────────────────── */

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

/** Distinct count of a string field (blanks ignored). */
export function distinct(events: TelemetryEvent[], key: keyof TelemetryEvent): number {
  const set = new Set<string>();
  for (const e of events) {
    const v = e[key];
    if (typeof v === "string" && v) set.add(v);
    else if (typeof v === "number" && Number.isFinite(v)) set.add(String(v));
  }
  return set.size;
}

/** Count events grouped by an arbitrary key function; blanks dropped, desc order. */
export function countBy(
  events: TelemetryEvent[],
  keyFn: (e: TelemetryEvent) => string,
  labelFn?: (key: string) => string,
): Bucket[] {
  const map = new Map<string, number>();
  for (const e of events) {
    const k = keyFn(e);
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFn ? labelFn(key) : key, count }))
    .sort((a, b) => b.count - a.count);
}

export const byEvent = (events: TelemetryEvent[]): Bucket[] => countBy(events, (e) => e.event);

export const byProduct = (events: TelemetryEvent[]): Bucket[] =>
  countBy(
    events.filter((e) => e.productId),
    (e) => e.productId,
  );

/** Traffic by page — path only (strips origin + query) for readable labels. */
export const byPage = (events: TelemetryEvent[]): Bucket[] =>
  countBy(events, (e) => e.pageUrl, prettyPath);

export function prettyPath(url: string): string {
  if (!url) return "(unknown)";
  try {
    const u = new URL(url, "http://x");
    return u.pathname || "/";
  } catch {
    return url.split("?")[0] || url;
  }
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Time series
 * ────────────────────────────────────────────────────────────────────────── */

export type Granularity = "hour" | "day";

export interface TimePoint {
  /** Bucket start, epoch ms. */
  t: number;
  /** Human label (e.g. "Jul 14" or "14:00"). */
  label: string;
  /** Total events in the bucket. */
  count: number;
  /** Per-event-type breakdown (present when `splitBy` used). */
  [series: string]: number | string;
}

function bucketStart(ts: number, g: Granularity): number {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  if (g === "day") d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtBucket(t: number, g: Granularity): string {
  const d = new Date(t);
  if (g === "day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Events bucketed over time. When `series` is provided (a list of series
 * definitions), each bucket also carries a per-series count column, ready for a
 * recharts multi-line/stacked chart. Buckets with zero events are filled in so
 * lines are continuous.
 */
export function buildTimeSeries(
  events: TelemetryEvent[],
  granularity: Granularity = "day",
  series?: { key: string; match: (e: TelemetryEvent) => boolean }[],
): TimePoint[] {
  const withTs = events.filter((e) => e.ts > 0);
  if (withTs.length === 0) return [];

  const step = granularity === "day" ? 86_400_000 : 3_600_000;
  let min = Infinity;
  let max = -Infinity;
  for (const e of withTs) {
    const b = bucketStart(e.ts, granularity);
    if (b < min) min = b;
    if (b > max) max = b;
  }

  const points = new Map<number, TimePoint>();
  for (let t = min; t <= max; t += step) {
    const p: TimePoint = { t, label: fmtBucket(t, granularity), count: 0 };
    if (series) for (const s of series) p[s.key] = 0;
    points.set(t, p);
  }

  for (const e of withTs) {
    const b = bucketStart(e.ts, granularity);
    const p = points.get(b);
    if (!p) continue;
    p.count = (p.count as number) + 1;
    if (series) {
      for (const s of series) {
        if (s.match(e)) p[s.key] = (p[s.key] as number) + 1;
      }
    }
  }

  return [...points.values()].sort((a, b) => a.t - b.t);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Click density (x/y bins) — feeds the SVG heatmap
 * ────────────────────────────────────────────────────────────────────────── */

export interface DensityCell {
  gx: number; // grid column index
  gy: number; // grid row index
  count: number;
  /** 0..1 density normalized to the hottest cell. */
  intensity: number;
}

export interface DensityGrid {
  cols: number;
  rows: number;
  cells: DensityCell[];
  max: number;
  total: number;
  /** Reference viewport used for normalization (from metadata vw/vh or observed max). */
  vw: number;
  vh: number;
}

/**
 * Bin click coordinates into a `gridW × gridH` density grid, normalized to a
 * 0..1 [x,y] space. Prefers per-event `metadata.vw/vh` (true viewport) and
 * falls back to the observed max coordinate so raw-pixel data still maps sanely.
 */
export function clickDensity(
  events: TelemetryEvent[],
  opts: { pageUrl?: string; gridW?: number; gridH?: number } = {},
): DensityGrid {
  const { pageUrl, gridW = 24, gridH = 32 } = opts;

  let clicks = events.filter(isClick).filter((e) => Number.isFinite(e.x) && Number.isFinite(e.y));
  if (pageUrl) clicks = clicks.filter((e) => e.pageUrl === pageUrl || prettyPath(e.pageUrl) === pageUrl);

  // Determine normalization extents.
  let maxX = 0;
  let maxY = 0;
  let vwHint = 0;
  let vhHint = 0;
  for (const e of clicks) {
    if (e.x > maxX) maxX = e.x;
    if (e.y > maxY) maxY = e.y;
    const vw = toNum(e.metadata?.vw ?? e.metadata?.viewportWidth);
    const vh = toNum(e.metadata?.vh ?? e.metadata?.viewportHeight);
    if (Number.isFinite(vw) && vw > vwHint) vwHint = vw;
    if (Number.isFinite(vh) && vh > vhHint) vhHint = vh;
  }
  const vw = vwHint || maxX || 1;
  const vh = vhHint || maxY || 1;

  const grid = new Array(gridW * gridH).fill(0);
  let total = 0;
  for (const e of clicks) {
    const nx = Math.min(0.999, Math.max(0, e.x / vw));
    const ny = Math.min(0.999, Math.max(0, e.y / vh));
    const gx = Math.floor(nx * gridW);
    const gy = Math.floor(ny * gridH);
    grid[gy * gridW + gx] += 1;
    total += 1;
  }

  const max = grid.reduce((m, v) => (v > m ? v : m), 0);
  const cells: DensityCell[] = [];
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const count = grid[gy * gridW + gx];
      if (count > 0) cells.push({ gx, gy, count, intensity: max ? count / max : 0 });
    }
  }
  return { cols: gridW, rows: gridH, cells, max, total, vw, vh };
}

/** Rank clicked elements by count — feeds the "top elements" table. */
export interface ElementStat {
  elementId: string;
  elementText: string;
  count: number;
  pageUrl: string;
}

export function topElements(events: TelemetryEvent[], limit = 20): ElementStat[] {
  const map = new Map<string, ElementStat>();
  for (const e of events) {
    if (!isClick(e)) continue;
    const id = e.elementId || e.elementText;
    if (!id) continue;
    const key = `${id}::${prettyPath(e.pageUrl)}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else
      map.set(key, {
        elementId: e.elementId,
        elementText: e.elementText,
        count: 1,
        pageUrl: prettyPath(e.pageUrl),
      });
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Scroll depth
 * ────────────────────────────────────────────────────────────────────────── */

export interface ScrollBand {
  /** Lower bound of the 10% band, e.g. 0, 10, 20 … 90. */
  depth: number;
  label: string; // "0–10%"
  /** Distinct sessions that reached at least this depth. */
  sessions: number;
  /** Fraction of all scrolling sessions reaching at least this depth (0..1). */
  reach: number;
}

/** Pull a 0..100 scroll depth from an event (metadata.depth/scrollPercent or y-vs-height). */
function scrollDepthOf(e: TelemetryEvent): number | null {
  const md = e.metadata ?? {};
  for (const k of ["depth", "scrollPercent", "scroll_percent", "percent", "pct"]) {
    const v = toNum(md[k]);
    if (Number.isFinite(v)) return Math.max(0, Math.min(100, v));
  }
  const y = toNum(e.y);
  const h = toNum(md.docHeight ?? md.scrollHeight ?? md.pageHeight);
  const vh = toNum(md.vh ?? md.viewportHeight);
  if (Number.isFinite(y) && Number.isFinite(h) && h > 0) {
    const denom = h - (Number.isFinite(vh) ? vh : 0);
    if (denom > 0) return Math.max(0, Math.min(100, (y / denom) * 100));
  }
  return null;
}

/**
 * % of scrolling sessions reaching each 10% depth band (a monotonic ladder).
 * Also returns the average max-scroll across sessions and a "fold" callout.
 */
export interface ScrollDepthResult {
  bands: ScrollBand[];
  /** Distinct sessions that produced any scroll event. */
  sessions: number;
  /** Average of each session's maximum scroll depth (0..100). */
  avgMaxDepth: number;
  /** % of sessions that scrolled past the fold (>10%). */
  pastFold: number;
}

export function scrollBands(events: TelemetryEvent[]): ScrollDepthResult {
  const maxBySession = new Map<string, number>();
  for (const e of events) {
    if (!isScroll(e)) continue;
    const d = scrollDepthOf(e);
    if (d === null) continue;
    const sid = e.sessionId || e.anonymousId || "anon";
    maxBySession.set(sid, Math.max(maxBySession.get(sid) ?? 0, d));
  }

  const sessions = maxBySession.size;
  const maxima = [...maxBySession.values()];

  const bands: ScrollBand[] = [];
  for (let depth = 0; depth < 100; depth += 10) {
    const reached = maxima.filter((m) => m >= depth).length;
    bands.push({
      depth,
      label: `${depth}–${depth + 10}%`,
      sessions: reached,
      reach: sessions ? reached / sessions : 0,
    });
  }

  const avgMaxDepth = sessions ? maxima.reduce((a, b) => a + b, 0) / sessions : 0;
  const pastFold = sessions ? maxima.filter((m) => m > 10).length / sessions : 0;

  return { bands, sessions, avgMaxDepth, pastFold };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Funnel
 * ────────────────────────────────────────────────────────────────────────── */

export const FUNNEL_MATCHERS: { key: string; label: string; test: (e: string) => boolean }[] = [
  { key: "view", label: "Page views", test: (e) => /page_?view|visit|session_?start/.test(e) },
  { key: "product", label: "Product views", test: (e) => /product_?view|view_?product|pdp/.test(e) },
  { key: "cart", label: "Add to cart", test: (e) => /add_?to_?cart|cart_?add/.test(e) },
  { key: "checkout", label: "Checkout", test: (e) => /checkout|begin_?checkout/.test(e) },
  { key: "order", label: "Orders", test: (e) => /^order$|purchase|order_?placed|order_?created/.test(e) },
];

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  /** Fraction of the FIRST stage (overall conversion to this step). */
  rateOfFirst: number;
  /** Fraction retained from the PREVIOUS step (step-to-step conversion). */
  rateOfPrev: number;
  /** Fraction lost from the previous step (1 - rateOfPrev). */
  dropFromPrev: number;
  /** Absolute count dropped since the previous step. */
  droppedCount: number;
}

/** Build the 5-stage funnel with step-to-step drop-off. Optionally scope to a product. */
export function buildFunnel(events: TelemetryEvent[], productId?: string): FunnelStep[] {
  const scoped = productId ? events.filter((e) => e.productId === productId) : events;
  const counts = FUNNEL_MATCHERS.map(() => 0);
  for (const ev of scoped) {
    const name = ev.event || ev.eventType;
    if (!name) continue;
    FUNNEL_MATCHERS.forEach((m, i) => {
      if (m.test(name)) counts[i]++;
    });
  }
  const first = counts[0] || 1;
  return FUNNEL_MATCHERS.map((m, i) => {
    const prev = i === 0 ? counts[i] : counts[i - 1];
    const rateOfPrev = prev ? counts[i] / prev : 0;
    return {
      key: m.key,
      label: m.label,
      count: counts[i],
      rateOfFirst: counts[i] / first,
      rateOfPrev,
      dropFromPrev: i === 0 ? 0 : 1 - rateOfPrev,
      droppedCount: i === 0 ? 0 : Math.max(0, prev - counts[i]),
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  KPIs
 * ────────────────────────────────────────────────────────────────────────── */

export interface Kpis {
  sessions: number;
  visitors: number; // distinct anonymousId
  pageviews: number;
  productViews: number;
  addToCarts: number;
  checkouts: number;
  orders: number;
  /** Overall conversion rate (orders / sessions), 0..1. */
  cvr: number;
  /** Active AI outages (distinct services with an ai_outage event). */
  activeOutages: number;
  totalEvents: number;
}

export function computeKpis(events: TelemetryEvent[]): Kpis {
  let pageviews = 0;
  let productViews = 0;
  let addToCarts = 0;
  let checkouts = 0;
  let orders = 0;
  const outageServices = new Set<string>();

  for (const e of events) {
    const n = e.event;
    if (FUNNEL_MATCHERS[0].test(n)) pageviews++;
    if (FUNNEL_MATCHERS[1].test(n)) productViews++;
    if (FUNNEL_MATCHERS[2].test(n)) addToCarts++;
    if (FUNNEL_MATCHERS[3].test(n)) checkouts++;
    if (FUNNEL_MATCHERS[4].test(n)) orders++;
    if (n === "ai_outage") outageServices.add(toStr(e.metadata?.service, "unknown"));
  }

  const sessions = distinct(events, "sessionId");
  return {
    sessions,
    visitors: distinct(events, "anonymousId"),
    pageviews,
    productViews,
    addToCarts,
    checkouts,
    orders,
    cvr: sessions ? orders / sessions : 0,
    activeOutages: outageServices.size,
    totalEvents: events.length,
  };
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Cohort retention
 * ────────────────────────────────────────────────────────────────────────── */

export interface CohortRow {
  /** First-seen day label, e.g. "Jul 08". */
  cohort: string;
  cohortDay: number; // epoch ms of day start
  size: number; // sessions first seen that day
  /** returns[d] = sessions from this cohort seen again `d` days later (d≥1). */
  returns: number[];
}

/**
 * Group sessions by first-seen day, then count how many of each cohort's
 * sessions reappear (a session with events) on subsequent days. Returns up to
 * `maxDays` follow-up columns.
 */
export function buildCohorts(events: TelemetryEvent[], maxDays = 7): CohortRow[] {
  const dayMs = 86_400_000;
  const dayStart = (ts: number) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  // Per session: the set of active days.
  const sessionDays = new Map<string, Set<number>>();
  for (const e of events) {
    if (e.ts <= 0) continue;
    const sid = e.sessionId || e.anonymousId;
    if (!sid) continue;
    const day = dayStart(e.ts);
    let set = sessionDays.get(sid);
    if (!set) sessionDays.set(sid, (set = new Set()));
    set.add(day);
  }

  // Bucket sessions by their first day.
  const cohorts = new Map<number, string[]>();
  for (const [sid, days] of sessionDays) {
    const first = Math.min(...days);
    let arr = cohorts.get(first);
    if (!arr) cohorts.set(first, (arr = []));
    arr.push(sid);
  }

  const rows: CohortRow[] = [];
  for (const [cohortDay, sids] of [...cohorts.entries()].sort((a, b) => a[0] - b[0])) {
    const returns = new Array(maxDays).fill(0);
    for (const sid of sids) {
      const days = sessionDays.get(sid)!;
      for (let d = 1; d <= maxDays; d++) {
        if (days.has(cohortDay + d * dayMs)) returns[d - 1] += 1;
      }
    }
    rows.push({
      cohort: new Date(cohortDay).toLocaleDateString("en-US", { month: "short", day: "2-digit" }),
      cohortDay,
      size: sids.length,
      returns,
    });
  }
  return rows;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Outage helpers (typed, mirrors legacy analytics.ts for continuity)
 * ────────────────────────────────────────────────────────────────────────── */

export interface OutageEvent {
  timestamp: string;
  ts: number;
  service: string;
  feature: string;
  error: string;
  sessionId: string;
}

export function extractOutages(events: TelemetryEvent[]): OutageEvent[] {
  return events
    .filter(isOutage)
    .map((e) => ({
      timestamp: e.timestamp,
      ts: e.ts,
      service: toStr(e.metadata?.service, "unknown"),
      feature: toStr(e.metadata?.feature, "unknown"),
      error: toStr(e.metadata?.error),
      sessionId: e.sessionId,
    }))
    .sort((a, b) => b.ts - a.ts);
}

export function outagesByService(outages: OutageEvent[]): Bucket[] {
  const map = new Map<string, number>();
  for (const o of outages) map.set(o.service, (map.get(o.service) ?? 0) + 1);
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);
}

/* ────────────────────────────────────────────────────────────────────────── *
 *  Deterministic seed generator
 * ────────────────────────────────────────────────────────────────────────── */

/** mulberry32 — tiny deterministic PRNG. Same seed → identical stream. */
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

const SEED_STORE = "DSM";
const SEED_PAGES = [
  { path: "/", weight: 40 },
  { path: "/products", weight: 22 },
  { path: "/pricing", weight: 12 },
  { path: "/ai-lab", weight: 8 },
  { path: "/products/dsm", weight: 6, product: "dsm" },
  { path: "/products/virtual-sizing", weight: 5, product: "virtual-sizing" },
  { path: "/products/virtual-try-on", weight: 4, product: "virtual-try-on" },
  { path: "/products/pointblank", weight: 3, product: "pointblank" },
];
const SEED_PRODUCTS = [
  "dsm",
  "virtual-sizing",
  "virtual-try-on",
  "pointblank",
  "vpo",
  "techrealm",
];
const SEED_ELEMENTS = [
  { id: "cta-get-quote", text: "Get My Quote", x: 0.5, y: 0.32 },
  { id: "nav-products", text: "Products", x: 0.28, y: 0.04 },
  { id: "nav-pricing", text: "Pricing", x: 0.4, y: 0.04 },
  { id: "product-card", text: "View product", x: 0.33, y: 0.55 },
  { id: "add-to-cart-btn", text: "Add to cart", x: 0.72, y: 0.48 },
  { id: "checkout-btn", text: "Checkout", x: 0.8, y: 0.62 },
  { id: "concierge-fab", text: "Chat", x: 0.94, y: 0.92 },
  { id: "compare-btn", text: "Compare & Recommend", x: 0.62, y: 0.7 },
  { id: "footer-callback", text: "Book a call", x: 0.5, y: 0.96 },
];
const SEED_OUTAGE_SERVICES = [
  { service: "codex-proxy", feature: "sales-concierge", error: "timeout after 2500ms" },
  { service: "simli", feature: "talking-advisor", error: "startAudioToVideoSession 500" },
  { service: "vps", feature: "smart-search", error: "ECONNREFUSED localhost:5051" },
];
const SEED_UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E Safari/604.1",
];
const SEED_VIEWPORTS = [
  { vw: 1440, vh: 900 },
  { vw: 1920, vh: 1080 },
  { vw: 390, vh: 844 },
];

const weightedPick = <T extends { weight: number }>(rnd: () => number, items: T[]): T => {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rnd() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
};

const jitter = (rnd: () => number, center: number, spread: number): number =>
  Math.max(0, Math.min(1, center + (rnd() - 0.5) * spread));

/**
 * Deterministic, realistic telemetry seed — a funnel-shaped stream of sessions
 * across the DSM site. Same `seed` always yields the same events. Every row is
 * flagged `_seed: true`. Target volume 500–700 events (tune via `opts.target`).
 */
export function generateSeedEvents(
  opts: { seed?: number; target?: number; days?: number; now?: number } = {},
): TelemetryEvent[] {
  const { seed = 1337, target = 600, days = 14, now = Date.UTC(2026, 6, 15, 12, 0, 0) } = opts;
  const rnd = mulberry32(seed);
  const out: TelemetryEvent[] = [];
  const windowMs = days * 86_400_000;

  let sessionSeq = 0;
  let visitorSeq = 0;
  const visitors: string[] = [];

  const push = (
    ts: number,
    session: string,
    anon: string,
    ev: string,
    type: string,
    page: string,
    extra: Partial<TelemetryEvent> = {},
  ) => {
    const iso = new Date(ts).toISOString();
    const parsed = Date.parse(iso);
    out.push({
      timestamp: iso,
      ts: parsed,
      storeName: SEED_STORE,
      sessionId: session,
      anonymousId: anon,
      userId: "",
      event: ev,
      eventType: type,
      pageUrl: `https://dsm.example${page}`,
      elementId: "",
      elementText: "",
      x: NaN,
      y: NaN,
      direction: "",
      productId: "",
      metadata: {},
      userAgent: SEED_UAS[Math.floor(rnd() * SEED_UAS.length)],
      _seed: true,
      ...extra,
    });
  };

  while (out.length < target) {
    // Some visitors return (retention/cohort signal); ~25% reuse.
    let anon: string;
    if (visitors.length > 0 && rnd() < 0.25) {
      anon = visitors[Math.floor(rnd() * visitors.length)];
    } else {
      anon = `anon_${(visitorSeq++).toString(36).padStart(4, "0")}`;
      visitors.push(anon);
    }
    const session = `sess_${(sessionSeq++).toString(36).padStart(5, "0")}`;
    const vp = SEED_VIEWPORTS[Math.floor(rnd() * SEED_VIEWPORTS.length)];

    // Session start time somewhere in the window (weight recent days slightly).
    const dayBias = Math.pow(rnd(), 0.7); // skew toward recent
    let t = now - windowMs + dayBias * windowMs + rnd() * 3_600_000;

    const landing = weightedPick(rnd, SEED_PAGES);
    push(t, session, anon, "page_view", "pageview", landing.path, {
      metadata: { referrer: rnd() < 0.5 ? "google" : "direct", vw: vp.vw, vh: vp.vh },
    });

    // Scroll behaviour on landing — bounded max depth per session.
    const maxDepth = 10 + Math.floor(Math.pow(rnd(), 1.3) * 90);
    for (let d = 10; d <= maxDepth; d += 10) {
      t += 400 + rnd() * 5000;
      push(t, session, anon, "scroll", "scroll", landing.path, {
        direction: "down",
        y: Math.round((d / 100) * (vp.vh * 6)),
        metadata: { depth: d, vh: vp.vh, docHeight: vp.vh * 6 },
      });
    }

    // A few clicks on hot elements.
    const clickCount = 1 + Math.floor(rnd() * 3);
    for (let c = 0; c < clickCount; c++) {
      t += 500 + rnd() * 4000;
      const el = SEED_ELEMENTS[Math.floor(rnd() * SEED_ELEMENTS.length)];
      push(t, session, anon, "click", "click", landing.path, {
        elementId: el.id,
        elementText: el.text,
        x: Math.round(jitter(rnd, el.x, 0.06) * vp.vw),
        y: Math.round(jitter(rnd, el.y, 0.06) * vp.vh),
        metadata: { vw: vp.vw, vh: vp.vh },
      });
    }

    // Funnel progression with realistic decay.
    if (rnd() < 0.55) {
      const product = landing.product ?? SEED_PRODUCTS[Math.floor(rnd() * SEED_PRODUCTS.length)];
      const ppath = `/products/${product}`;
      t += 1000 + rnd() * 8000;
      push(t, session, anon, "product_view", "pageview", ppath, {
        productId: product,
        metadata: { vw: vp.vw, vh: vp.vh },
      });

      // clicks on the product page too
      if (rnd() < 0.6) {
        t += 800 + rnd() * 4000;
        const el = SEED_ELEMENTS.find((e) => e.id === "add-to-cart-btn")!;
        push(t, session, anon, "click", "click", ppath, {
          elementId: el.id,
          elementText: el.text,
          productId: product,
          x: Math.round(jitter(rnd, el.x, 0.05) * vp.vw),
          y: Math.round(jitter(rnd, el.y, 0.05) * vp.vh),
          metadata: { vw: vp.vw, vh: vp.vh },
        });
      }

      if (rnd() < 0.42) {
        t += 1500 + rnd() * 6000;
        push(t, session, anon, "add_to_cart", "action", ppath, {
          productId: product,
          metadata: { qty: 1 + Math.floor(rnd() * 3), price: 199 + Math.floor(rnd() * 800) },
        });

        if (rnd() < 0.55) {
          t += 2000 + rnd() * 9000;
          push(t, session, anon, "begin_checkout", "action", "/checkout", {
            productId: product,
            metadata: { vw: vp.vw, vh: vp.vh },
          });

          if (rnd() < 0.6) {
            t += 3000 + rnd() * 12000;
            push(t, session, anon, "order", "conversion", "/checkout", {
              productId: product,
              metadata: {
                orderId: `ord_${Math.floor(rnd() * 1e6)}`,
                value: 199 + Math.floor(rnd() * 1200),
                currency: "USD",
              },
            });
          }
        }
      }
    }

    // Occasional AI outage during the session (~7%).
    if (rnd() < 0.07) {
      const o = SEED_OUTAGE_SERVICES[Math.floor(rnd() * SEED_OUTAGE_SERVICES.length)];
      t += 500 + rnd() * 3000;
      push(t, session, anon, "ai_outage", "error", landing.path, {
        metadata: { service: o.service, feature: o.feature, error: o.error },
      });
    }
  }

  // Stable chronological order.
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
