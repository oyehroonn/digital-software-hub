/**
 * UTM campaign parsing + tracking derivations.
 *
 * Two jobs:
 *   1. `buildUtmUrl` / `parseUtmFromUrl` — pure helpers powering the UTM link
 *      BUILDER (compose a tagged link) and the tracker (read utm_* back out of a
 *      page_url query string).
 *   2. `buildCampaigns` — first-touch campaign attribution over the Telemetry
 *      sheet: each session is credited to the source/medium/campaign of its
 *      landing hit (read from the page_url query params OR event metadata), then
 *      sessions / clicks / conversions / revenue are aggregated per
 *      campaign, source and medium. Revenue is JOINED from the Orders sheet by
 *      session id first, then by email (telemetry lead-capture email ↔ order
 *      email), then falls back to order-event metadata. Missing UTMs degrade to
 *      "(direct)". Everything is defensive — bad rows never throw.
 */
import type { Order, TelemetryEvent } from "./ecommerce";
import { evName, metaOf, metaPick, num, pick, sessionOf, str, timeOf } from "./telemetryFields";

export interface UtmParams {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
}

/** Ordered [UtmParams key, query-param name] pairs — the canonical UTM set. */
export const UTM_FIELDS: { key: keyof UtmParams; param: string; label: string; hint: string }[] = [
  { key: "source", param: "utm_source", label: "Campaign source", hint: "google, newsletter, facebook" },
  { key: "medium", param: "utm_medium", label: "Campaign medium", hint: "cpc, email, social, banner" },
  { key: "campaign", param: "utm_campaign", label: "Campaign name", hint: "summer_sale, july_promo" },
  { key: "term", param: "utm_term", label: "Campaign term", hint: "paid keywords (optional)" },
  { key: "content", param: "utm_content", label: "Campaign content", hint: "A/B variant (optional)" },
];

/** Read utm_* (plus gclid / fbclid channel hints) from a URL's query string. */
export function parseUtmFromUrl(url: string): Partial<UtmParams> {
  if (!url) return {};
  let qs = "";
  try {
    qs = new URL(url, "http://x").search;
  } catch {
    const i = url.indexOf("?");
    qs = i >= 0 ? url.slice(i) : "";
  }
  if (!qs) return {};
  const p = new URLSearchParams(qs);
  const out: Partial<UtmParams> = {};
  const map: [keyof UtmParams, string][] = [
    ["source", "utm_source"],
    ["medium", "utm_medium"],
    ["campaign", "utm_campaign"],
    ["term", "utm_term"],
    ["content", "utm_content"],
  ];
  for (const [k, q] of map) {
    const v = p.get(q);
    if (v) out[k] = v;
  }
  // Ad-click ids imply a paid channel when explicit UTMs are absent.
  if (!out.source && p.get("gclid")) {
    out.source = "google";
    out.medium = out.medium || "cpc";
  }
  if (!out.source && (p.get("fbclid") || p.get("fbc"))) {
    out.source = "facebook";
    out.medium = out.medium || "cpc";
  }
  return out;
}

/** Merge an event's UTM attribution: URL query params first, then metadata aliases. */
export function utmOf(e: TelemetryEvent): UtmParams {
  const fromUrl = parseUtmFromUrl(str(pick(e, "pageUrl", "page_url", "url", "href")));
  const m = metaOf(e);
  const pickField = (urlVal: string | undefined, ...metaKeys: string[]) =>
    (urlVal ?? "") || str(metaPick(m, ...metaKeys));
  return {
    source: pickField(fromUrl.source, "utm_source", "utmSource", "source").toLowerCase().trim(),
    medium: pickField(fromUrl.medium, "utm_medium", "utmMedium", "medium").toLowerCase().trim(),
    campaign: pickField(fromUrl.campaign, "utm_campaign", "utmCampaign", "campaign").trim(),
    term: pickField(fromUrl.term, "utm_term", "utmTerm", "term").trim(),
    content: pickField(fromUrl.content, "utm_content", "utmContent", "content").trim(),
  };
}

/** Compose a tagged link: append the non-empty UTM params to a base URL. */
export function buildUtmUrl(base: string, params: Partial<UtmParams>): string {
  const b = (base || "").trim();
  if (!b) return "";
  const parts: string[] = [];
  for (const { key, param } of UTM_FIELDS) {
    const v = (params[key] ?? "").trim();
    if (v) parts.push(`${param}=${encodeURIComponent(v)}`);
  }
  if (!parts.length) return b;
  const hashIdx = b.indexOf("#");
  const hash = hashIdx >= 0 ? b.slice(hashIdx) : "";
  const noHash = hashIdx >= 0 ? b.slice(0, hashIdx) : b;
  const sep = noHash.includes("?") ? (/[?&]$/.test(noHash) ? "" : "&") : "?";
  return `${noHash}${sep}${parts.join("&")}${hash}`;
}

// ── Campaign tracking derivations ────────────────────────────────────────────

export interface CampaignRow {
  key: string;
  campaign: string;
  source: string;
  medium: string;
  sessions: number;
  clicks: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
  aov: number;
}

export interface SourceRow {
  source: string;
  sessions: number;
  clicks: number;
  conversions: number;
  conversionRate: number;
  revenue: number;
}

export interface MediumRow {
  medium: string;
  sessions: number;
  conversions: number;
  revenue: number;
}

export interface DailyRow {
  date: string; // YYYY-MM-DD
  label: string; // "Jul 3"
  sessions: number;
  conversions: number;
  revenue: number;
}

export interface UtmSummary {
  sessions: number;
  taggedSessions: number; // sessions with a known (non-direct) source or a campaign
  clicks: number;
  conversions: number;
  revenue: number;
  campaigns: CampaignRow[];
  sources: SourceRow[];
  mediums: MediumRow[];
  daily: DailyRow[];
}

interface Sess {
  source: string;
  medium: string;
  campaign: string;
  t: number;
  day: string;
  clicks: number;
  converted: boolean;
  revenue: number;
  email: string;
}

const ORDER_RE = /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|checkout_?complete/;
const CLICK_RE = /click|tap|add_?to_?cart|cta/;

function isOrder(e: TelemetryEvent): boolean {
  return ORDER_RE.test(evName(e));
}

function isClick(e: TelemetryEvent): boolean {
  const n = evName(e);
  return CLICK_RE.test(n) || str(pick(e, "eventType", "event_type")).toLowerCase() === "click";
}

function orderRevenue(e: TelemetryEvent): number {
  const m = metaOf(e);
  const price = num(metaPick(m, "price", "value", "total", "amount", "revenue")) ?? 0;
  const qty = num(metaPick(m, "quantity", "qty", "count")) ?? 1;
  return price * qty;
}

function emailOf(e: TelemetryEvent): string {
  return str(metaPick(metaOf(e), "email", "customer_email", "customerEmail", "user_email"))
    .toLowerCase()
    .trim();
}

function dayKey(t: number): string {
  if (!Number.isFinite(t)) return "";
  return new Date(t).toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dayLabel(date: string): string {
  const [, mm, dd] = date.split("-");
  const mi = parseInt(mm, 10) - 1;
  return `${MONTHS[mi] ?? mm} ${parseInt(dd, 10)}`;
}

export function buildCampaigns(events: TelemetryEvent[], orders: Order[] = []): UtmSummary {
  // Revenue joins from the Orders sheet: by session id, and by email.
  const revBySession = new Map<string, number>();
  const revByEmail = new Map<string, number>();
  for (const o of orders) {
    const price = num(o.price) ?? 0;
    const qty = num(o.quantity) ?? 1;
    const amount = price * qty;
    const sid = str(
      pick(o as unknown as TelemetryEvent, "sessionId", "session_id", "anonymousId", "anonymous_id"),
    );
    if (sid) revBySession.set(sid, (revBySession.get(sid) ?? 0) + amount);
    const email = str(o.email).toLowerCase().trim();
    if (email) revByEmail.set(email, (revByEmail.get(email) ?? 0) + amount);
  }

  const sessions = new Map<string, Sess>();
  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    const t = timeOf(e);
    let s = sessions.get(sk);
    if (!s) {
      const u = utmOf(e);
      s = {
        source: u.source,
        medium: u.medium,
        campaign: u.campaign,
        t: Number.isFinite(t) ? t : Infinity,
        day: "",
        clicks: 0,
        converted: false,
        revenue: 0,
        email: "",
      };
      sessions.set(sk, s);
    } else if (Number.isFinite(t) && t < s.t) {
      // Earlier event = truer first touch; only overwrite if it carries a source.
      const u = utmOf(e);
      if (u.source || !s.source) {
        s.source = u.source;
        s.medium = u.medium;
        s.campaign = u.campaign;
      }
      s.t = t;
    }
    if (isClick(e)) s.clicks++;
    if (!s.email) {
      const em = emailOf(e);
      if (em) s.email = em;
    }
    if (isOrder(e)) {
      s.converted = true;
      const rev = revBySession.get(sk) ?? orderRevenue(e);
      if (rev > s.revenue) s.revenue = rev;
    }
  });

  const camp = new Map<string, CampaignRow>();
  const src = new Map<string, SourceRow>();
  const med = new Map<string, MediumRow>();
  const daily = new Map<string, DailyRow>();

  let totalSessions = 0;
  let tagged = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalRevenue = 0;

  for (const s of sessions.values()) {
    const source = s.source || "(direct)";
    const medium = s.medium || (s.source ? "referral" : "none");
    // Resolve revenue: order-joined session rev → email-joined rev.
    let revenue = s.revenue;
    if (s.converted && revenue === 0 && s.email && revByEmail.has(s.email)) {
      revenue = revByEmail.get(s.email) ?? 0;
    }

    totalSessions++;
    totalClicks += s.clicks;
    if (source !== "(direct)" || s.campaign) tagged++;
    if (s.converted) {
      totalConversions++;
      totalRevenue += revenue;
    }

    // Source breakdown (all sessions).
    let sr = src.get(source);
    if (!sr) {
      sr = { source, sessions: 0, clicks: 0, conversions: 0, conversionRate: 0, revenue: 0 };
      src.set(source, sr);
    }
    sr.sessions++;
    sr.clicks += s.clicks;
    if (s.converted) {
      sr.conversions++;
      sr.revenue += revenue;
    }

    // Medium breakdown.
    let mr = med.get(medium);
    if (!mr) {
      mr = { medium, sessions: 0, conversions: 0, revenue: 0 };
      med.set(medium, mr);
    }
    mr.sessions++;
    if (s.converted) {
      mr.conversions++;
      mr.revenue += revenue;
    }

    // Campaign table — only sessions that actually carry a campaign tag.
    if (s.campaign) {
      const ck = `${s.campaign}::${source}::${medium}`;
      let cr = camp.get(ck);
      if (!cr) {
        cr = {
          key: ck,
          campaign: s.campaign,
          source,
          medium,
          sessions: 0,
          clicks: 0,
          conversions: 0,
          conversionRate: 0,
          revenue: 0,
          aov: 0,
        };
        camp.set(ck, cr);
      }
      cr.sessions++;
      cr.clicks += s.clicks;
      if (s.converted) {
        cr.conversions++;
        cr.revenue += revenue;
      }
    }

    // Daily trend (of first-touch day).
    const dk = s.day || dayKey(s.t);
    if (dk) {
      let dr = daily.get(dk);
      if (!dr) {
        dr = { date: dk, label: dayLabel(dk), sessions: 0, conversions: 0, revenue: 0 };
        daily.set(dk, dr);
      }
      dr.sessions++;
      if (s.converted) {
        dr.conversions++;
        dr.revenue += revenue;
      }
    }
  }

  const campaigns = [...camp.values()]
    .map((c) => ({
      ...c,
      conversionRate: c.sessions ? c.conversions / c.sessions : 0,
      aov: c.conversions ? c.revenue / c.conversions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.revenue - a.revenue);

  const sources = [...src.values()]
    .map((s) => ({ ...s, conversionRate: s.sessions ? s.conversions / s.sessions : 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const mediums = [...med.values()].sort((a, b) => b.sessions - a.sessions);

  const dailyRows = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return {
    sessions: totalSessions,
    taggedSessions: tagged,
    clicks: totalClicks,
    conversions: totalConversions,
    revenue: totalRevenue,
    campaigns,
    sources,
    mediums,
    daily: dailyRows,
  };
}
