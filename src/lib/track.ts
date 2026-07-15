/**
 * track.ts — site-wide passive analytics capture layer.
 * ----------------------------------------------------------------------------
 * Auto-instruments the whole SPA and streams behavioural telemetry to the
 * STABLE Ecommerce Apps Script sink. It is a thin DOM layer on top of the
 * existing fire-and-forget transport in `stable/analytics.ts` (no-cors,
 * keepalive, offline-queued) — this file adds NO new network code, it only
 * decides *what* to observe and *when* to emit.
 *
 * Captured signals (see EVENT SCHEMA at the bottom of this file):
 *   1. page_view      — initial load + every SPA route change.
 *   2. click          — pointer position as % of viewport + element identity.
 *   3. scroll_depth    — 25/50/75/100 % milestones as they are first reached.
 *   4. scroll_summary — max depth + dwell(ms) per quarter band, on page leave.
 *   5. attention      — cursor dwell heatmap: ms spent per viewport grid cell,
 *                       flushed on an interval and on page leave ("LOOK").
 *
 * Everything is throttled, passive, and best-effort. It never awaits, never
 * throws into the page, and honours a per-element `data-no-track` opt-out and
 * form-field privacy (no input/password text is ever read).
 *
 * The STABLE sink is the only backend this depends on (resilience contract):
 * if the network is down the underlying `track()` parks events in the offline
 * queue and flushes them on reconnect.
 */

import { track } from '@/lib/stable/analytics';

// ── Tunables ─────────────────────────────────────────────────────────────────

/** Viewport is binned into GRID×GRID cells for the attention heatmap. */
const GRID = 20; // 20×20 = 5% × 5% cells
/** Minimum ms the cursor must rest in a cell before it counts (de-jitter). */
const ATTENTION_SAMPLE_MS = 120;
/** How often the accumulated attention grid is flushed to the sink. */
const ATTENTION_FLUSH_MS = 12_000;
/** Scroll handler throttle. */
const SCROLL_THROTTLE_MS = 200;
/** Longest element text we ever transmit. */
const MAX_TEXT = 80;
/** Scroll-depth milestones (percent) we emit the first time each is reached. */
const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

// ── Module state (single init guard) ─────────────────────────────────────────

let started = false;

interface PageState {
  /** Deepest scroll percentage reached on the current page. */
  maxDepth: number;
  /** Next un-emitted milestone index. */
  nextMilestone: number;
  /** Accumulated dwell (ms) per quarter band [0-25,25-50,50-75,75-100]. */
  bandDwell: [number, number, number, number];
  /** Timestamp we last attributed scroll dwell from. */
  lastBandTs: number;
  /** Accumulated cursor dwell (ms) keyed "col,row". */
  attention: Map<string, number>;
  /** Last mousemove sample: cell key + timestamp. */
  lastCell: string | null;
  lastCellTs: number;
  /** pageUrl this state belongs to (guards late async emits after nav). */
  url: string;
}

let page: PageState = freshPage();

function freshPage(): PageState {
  const now = nowMs();
  return {
    maxDepth: 0,
    nextMilestone: 0,
    bandDwell: [0, 0, 0, 0],
    lastBandTs: now,
    attention: new Map(),
    lastCell: null,
    lastCellTs: now,
    url: typeof location !== 'undefined' ? location.href : '',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** Round to 1 decimal for compact percentages. */
function pct(n: number): number {
  return Math.round(n * 10) / 10;
}

function viewport(): { w: number; h: number } {
  return {
    w: Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1),
    h: Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1),
  };
}

/** Current scroll depth as a 0-100 percentage of scrollable height. */
function scrollDepthPct(): number {
  const doc = document.documentElement;
  const scrollTop = window.scrollY || doc.scrollTop || 0;
  const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
  return Math.min(100, Math.max(0, (scrollTop / scrollable) * 100));
}

/** Which quarter band [0..3] a percentage falls into. */
function bandOf(percent: number): number {
  if (percent >= 75) return 3;
  if (percent >= 50) return 2;
  if (percent >= 25) return 1;
  return 0;
}

/**
 * Nearest stable identifier for a clicked element:
 *   data-track-id > id > data-testid > aria-label > tag.class.
 */
function elementIdOf(el: Element | null): string | undefined {
  let node: Element | null = el;
  for (let i = 0; node && i < 5; i++, node = node.parentElement) {
    const t = node.getAttribute?.('data-track-id') || node.id;
    if (t) return t;
  }
  if (!el) return undefined;
  const testid = el.getAttribute?.('data-testid') || el.getAttribute?.('aria-label');
  if (testid) return testid;
  const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '';
  return `${el.tagName?.toLowerCase() || 'node'}${cls}`;
}

/** Product id from the closest [data-product-id] ancestor, if any. */
function productIdOf(el: Element | null): string | undefined {
  const host = el?.closest?.('[data-product-id]') as HTMLElement | null;
  return host?.dataset?.productId || undefined;
}

/**
 * Safe, truncated visible text for a clicked element. Never reads form-field
 * values (privacy) and never returns password/input content.
 */
function safeTextOf(el: Element | null): string | undefined {
  if (!el) return undefined;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return undefined;
  const raw = (el as HTMLElement).innerText || el.textContent || '';
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) {
    // Fall back to an accessible label for icon-only controls.
    const label = el.getAttribute?.('aria-label') || el.getAttribute?.('title');
    return label ? label.slice(0, MAX_TEXT) : undefined;
  }
  return text.slice(0, MAX_TEXT);
}

/** True when the element (or an ancestor) opts out of tracking. */
function isOptedOut(el: Element | null): boolean {
  return !!el?.closest?.('[data-no-track]');
}

// ── 1. Page views ────────────────────────────────────────────────────────────

function emitPageView(): void {
  const { w, h } = viewport();
  track({
    event: 'page_view',
    eventType: 'page',
    pageUrl: location.href,
    metadata: {
      title: document.title,
      referrer: document.referrer || undefined,
      path: location.pathname + location.search,
      viewportW: w,
      viewportH: h,
      dpr: window.devicePixelRatio || 1,
      lang: navigator.language,
    },
  });
}

// ── 2. Clicks ────────────────────────────────────────────────────────────────

function onClick(e: MouseEvent): void {
  const target = e.target as Element | null;
  if (isOptedOut(target)) return;

  const { w, h } = viewport();
  const anchor = target?.closest?.('a') as HTMLAnchorElement | null;

  track({
    event: 'click',
    eventType: 'click',
    pageUrl: location.href,
    elementId: elementIdOf(target),
    elementText: safeTextOf(target),
    productId: productIdOf(target),
    // Position as a percentage of the viewport (resolution-independent heatmap).
    x: pct((e.clientX / w) * 100),
    y: pct((e.clientY / h) * 100),
    metadata: {
      tag: target?.tagName?.toLowerCase(),
      href: anchor?.getAttribute('href') || undefined,
      button: e.button,
      rawX: Math.round(e.clientX),
      rawY: Math.round(e.clientY),
    },
  });
}

// ── 3. Scroll depth + dwell ──────────────────────────────────────────────────

let scrollScheduled = false;

function attributeBandDwell(): void {
  const now = nowMs();
  const band = bandOf(scrollDepthPct());
  page.bandDwell[band] += now - page.lastBandTs;
  page.lastBandTs = now;
}

function onScroll(): void {
  if (scrollScheduled) return;
  scrollScheduled = true;
  window.setTimeout(() => {
    scrollScheduled = false;
    attributeBandDwell();

    const depth = scrollDepthPct();
    if (depth > page.maxDepth) page.maxDepth = depth;

    // Emit each milestone the first time the max crosses it.
    while (
      page.nextMilestone < SCROLL_MILESTONES.length &&
      page.maxDepth >= SCROLL_MILESTONES[page.nextMilestone]
    ) {
      const milestone = SCROLL_MILESTONES[page.nextMilestone];
      track({
        event: 'scroll_depth',
        eventType: 'scroll',
        pageUrl: page.url,
        direction: 'down',
        metadata: { milestone, maxPercent: pct(page.maxDepth) },
      });
      page.nextMilestone++;
    }
  }, SCROLL_THROTTLE_MS);
}

function emitScrollSummary(): void {
  attributeBandDwell();
  const [b0, b1, b2, b3] = page.bandDwell;
  // Skip near-empty summaries (bounce with no engagement).
  if (page.maxDepth <= 0 && b0 + b1 + b2 + b3 < 250) return;
  track({
    event: 'scroll_summary',
    eventType: 'scroll',
    pageUrl: page.url,
    metadata: {
      maxPercent: pct(page.maxDepth),
      dwellMs: { b0_25: Math.round(b0), b25_50: Math.round(b1), b50_75: Math.round(b2), b75_100: Math.round(b3) },
    },
  });
}

// ── 4. Attention heatmap ("LOOK") ────────────────────────────────────────────

function cellKey(clientX: number, clientY: number): string {
  const { w, h } = viewport();
  const col = Math.min(GRID - 1, Math.max(0, Math.floor((clientX / w) * GRID)));
  const row = Math.min(GRID - 1, Math.max(0, Math.floor((clientY / h) * GRID)));
  return `${col},${row}`;
}

function onMouseMove(e: MouseEvent): void {
  const now = nowMs();
  const key = cellKey(e.clientX, e.clientY);

  // Attribute the time the cursor rested in the *previous* cell.
  if (page.lastCell !== null) {
    const dt = now - page.lastCellTs;
    if (dt >= ATTENTION_SAMPLE_MS) {
      // Cap a single dwell chunk so an idle tab can't dump minutes into one cell.
      page.attention.set(page.lastCell, (page.attention.get(page.lastCell) || 0) + Math.min(dt, 4000));
    }
  }
  page.lastCell = key;
  page.lastCellTs = now;
}

function flushAttention(final = false): void {
  // Settle the current cell before flushing.
  if (page.lastCell !== null) {
    const dt = nowMs() - page.lastCellTs;
    if (dt >= ATTENTION_SAMPLE_MS) {
      page.attention.set(page.lastCell, (page.attention.get(page.lastCell) || 0) + Math.min(dt, 4000));
    }
    page.lastCellTs = nowMs();
  }
  if (page.attention.size === 0) return;

  // Compact { "col,row": ms } map, rounded, only non-zero cells.
  const grid: Record<string, number> = {};
  for (const [k, v] of page.attention) {
    const ms = Math.round(v);
    if (ms > 0) grid[k] = ms;
  }
  page.attention.clear();
  if (Object.keys(grid).length === 0) return;

  track({
    event: 'attention',
    eventType: 'custom',
    pageUrl: page.url,
    metadata: { grid, cols: GRID, rows: GRID, unit: 'ms', final },
  });
}

let attentionTimer: number | undefined;

// ── SPA navigation handling ──────────────────────────────────────────────────

function onNavigate(): void {
  if (location.href === page.url) return; // hash-only / no-op
  // Close out the page we are leaving, then start fresh.
  emitScrollSummary();
  flushAttention(true);
  page = freshPage();
  emitPageView();
}

/** Patch history so client-side route changes fire onNavigate. */
function hookHistory(): void {
  const patch = (name: 'pushState' | 'replaceState') => {
    const orig = history[name];
    history[name] = function (this: History, ...args: Parameters<History['pushState']>) {
      const ret = orig.apply(this, args);
      // Defer so location has already updated.
      window.setTimeout(onNavigate, 0);
      return ret;
    };
  };
  patch('pushState');
  patch('replaceState');
  window.addEventListener('popstate', () => window.setTimeout(onNavigate, 0));
}

// ── Page-leave / visibility flushing ─────────────────────────────────────────

function onHide(): void {
  emitScrollSummary();
  flushAttention(true);
  // Reset dwell accounting so a return to the tab doesn't double-count the
  // hidden gap. maxDepth and milestone progress are intentionally preserved.
  page.bandDwell = [0, 0, 0, 0];
  page.lastBandTs = nowMs();
}

function onVisibility(): void {
  if (document.visibilityState === 'hidden') onHide();
  else page.lastBandTs = nowMs(); // resume dwell clock on return
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the site-wide tracker. Idempotent — safe to call from React StrictMode
 * (which mounts effects twice) or multiple entry points. Returns a cleanup
 * function that detaches all listeners.
 */
export function initTracker(): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;

  page = freshPage();
  emitPageView();

  // Listeners are passive/capture as appropriate and all best-effort.
  document.addEventListener('click', onClick, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onHide);
  hookHistory();

  attentionTimer = window.setInterval(() => flushAttention(false), ATTENTION_FLUSH_MS);

  return () => {
    document.removeEventListener('click', onClick, { capture: true } as EventListenerOptions);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onHide);
    if (attentionTimer) window.clearInterval(attentionTimer);
    started = false;
  };
}

export default initTracker;

/* ───────────────────────────────────────────────────────────────────────────
 * EVENT SCHEMA (POST type:"telemetry" to the Ecommerce Apps Script)
 * Envelope added by stable/analytics.ts on every event:
 *   { type:"telemetry", storeName, sessionId, anonymousId, userAgent, pageUrl }
 *
 * event="page_view"     eventType="page"
 *   metadata: { title, referrer?, path, viewportW, viewportH, dpr, lang }
 *
 * event="click"         eventType="click"
 *   x, y            → pointer position as % of viewport (0-100, 1 dp)
 *   elementId       → data-track-id | id | data-testid | aria-label | tag.class
 *   elementText     → visible text, ≤80 chars (never form-field values)
 *   productId       → closest [data-product-id]
 *   metadata: { tag, href?, button, rawX, rawY }
 *
 * event="scroll_depth"  eventType="scroll"   (emitted once per milestone)
 *   direction="down"
 *   metadata: { milestone: 25|50|75|100, maxPercent }
 *
 * event="scroll_summary" eventType="scroll"  (on page hide / route change)
 *   metadata: { maxPercent, dwellMs:{ b0_25, b25_50, b50_75, b75_100 } }
 *
 * event="attention"     eventType="custom"   (every 12s + on page leave)
 *   metadata: { grid:{ "col,row": ms }, cols:20, rows:20, unit:"ms", final }
 * ─────────────────────────────────────────────────────────────────────────── */
