/**
 * BEHAVIOR / USER-FLOW derivations — how visitors move through the site.
 *
 * From the raw Telemetry stream this builds five complementary lenses that the
 * Behavior Flow view renders:
 *
 *  1. PAGE STATS       — per page: views, unique sessions, entry / exit counts,
 *                        exit rate and average time-on-page.
 *  2. JOURNEYS         — the collapsed page sequence each session walked, and the
 *                        most common of those sequences (the "paths").
 *  3. TRANSITIONS      — directed page→page hops (source → target × count) that
 *                        feed the custom Sankey-ish flow ribbon.
 *  4. FLOW TREE        — a forward branch tree from a chosen entry page (top
 *                        branches per node) for the step-by-step path explorer.
 *  5. SESSION TIMELINE — every session's ordered event list for the explorer.
 *
 * Everything is pure and dependency-light (only the shared telemetry field
 * readers), tolerates both the normalized camelCase shape and the raw
 * snake_case sheet columns, and never throws — an empty stream yields empty
 * structures so the view falls back to its deterministic seed.
 */
import type { TelemetryEvent } from "./ecommerce";
import { evName, evType, pagePath, sessionOf, timeOf, str, pick, metaOf, metaPick } from "./telemetryFields";

const UNKNOWN = "(unknown)";

/** A single event flattened onto the fields the flow views need, time-sorted. */
export interface FlowEvent {
  t: number; // epoch ms (NaN-safe: coerced to session order when missing)
  hasTime: boolean;
  name: string; // lower-cased event name
  rawName: string; // original event name (for display)
  type: string; // lower-cased event type
  page: string; // origin-less path
  elementId: string;
  elementText: string;
  productId: string;
}

export interface SessionJourney {
  session: string;
  events: FlowEvent[];
  /** Collapsed page sequence (consecutive duplicates removed). */
  pageSeq: string[];
  entry: string;
  exit: string;
  start: number;
  end: number;
  durationMs: number;
  uniquePages: number;
  ordered: boolean;
  /** True when the session touched only one page / barely engaged. */
  bounced: boolean;
}

export interface PageStat {
  page: string;
  views: number; // contiguous page-visits (pageview proxy)
  events: number; // all events fired on the page
  sessions: number; // unique sessions that touched the page
  entries: number; // sessions whose FIRST page was this
  exits: number; // sessions whose LAST page was this
  entryRate: number; // entries / views
  exitRate: number; // exits / views
  avgTimeMs: number; // mean time-on-page over timed visits
  timedVisits: number; // visits with a measurable duration
}

export interface JourneyPath {
  key: string; // "a → b → c"
  steps: string[];
  count: number;
  share: number; // count / sessions
  ordered: number; // how many of these sessions ordered
}

export interface Transition {
  from: string;
  to: string;
  count: number;
}

export interface FlowNode {
  page: string;
  count: number;
  children: FlowNode[];
}

export interface BehaviorSummary {
  sessions: number;
  totalViews: number;
  avgTimeMs: number; // site-wide mean time-on-page
  avgPagesPerSession: number;
  bounceRate: number;
  pages: PageStat[];
  paths: JourneyPath[];
  transitions: Transition[];
  journeys: SessionJourney[]; // newest session first
  entryPages: { page: string; count: number }[];
}

/** page_view / product_view / screen_view style events (a "pageview"). */
function isViewEvent(name: string, type: string): boolean {
  return (
    type === "view" ||
    /page_?view|product_?view|view_?product|screen_?view|pageview|session_?start|visit|navigation|route_?change/.test(
      name,
    )
  );
}

function isOrderEvent(name: string, type: string): boolean {
  return type === "order" || /^order$|purchase|order_?placed|order_?created|transaction|checkout_?complete/.test(name);
}

/** Flatten + time-sort the raw telemetry into per-session journeys. */
export function buildJourneys(events: TelemetryEvent[]): SessionJourney[] {
  const bySession = new Map<string, FlowEvent[]>();

  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    const t = timeOf(e);
    const rawName = str(pick(e, "event", "event_name", "eventName", "name")) || "event";
    const fe: FlowEvent = {
      t,
      hasTime: Number.isFinite(t),
      name: evName(e),
      rawName,
      type: evType(e),
      page: pagePath(e),
      elementId: str(pick(e, "elementId", "element_id")),
      elementText: str(pick(e, "elementText", "element_text", "label")),
      productId: str(pick(e, "productId", "product_id")),
    };
    const arr = bySession.get(sk);
    if (arr) arr.push(fe);
    else bySession.set(sk, [fe]);
  });

  const journeys: SessionJourney[] = [];
  for (const [session, evs] of bySession) {
    // Stable time-sort; events without a timestamp keep their arrival order.
    evs.sort((a, b) => {
      if (a.hasTime && b.hasTime) return a.t - b.t;
      if (a.hasTime) return -1;
      if (b.hasTime) return 1;
      return 0;
    });

    const pageSeq: string[] = [];
    const uniq = new Set<string>();
    let ordered = false;
    for (const ev of evs) {
      if (ev.page && ev.page !== UNKNOWN) {
        if (pageSeq[pageSeq.length - 1] !== ev.page) pageSeq.push(ev.page);
        uniq.add(ev.page);
      }
      if (isOrderEvent(ev.name, ev.type)) ordered = true;
    }

    const timed = evs.filter((e) => e.hasTime).map((e) => e.t);
    const start = timed.length ? timed[0] : NaN;
    const end = timed.length ? timed[timed.length - 1] : NaN;
    const durationMs = Number.isFinite(start) && Number.isFinite(end) ? end - start : 0;

    journeys.push({
      session,
      events: evs,
      pageSeq,
      entry: pageSeq[0] ?? UNKNOWN,
      exit: pageSeq[pageSeq.length - 1] ?? UNKNOWN,
      start,
      end,
      durationMs,
      uniquePages: uniq.size,
      ordered,
      bounced: uniq.size <= 1 && evs.length <= 2 && !ordered,
    });
  }

  // Newest session first (by last event time) for the explorer.
  journeys.sort((a, b) => (b.end || 0) - (a.end || 0));
  return journeys;
}

interface PageAgg {
  views: number;
  events: number;
  sessions: Set<string>;
  entries: number;
  exits: number;
  totalTime: number;
  timedVisits: number;
}

/**
 * Build the full behavior summary. Time-on-page is measured per contiguous
 * page-visit as the gap to the moment the session leaves for another page; the
 * final (exit) visit of a session has no departure and is left un-timed.
 */
export function buildBehavior(events: TelemetryEvent[]): BehaviorSummary {
  const journeys = buildJourneys(events);
  const sessions = journeys.length;

  const pageMap = new Map<string, PageAgg>();
  const pathMap = new Map<string, { steps: string[]; count: number; ordered: number }>();
  const transMap = new Map<string, number>();
  const entryMap = new Map<string, number>();

  let totalPages = 0;
  let bounced = 0;

  const agg = (page: string): PageAgg => {
    let a = pageMap.get(page);
    if (!a) {
      a = { views: 0, events: 0, sessions: new Set(), entries: 0, exits: 0, totalTime: 0, timedVisits: 0 };
      pageMap.set(page, a);
    }
    return a;
  };

  for (const j of journeys) {
    if (j.bounced) bounced++;
    totalPages += Math.max(1, j.uniquePages);

    // Per-event page tallies + contiguous page-visit segmentation for timing.
    interface Visit {
      page: string;
      startT: number;
      hasStart: boolean;
    }
    const visits: Visit[] = [];
    let cur: Visit | null = null;
    for (const ev of j.events) {
      const page = ev.page && ev.page !== UNKNOWN ? ev.page : null;
      if (page) {
        const a = agg(page);
        a.events++;
        a.sessions.add(j.session);
        if (!cur || cur.page !== page) {
          cur = { page, startT: ev.t, hasStart: ev.hasTime };
          visits.push(cur);
          a.views++; // each new contiguous landing on the page = one view
        } else if (!cur.hasStart && ev.hasTime) {
          cur.startT = ev.t;
          cur.hasStart = true;
        }
      }
    }

    // Time-on-page: duration until the NEXT visit begins.
    for (let v = 0; v < visits.length - 1; v++) {
      const a = pageMap.get(visits[v].page)!;
      const next = visits[v + 1];
      if (visits[v].hasStart && next.hasStart) {
        const dt = next.startT - visits[v].startT;
        if (dt > 0 && dt < 30 * 60_000) {
          a.totalTime += dt;
          a.timedVisits++;
        }
      }
    }

    if (j.entry !== UNKNOWN) {
      agg(j.entry).entries++;
      entryMap.set(j.entry, (entryMap.get(j.entry) ?? 0) + 1);
    }
    if (j.exit !== UNKNOWN) agg(j.exit).exits++;

    // Journey path tally (collapsed sequence).
    if (j.pageSeq.length) {
      const key = j.pageSeq.join(" → ");
      const p = pathMap.get(key) ?? { steps: j.pageSeq, count: 0, ordered: 0 };
      p.count++;
      if (j.ordered) p.ordered++;
      pathMap.set(key, p);
    }

    // Directed transitions.
    for (let s = 0; s < j.pageSeq.length - 1; s++) {
      const tk = `${j.pageSeq[s]} ${j.pageSeq[s + 1]}`;
      transMap.set(tk, (transMap.get(tk) ?? 0) + 1);
    }
  }

  const pages: PageStat[] = [...pageMap.entries()]
    .map(([page, a]) => ({
      page,
      views: a.views,
      events: a.events,
      sessions: a.sessions.size,
      entries: a.entries,
      exits: a.exits,
      entryRate: a.views ? a.entries / a.views : 0,
      exitRate: a.views ? a.exits / a.views : 0,
      avgTimeMs: a.timedVisits ? a.totalTime / a.timedVisits : 0,
      timedVisits: a.timedVisits,
    }))
    .sort((a, b) => b.views - a.views);

  const paths: JourneyPath[] = [...pathMap.values()]
    .map((p) => ({
      key: p.steps.join(" → "),
      steps: p.steps,
      count: p.count,
      share: sessions ? p.count / sessions : 0,
      ordered: p.ordered,
    }))
    .sort((a, b) => b.count - a.count || b.steps.length - a.steps.length);

  const transitions: Transition[] = [...transMap.entries()]
    .map(([k, count]) => {
      const [from, to] = k.split(" ");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count);

  const totalViews = pages.reduce((s, p) => s + p.views, 0);
  const totalTimed = pages.reduce((s, p) => s + p.avgTimeMs * p.timedVisits, 0);
  const totalTimedVisits = pages.reduce((s, p) => s + p.timedVisits, 0);

  const entryPages = [...entryMap.entries()]
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count);

  return {
    sessions,
    totalViews,
    avgTimeMs: totalTimedVisits ? totalTimed / totalTimedVisits : 0,
    avgPagesPerSession: sessions ? totalPages / sessions : 0,
    bounceRate: sessions ? bounced / sessions : 0,
    pages,
    paths,
    transitions,
    journeys,
    entryPages,
  };
}

/**
 * Forward branch tree from an entry page: at each node keep only the top
 * `topPerNode` next-pages, up to `maxDepth` levels — the data behind the
 * step-by-step path explorer.
 */
export function buildFlowTree(
  journeys: SessionJourney[],
  entry: string,
  maxDepth = 4,
  topPerNode = 4,
): FlowNode {
  const seqs = journeys.filter((j) => j.entry === entry).map((j) => j.pageSeq);
  const root: FlowNode = { page: entry, count: seqs.length, children: [] };

  const build = (node: FlowNode, prefixLen: number, pool: string[][], depth: number) => {
    if (depth >= maxDepth) return;
    const nextCount = new Map<string, string[][]>();
    for (const seq of pool) {
      const nxt = seq[prefixLen];
      if (!nxt) continue;
      const bucket = nextCount.get(nxt) ?? [];
      bucket.push(seq);
      nextCount.set(nxt, bucket);
    }
    const ranked = [...nextCount.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, topPerNode);
    for (const [page, bucket] of ranked) {
      const child: FlowNode = { page, count: bucket.length, children: [] };
      node.children.push(child);
      build(child, prefixLen + 1, bucket, depth + 1);
    }
  };

  build(root, 1, seqs, 0);
  return root;
}

/** Human "2m 14s" / "48s" formatting for a millisecond duration. */
export function fmtDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** Short page label for dense chips/axes (keeps the tail of long paths). */
export function shortPage(page: string, max = 22): string {
  if (page === "/") return "/ (home)";
  if (page.length <= max) return page;
  return "…" + page.slice(-(max - 1));
}

/** Convenience: a product name for an event when present in metadata. */
export function eventProductName(e: TelemetryEvent): string {
  const m = metaOf(e);
  return str(metaPick(m, "productName", "product_name", "name"));
}
