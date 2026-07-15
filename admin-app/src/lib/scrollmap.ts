/**
 * Derives a per-page scroll-depth map from raw telemetry.
 *
 * A "scroll-depth map" answers: of the sessions that opened a page, what
 * fraction scrolled far enough to see each depth band (0% = top of page,
 * 100% = bottom). The reach curve is cumulative and monotonically
 * non-increasing as you travel down the fold.
 *
 * The Telemetry sheet's exact scroll shape isn't guaranteed, so depth is
 * extracted defensively from several plausible encodings (an explicit
 * percentage in metadata, a 0–1 progress fraction, or raw scroll/height
 * pixels) and a page-visit is counted from ANY event carrying that pageUrl —
 * so a session that never scrolled still counts as "reached the top."
 */
import type { TelemetryEvent } from "./ecommerce";

export interface DepthBand {
  /** Depth from the top of the page, 0–100 (%). */
  depth: number;
  /** % of the page's sessions whose max scroll reached at least `depth`. */
  reach: number;
  /** Absolute count behind `reach`. */
  sessions: number;
}

export interface PageScroll {
  /** Normalized path (pageUrl without origin / query / hash). */
  page: string;
  /** A representative full URL for the page (first one seen). */
  url: string;
  /** Distinct sessions that opened the page. */
  sessions: number;
  /** Distinct sessions that emitted any usable scroll signal (> 0% depth). */
  scrollSessions: number;
  /** Mean of each session's deepest scroll (%). */
  avgDepth: number;
  /** Median of each session's deepest scroll (%). */
  medianDepth: number;
  /** Average first-viewport as a % of doc height, if telemetry carries it. */
  foldDepth: number | null;
  /** The cumulative reach curve, depth 0..100 at `bandStep` resolution. */
  bands: DepthBand[];
  /** Deepest band still reached by >= 75% / 50% / 25% of sessions (%). */
  reach75: number;
  reach50: number;
  reach25: number;
}

export interface ScrollMapOptions {
  /** Resolution of the reach curve, in % (default 5). */
  bandStep?: number;
}

const SCROLL_RE = /scroll|depth|reach|fold/i;

const PCT_KEYS = [
  "depth",
  "scrollDepth",
  "scrolldepth",
  "depthPercent",
  "scrollPercent",
  "scrollPct",
  "percent",
  "pct",
  "progress",
  "scroll",
  "maxDepth",
  "maxScroll",
];
const SCROLL_Y_KEYS = ["scrollY", "scrollTop", "scrolly", "offset", "offsetY", "y"];
const DOC_H_KEYS = ["docHeight", "documentHeight", "scrollHeight", "pageHeight", "contentHeight"];
const VIEW_H_KEYS = ["viewportHeight", "innerHeight", "windowHeight", "clientHeight", "viewHeight"];

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v.replace(/[%px\s]/gi, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstNum(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    if (k in obj) {
      const n = asNumber(obj[k]);
      if (n != null) return n;
    }
  }
  return null;
}

/** Coerce any depth signal into a clamped 0–100 percentage. */
function clampPct(n: number): number {
  // 0–1 values are treated as progress fractions (0.5 -> 50%).
  if (n > 0 && n <= 1) n *= 100;
  return Math.max(0, Math.min(100, n));
}

function meta(e: TelemetryEvent): Record<string, unknown> {
  return typeof e.metadata === "object" && e.metadata
    ? (e.metadata as Record<string, unknown>)
    : {};
}

/**
 * Best-effort max-scroll depth (%) for a single event, or null if the event
 * carries no scroll signal.
 */
export function extractScrollDepth(e: TelemetryEvent): number | null {
  const m = meta(e);

  // 1. Explicit percentage / progress in metadata.
  const pct = firstNum(m, PCT_KEYS);
  if (pct != null) return clampPct(pct);

  // 2. Pixel geometry -> (scrolled + viewport) / document height.
  const scrollY = firstNum(m, SCROLL_Y_KEYS) ?? asNumber(e.y);
  const docH = firstNum(m, DOC_H_KEYS);
  if (scrollY != null && docH && docH > 0) {
    const viewH = firstNum(m, VIEW_H_KEYS) ?? 0;
    return clampPct(((scrollY + viewH) / docH) * 100);
  }

  // 3. Named scroll event whose `y` already looks like a percentage.
  const name = `${e.event ?? ""} ${e.eventType ?? ""}`;
  if (SCROLL_RE.test(name)) {
    const y = asNumber(e.y);
    if (y != null && y >= 0 && y <= 100) return y;
  }
  return null;
}

/** Average first-viewport as a % of document height, if both are present. */
function extractFold(e: TelemetryEvent): number | null {
  const m = meta(e);
  const viewH = firstNum(m, VIEW_H_KEYS);
  const docH = firstNum(m, DOC_H_KEYS);
  if (viewH && docH && docH > 0) return clampPct((viewH / docH) * 100);
  return null;
}

/** Strip origin, query and hash so `/pricing?x=1#top` groups with `/pricing`. */
export function normalizePath(pageUrl: string | undefined): string | null {
  if (!pageUrl) return null;
  const raw = String(pageUrl).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw, "http://x");
    let p = u.pathname || "/";
    if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
    return p;
  } catch {
    return raw.split(/[?#]/)[0] || "/";
  }
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Deepest band still reached by at least `target`% of sessions. */
function reachThreshold(bands: DepthBand[], target: number): number {
  let deepest = 0;
  for (const b of bands) if (b.reach >= target) deepest = b.depth;
  return deepest;
}

interface PageAgg {
  url: string;
  maxBySession: Map<string, number>;
  foldSum: number;
  foldN: number;
}

export function buildScrollMap(
  events: TelemetryEvent[],
  opts: ScrollMapOptions = {},
): PageScroll[] {
  const step = Math.max(1, Math.min(50, opts.bandStep ?? 5));
  const pages = new Map<string, PageAgg>();

  for (const e of events) {
    const path = normalizePath(e.pageUrl);
    if (!path) continue;
    const sid = String(e.sessionId || e.anonymousId || "(anon)");

    let p = pages.get(path);
    if (!p) {
      p = { url: String(e.pageUrl), maxBySession: new Map(), foldSum: 0, foldN: 0 };
      pages.set(path, p);
    }
    if (!p.maxBySession.has(sid)) p.maxBySession.set(sid, 0);

    const depth = extractScrollDepth(e);
    if (depth != null && depth > (p.maxBySession.get(sid) as number)) {
      p.maxBySession.set(sid, depth);
    }
    const fold = extractFold(e);
    if (fold != null) {
      p.foldSum += fold;
      p.foldN++;
    }
  }

  const out: PageScroll[] = [];
  for (const [page, agg] of pages) {
    const maxima = [...agg.maxBySession.values()];
    const total = maxima.length;
    if (total === 0) continue;

    const bands: DepthBand[] = [];
    for (let d = 0; d <= 100; d += step) {
      const n = maxima.reduce((acc, m) => acc + (m >= d ? 1 : 0), 0);
      bands.push({ depth: d, reach: (n / total) * 100, sessions: n });
    }

    const avgDepth = maxima.reduce((a, b) => a + b, 0) / total;
    out.push({
      page,
      url: agg.url,
      sessions: total,
      scrollSessions: maxima.filter((m) => m > 0).length,
      avgDepth,
      medianDepth: median(maxima),
      foldDepth: agg.foldN > 0 ? agg.foldSum / agg.foldN : null,
      bands,
      reach75: reachThreshold(bands, 75),
      reach50: reachThreshold(bands, 50),
      reach25: reachThreshold(bands, 25),
    });
  }

  return out.sort((a, b) => b.sessions - a.sessions);
}
