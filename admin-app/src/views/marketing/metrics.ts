/**
 * Marketing analytics derivations. Everything here is computed live from the
 * STABLE data layer (Orders + Telemetry sheets) — nothing is persisted. Matching
 * is deliberately defensive: naming drift on the site under-counts a stat rather
 * than throwing into the UI.
 *
 *  - deriveMembers()        insider audience (customers grouped by email)
 *  - campaignPerformance()  UTM-attributed clicks + Orders-attributed revenue
 *  - landingPages()         per-URL performance, grouped by site (host)
 */
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import type { Campaign } from "./store";

/* ------------------------------- Members ------------------------------- */

export interface Member {
  email: string;
  name: string;
  orders: number;
  totalSpend: number;
  currency: string;
  products: string[];
  firstOrder?: string;
  lastOrder?: string;
  optedIn: boolean; // false when their email is on the suppression list
  tier: "VIP" | "Repeat" | "New";
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Group the Orders sheet by email → one Member per customer (the insider list). */
export function deriveMembers(orders: Order[], suppress: string[] = []): Member[] {
  const supp = new Set(suppress.map((s) => s.toLowerCase()));
  interface Acc {
    name: string;
    orders: number;
    spend: number;
    currency: string;
    products: Set<string>;
    first?: number;
    last?: number;
  }
  const byEmail = new Map<string, Acc>();

  for (const o of orders) {
    const email = String(o.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) continue;
    let a = byEmail.get(email);
    if (!a) {
      a = { name: "", orders: 0, spend: 0, currency: "USD", products: new Set() };
      byEmail.set(email, a);
    }
    if (o.customerName) a.name = String(o.customerName);
    a.orders += 1;
    a.spend += num(o.price) * (num(o.quantity) || 1);
    if (o.currency) a.currency = String(o.currency);
    if (o.productName) a.products.add(String(o.productName));
    const t = Date.parse(String(o.timestamp ?? ""));
    if (!Number.isNaN(t)) {
      if (a.first == null || t < a.first) a.first = t;
      if (a.last == null || t > a.last) a.last = t;
    }
  }

  const out: Member[] = [];
  for (const [email, a] of byEmail) {
    const tier: Member["tier"] = a.spend >= 5000 ? "VIP" : a.orders > 1 ? "Repeat" : "New";
    out.push({
      email,
      name: a.name || email.split("@")[0],
      orders: a.orders,
      totalSpend: a.spend,
      currency: a.currency,
      products: [...a.products],
      firstOrder: a.first ? new Date(a.first).toISOString() : undefined,
      lastOrder: a.last ? new Date(a.last).toISOString() : undefined,
      optedIn: !supp.has(email),
      tier,
    });
  }
  return out.sort((x, y) => y.totalSpend - x.totalSpend);
}

/* --------------------------- Campaign metrics -------------------------- */

export interface CampaignMetric {
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  revenue: number;
  currency: string;
  roas: number; // revenue / spend (0 when no spend recorded)
  goalPct: number; // revenue / goalRevenue (0..1+)
  attributed: boolean; // true when telemetry/orders actually matched this campaign
}

function metaOf(e: TelemetryEvent): Record<string, unknown> {
  return typeof e.metadata === "object" && e.metadata ? (e.metadata as Record<string, unknown>) : {};
}

/** Pull a utm_campaign value out of an event (metadata or a `?utm_campaign=` in the url). */
function utmOf(e: TelemetryEvent): string {
  const m = metaOf(e);
  const direct = m.utm_campaign ?? m.utmCampaign ?? m.campaign;
  if (direct) return String(direct).toLowerCase();
  const url = String(e.pageUrl ?? "");
  const match = url.match(/[?&]utm_campaign=([^&#]+)/i);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

const CLICK_RE = /(^|_)click|tap|cta|add_?to_?cart/;
const VIEW_RE = /view|impression|visit|page/;

/**
 * Attribute telemetry (impressions/clicks by utm_campaign) and Orders (revenue,
 * matched by the campaign's product) to one campaign. Falls back to the
 * campaign's own stored spend for ROAS.
 */
export function campaignPerformance(
  campaign: Campaign,
  events: TelemetryEvent[],
  orders: Order[],
): CampaignMetric {
  const utm = (campaign.utmCampaign ?? "").toLowerCase();
  let impressions = 0;
  let clicks = 0;
  let attributed = false;

  if (utm) {
    for (const e of events) {
      if (utmOf(e) !== utm) continue;
      attributed = true;
      const name = String(e.event ?? e.eventType ?? "").toLowerCase();
      if (CLICK_RE.test(name) || String(e.eventType).toLowerCase() === "click") clicks++;
      else if (VIEW_RE.test(name)) impressions++;
    }
  }

  let conversions = 0;
  let revenue = 0;
  let currency = "USD";
  const pid = String(campaign.productId ?? "").trim();
  if (pid) {
    for (const o of orders) {
      if (String(o.productId ?? "").trim() !== pid) continue;
      attributed = true;
      conversions++;
      revenue += num(o.price) * (num(o.quantity) || 1);
      if (o.currency) currency = String(o.currency);
    }
  }

  const spend = num(campaign.spend);
  return {
    impressions,
    clicks,
    ctr: impressions ? clicks / impressions : 0,
    conversions,
    revenue,
    currency,
    roas: spend ? revenue / spend : 0,
    goalPct: campaign.goalRevenue ? revenue / campaign.goalRevenue : 0,
    attributed,
  };
}

/* --------------------------- Landing pages ---------------------------- */

export interface LandingRow {
  url: string; // host + path
  host: string;
  path: string;
  views: number;
  clicks: number;
  sessions: number;
  ctr: number;
  bounceRate: number; // sessions with a single event / sessions
}

export interface SiteGroup {
  host: string;
  views: number;
  clicks: number;
  sessions: number;
  ctr: number;
  pages: LandingRow[];
}

function parseUrl(raw: string): { host: string; path: string } | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const u = new URL(s, s.startsWith("http") ? undefined : "https://local");
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return { host: u.host || "local", path };
  } catch {
    // Bare path (e.g. "/pricing") — bucket under a synthetic host.
    const path = s.split("?")[0].replace(/\/+$/, "") || "/";
    return { host: "site", path };
  }
}

/** Build per-URL landing performance and roll it up per site (host). */
export function landingPages(events: TelemetryEvent[]): SiteGroup[] {
  interface Acc {
    host: string;
    path: string;
    views: number;
    clicks: number;
    sessions: Set<string>;
    sessionEventCount: Map<string, number>;
  }
  const byUrl = new Map<string, Acc>();

  events.forEach((e, i) => {
    const parsed = parseUrl(String(e.pageUrl ?? ""));
    if (!parsed) return;
    const key = `${parsed.host}${parsed.path}`;
    let a = byUrl.get(key);
    if (!a) {
      a = { host: parsed.host, path: parsed.path, views: 0, clicks: 0, sessions: new Set(), sessionEventCount: new Map() };
      byUrl.set(key, a);
    }
    const name = String(e.event ?? e.eventType ?? "").toLowerCase();
    if (CLICK_RE.test(name) || String(e.eventType).toLowerCase() === "click") a.clicks++;
    else if (VIEW_RE.test(name)) a.views++;
    const sid = String(e.sessionId ?? e.anonymousId ?? `__ev${i}`);
    a.sessions.add(sid);
    a.sessionEventCount.set(sid, (a.sessionEventCount.get(sid) ?? 0) + 1);
  });

  const rows: LandingRow[] = [...byUrl.values()].map((a) => {
    const sessions = a.sessions.size;
    let single = 0;
    a.sessionEventCount.forEach((c) => { if (c <= 1) single++; });
    return {
      url: `${a.host}${a.path}`,
      host: a.host,
      path: a.path,
      views: a.views,
      clicks: a.clicks,
      sessions,
      ctr: a.views ? a.clicks / a.views : 0,
      bounceRate: sessions ? single / sessions : 0,
    };
  });

  const byHost = new Map<string, LandingRow[]>();
  for (const r of rows) {
    const list = byHost.get(r.host) ?? [];
    list.push(r);
    byHost.set(r.host, list);
  }

  const groups: SiteGroup[] = [...byHost.entries()].map(([host, pages]) => {
    const views = pages.reduce((s, p) => s + p.views, 0);
    const clicks = pages.reduce((s, p) => s + p.clicks, 0);
    const sessions = pages.reduce((s, p) => s + p.sessions, 0);
    return {
      host,
      views,
      clicks,
      sessions,
      ctr: views ? clicks / views : 0,
      pages: pages.sort((a, b) => b.views - a.views),
    };
  });

  return groups.sort((a, b) => b.views - a.views);
}

/* ------------------------- A/B statistics helper ---------------------- */

export interface ABStat {
  key: string;
  ctr: number; // clicks / impressions
  cvr: number; // conversions / impressions
  n: number; // impressions
  conversions: number;
}

/**
 * Two-proportion z-test on the conversion rate of the best variant vs. the
 * control (first variant). Returns the winner key, its uplift over control and
 * an approximate confidence (1 - p). Null when there isn't enough data.
 */
export function abSignificance(
  variants: { key: string; impressions: number; clicks: number; conversions: number }[],
): { winner: string; uplift: number; confidence: number; enough: boolean } | null {
  if (variants.length < 2) return null;
  const stats: ABStat[] = variants.map((v) => ({
    key: v.key,
    ctr: v.impressions ? v.clicks / v.impressions : 0,
    cvr: v.impressions ? v.conversions / v.impressions : 0,
    n: v.impressions,
    conversions: v.conversions,
  }));
  const control = stats[0];
  const best = [...stats].sort((a, b) => b.cvr - a.cvr)[0];
  if (best.key === control.key) {
    // Control leads — report the runner-up gap instead.
    const runner = [...stats].sort((a, b) => b.cvr - a.cvr)[1];
    if (!runner) return null;
  }
  const enough = control.n >= 100 && best.n >= 100 && (control.conversions + best.conversions) >= 10;
  const p1 = control.cvr;
  const p2 = best.cvr;
  const n1 = control.n || 1;
  const n2 = best.n || 1;
  const pPool = (control.conversions + best.conversions) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2)) || 1e-9;
  const z = Math.abs(p2 - p1) / se;
  const confidence = normalCdf(z) * 2 - 1; // two-sided → 1 - p
  return {
    winner: best.key,
    uplift: p1 ? (p2 - p1) / p1 : 0,
    confidence: Math.max(0, Math.min(0.9999, confidence)),
    enough,
  };
}

/** Abramowitz-Stegun standard-normal CDF approximation. */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}
