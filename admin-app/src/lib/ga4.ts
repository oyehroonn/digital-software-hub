/**
 * GA4 (Google Analytics 4) client — real traffic data for DSM's old and new
 * sites, fetched through the `dsm-analytics-api` server-side proxy.
 *
 * Both sites are data streams on the SAME GA4 property ("G4 - Digital
 * Software Market", 281583873): the legacy `digitalsoftwaremarkett.com`
 * (double "t" — the pre-existing domain, substantial historical traffic) and
 * the current `digitalsoftwaremarket.ai` (new stream, thin/recent data —
 * expected). The proxy filters each report by GA4's `hostName` dimension
 * server-side, so the browser never sees a GA4 property id or credential —
 * only the same `ecommerce_url` / `ecommerce_secret` config the rest of the
 * Analytics area already uses to reach dsm-analytics-api.
 *
 * The backend calls the GA4 Data API with TWO `dateRanges` in one request
 * (current + previous period) when `compare` is on, so "vs previous period"
 * numbers come straight from Google, not a second round trip.
 */
import type { AppConfig } from "./config";

export interface Ga4TopPage {
  path: string;
  views: number;
  sessions: number;
}

export interface Ga4Channel {
  channel: string;
  sessions: number;
  users: number;
}

export interface Ga4Totals {
  sessions: number;
  totalUsers: number;
  newUsers: number;
  pageViews: number;
  engagedSessions: number;
  keyEvents: number;
  avgSessionDurationSec: number;
  bounceRate: number;
}

export interface Ga4SiteStats extends Ga4Totals {
  hostname: string;
  label: string;
  topPages: Ga4TopPage[];
  channels: Ga4Channel[];
  previous: Ga4Totals | null;
  error?: string;
}

export type Ga4SiteKey = "old" | "new";

export interface Ga4Overview {
  ok: boolean;
  range: { start: string; end: string };
  sites: Record<Ga4SiteKey, Ga4SiteStats>;
  error?: string;
}

const BLANK_TOTALS: Ga4Totals = {
  sessions: 0,
  totalUsers: 0,
  newUsers: 0,
  pageViews: 0,
  engagedSessions: 0,
  keyEvents: 0,
  avgSessionDurationSec: 0,
  bounceRate: 0,
};

function blankSite(hostname: string, label: string): Ga4SiteStats {
  return { ...BLANK_TOTALS, hostname, label, topPages: [], channels: [], previous: null };
}

function emptySites(): Ga4Overview["sites"] {
  return {
    old: blankSite("digitalsoftwaremarkett.com", "Old site (legacy)"),
    new: blankSite("digitalsoftwaremarket.ai", "New site (current)"),
  };
}

/** GA4 wants an inclusive UTC calendar date (YYYY-MM-DD). The app's date-range
 * model gives epoch-ms bounds where `end` is ~now (an exclusive live upper
 * bound), so back it off a touch before taking the UTC day. */
function isoDate(epochMs: number, fallback = "2023-01-01"): string {
  if (!epochMs || epochMs <= 0) return fallback;
  return new Date(epochMs).toISOString().slice(0, 10);
}

export interface FetchGa4Opts {
  start: number;
  end: number;
  prevStart?: number;
  prevEnd?: number;
  compare: boolean;
}

export async function fetchGa4Overview(cfg: AppConfig, opts: FetchGa4Opts): Promise<Ga4Overview> {
  const base = (cfg.ecommerce_url || "").replace(/\/+$/, "");
  const startStr = isoDate(opts.start);
  const endStr = isoDate(Math.max(opts.start, opts.end - 1));
  const compare = opts.compare && opts.prevStart != null && opts.prevEnd != null;

  const params = new URLSearchParams();
  params.set("start", startStr);
  params.set("end", endStr);
  params.set("compare", compare ? "1" : "0");
  if (compare) {
    params.set("prevStart", isoDate(opts.prevStart as number));
    params.set("prevEnd", isoDate(Math.max(opts.prevStart as number, (opts.prevEnd as number) - 1)));
  }
  if (cfg.ecommerce_secret) params.set("secret", cfg.ecommerce_secret);

  const fallback: Ga4Overview = { ok: false, range: { start: startStr, end: endStr }, sites: emptySites() };

  if (!base) {
    return { ...fallback, error: "No API base URL configured (ecommerce_url is empty)." };
  }

  const url = `${base}/api/ga4/overview?${params.toString()}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body) {
      return { ...fallback, error: (body && body.error) || `GA4 proxy returned HTTP ${res.status}` };
    }
    return body as Ga4Overview;
  } catch (e) {
    return { ...fallback, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
