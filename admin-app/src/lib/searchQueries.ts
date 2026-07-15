/**
 * On-site search analytics: top queries and — the money view — ZERO-RESULT
 * queries (demand the catalog isn't answering). Derived from search telemetry
 * where each event carries the query text and, ideally, a result count.
 *
 * Matching is loose: any event whose name looks like a search, carrying a query
 * in metadata (query / q / term / searchTerm / keyword) or in elementText. The
 * result count is read from several plausible keys; when absent the query still
 * counts, it just can't be classed zero-result.
 */
import type { TelemetryEvent } from "./ecommerce";
import { evName, evType, metaOf, metaPick, num, sessionOf, str, timeOf } from "./telemetryFields";

export interface SearchQueryStat {
  query: string;
  searches: number; // total times searched
  sessions: number; // distinct sessions
  withCount: number; // searches that reported a result count
  zeroResults: number; // searches that returned 0
  avgResults: number | null; // mean result count (over withCount)
  zeroRate: number; // zeroResults / withCount (0 when unknown)
  lastSeen: number;
}

export interface SearchSummary {
  total: number; // total searches
  distinct: number; // distinct query strings
  sessions: number; // distinct searching sessions
  zeroResults: number; // total zero-result searches
  zeroRate: number; // zeroResults / (searches with a count)
  top: SearchQueryStat[]; // most searched, desc
  zero: SearchQueryStat[]; // zero-result queries, by volume
}

function isSearch(e: TelemetryEvent): boolean {
  const t = evType(e);
  if (t === "search") return true;
  return /search|query|lookup|find/.test(evName(e));
}

function queryText(e: TelemetryEvent, m: Record<string, unknown>): string {
  const q = metaPick(m, "query", "q", "term", "searchTerm", "search_term", "keyword", "text", "value");
  const raw = str(q) || str(e.elementText ?? e.element_text);
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function resultCount(m: Record<string, unknown>): number | undefined {
  return num(
    metaPick(
      m,
      "resultCount",
      "result_count",
      "results",
      "count",
      "hits",
      "numResults",
      "num_results",
      "total",
      "matches",
    ),
  );
}

export function buildSearchStats(events: TelemetryEvent[]): SearchSummary {
  interface Acc {
    query: string;
    searches: number;
    sessions: Set<string>;
    withCount: number;
    zeroResults: number;
    sumResults: number;
    lastSeen: number;
  }
  const map = new Map<string, Acc>();
  let total = 0;
  let zeroTotal = 0;
  let withCountTotal = 0;
  const allSessions = new Set<string>();

  events.forEach((e, i) => {
    if (!isSearch(e)) return;
    const m = metaOf(e);
    const q = queryText(e, m);
    if (!q) return;
    total++;
    const sk = sessionOf(e, i);
    allSessions.add(sk);
    let a = map.get(q);
    if (!a) {
      a = { query: q, searches: 0, sessions: new Set(), withCount: 0, zeroResults: 0, sumResults: 0, lastSeen: 0 };
      map.set(q, a);
    }
    a.searches++;
    a.sessions.add(sk);
    a.lastSeen = Math.max(a.lastSeen, timeOf(e) || 0);
    const rc = resultCount(m);
    if (rc != null) {
      a.withCount++;
      withCountTotal++;
      a.sumResults += rc;
      if (rc === 0) {
        a.zeroResults++;
        zeroTotal++;
      }
    }
  });

  const stats: SearchQueryStat[] = [...map.values()].map((a) => ({
    query: a.query,
    searches: a.searches,
    sessions: a.sessions.size,
    withCount: a.withCount,
    zeroResults: a.zeroResults,
    avgResults: a.withCount ? a.sumResults / a.withCount : null,
    zeroRate: a.withCount ? a.zeroResults / a.withCount : 0,
    lastSeen: a.lastSeen,
  }));

  const top = [...stats].sort((a, b) => b.searches - a.searches || b.sessions - a.sessions);
  const zero = stats
    .filter((s) => s.zeroResults > 0)
    .sort((a, b) => b.zeroResults - a.zeroResults || b.searches - a.searches);

  return {
    total,
    distinct: stats.length,
    sessions: allSessions.size,
    zeroResults: zeroTotal,
    zeroRate: withCountTotal ? zeroTotal / withCountTotal : 0,
    top,
    zero,
  };
}
