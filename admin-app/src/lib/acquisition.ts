/**
 * Acquisition / Traffic derivations.
 *
 * Rolls the raw Telemetry stream up into SESSIONS, then answers the acquisition
 * questions a growth team asks:
 *   - which CHANNELS (direct / organic / paid / social / email / referral) and
 *     which raw SOURCES / REFERRERS bring visitors — and which actually convert;
 *   - NEW vs RETURNING visitors, decided by each session's `anonymous_id`
 *     first-seen (a session is "returning" if its anon id fired an earlier
 *     session in-window);
 *   - SESSIONS OVER TIME, split by channel and by new/returning, bucketed daily;
 *   - LANDING pages (entrances, bounce, conversion) and EXIT pages.
 *
 * First-touch model: every session is credited to the source / medium / campaign
 * of its EARLIEST event (the landing hit), read from UTM params or a referrer
 * host in metadata — exactly like `lib/attribution`, which this complements.
 * Every reader tolerates the normalized camelCase shape AND the raw snake_case
 * sheet columns, and nothing throws — an empty stream yields empty aggregates so
 * the view cleanly renders its deterministic seed.
 */
import type { Order, TelemetryEvent } from "./ecommerce";
import { evName, metaOf, metaPick, num, pagePath, pick, sessionOf, str, timeOf } from "./telemetryFields";

/** The six coarse marketing channels, in fixed display + colour order. */
export type Channel = "Direct" | "Organic" | "Paid" | "Social" | "Email" | "Referral";

export const CHANNELS: Channel[] = ["Direct", "Organic", "Paid", "Social", "Email", "Referral"];

/**
 * Fixed categorical colour per channel — validated CVD-safe on the dark admin
 * surface (dataviz `validate_palette.js`, all six checks pass). Colour follows
 * the CHANNEL entity, never its rank, so a filtered view never repaints it.
 */
export const CHANNEL_COLOR: Record<Channel, string> = {
  Direct: "#d95926", // orange
  Organic: "#199e70", // aqua/green
  Paid: "#c98500", // yellow
  Social: "#3987e5", // blue
  Email: "#d55181", // magenta
  Referral: "#9085e9", // violet
};

export interface SourceStat {
  key: string;
  source: string;
  medium: string;
  channel: Channel;
  sessions: number;
  orders: number;
  conversion: number;
  revenue: number;
}

export interface ChannelStat {
  channel: Channel;
  sessions: number;
  visitors: number;
  newVisitors: number;
  orders: number;
  conversion: number;
  revenue: number;
  share: number; // fraction of all sessions
}

export interface PageStat {
  path: string;
  sessions: number; // entrances (landing) or exits, depending on table
  orders: number;
  conversion: number;
  revenue: number;
  bounces: number;
  bounceRate: number;
}

export interface DayBucket {
  ts: number;
  label: string;
  sessions: number;
  newVisitors: number;
  returning: number;
  /** Per-channel session counts (keys are Channel names). */
  [channel: string]: number | string;
}

export interface AcquisitionSummary {
  sessions: number;
  visitors: number; // unique anonymous ids (or session ids as fallback)
  newVisitors: number;
  returningVisitors: number;
  orders: number;
  conversion: number;
  revenue: number;
  avgPagesPerSession: number;
  bounceRate: number;
  channels: ChannelStat[];
  sources: SourceStat[];
  landing: PageStat[];
  exits: PageStat[];
  daily: DayBucket[];
  newReturningConv: { newConv: number; returningConv: number };
}

interface Session {
  id: string;
  anon: string;
  start: number;
  source: string;
  medium: string;
  channel: Channel;
  landing: string;
  exit: string;
  pages: number; // distinct pages visited
  converted: boolean;
  revenue: number;
  isNew: boolean;
}

const DAY = 86_400_000;

/** Map a referrer URL / host to a coarse source+medium when UTMs are absent. */
function fromReferrer(ref: string): { source: string; medium: string } | null {
  if (!ref) return null;
  let host = ref;
  try {
    host = new URL(ref).hostname;
  } catch {
    /* keep raw */
  }
  host = host.replace(/^www\./, "").toLowerCase();
  if (!host) return null;
  if (/google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\.|yandex\./.test(host)) {
    const s = host.split(".")[0];
    return { source: s, medium: "organic" };
  }
  if (/facebook\.|fb\.|l\.facebook|instagram\.|linkedin\.|lnkd\.|t\.co|twitter\.|x\.com|youtube\.|reddit\.|pinterest\.|tiktok\./.test(host)) {
    const s = host.replace(/\.com$|\.co$/, "").split(".").pop() || host;
    return { source: s, medium: "social" };
  }
  return { source: host, medium: "referral" };
}

/** Classify a (source, medium) pair into one of the six channels. */
export function channelOf(source: string, medium: string): Channel {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if ((!s || s === "(direct)") && (!m || m === "none")) return "Direct";
  if (/(^|\W)(email|newsletter|e-?mail)(\W|$)/.test(m) || /newsletter|mailchimp|klaviyo/.test(s)) return "Email";
  if (/cpc|ppc|paid|ads?|display|retargeting|sem|cpm/.test(m)) return "Paid";
  if (/social|facebook|instagram|linkedin|twitter|tiktok|youtube|reddit|pinterest/.test(m)) return "Social";
  if (/organic|search/.test(m)) return "Organic";
  if (/facebook|instagram|linkedin|twitter|tiktok|youtube|reddit|pinterest/.test(s)) return "Social";
  if (/google|bing|duckduckgo|yahoo|ecosia|yandex/.test(s) && !m) return "Organic";
  if (!m || m === "referral" || m === "link") return s && s !== "(direct)" ? "Referral" : "Direct";
  return "Referral";
}

function firstTouch(e: TelemetryEvent): { source: string; medium: string } {
  const m = metaOf(e);
  const source = str(metaPick(m, "utm_source", "utmSource", "source", "utm_src"));
  const medium = str(metaPick(m, "utm_medium", "utmMedium", "medium"));
  const referrer = str(metaPick(m, "referrer", "referer", "ref", "document_referrer"));
  if (source) return { source: source.toLowerCase(), medium: (medium || "referral").toLowerCase() };
  const ref = fromReferrer(referrer);
  if (ref) return ref;
  return { source: "(direct)", medium: "none" };
}

function isOrderEvent(e: TelemetryEvent): boolean {
  return /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|checkout_?complete/.test(evName(e));
}

function eventRevenue(e: TelemetryEvent): number {
  const m = metaOf(e);
  const price = num(metaPick(m, "price", "value", "total", "amount", "revenue")) ?? 0;
  const qty = num(metaPick(m, "quantity", "qty", "count")) ?? 1;
  return price * qty;
}

function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function buildAcquisition(events: TelemetryEvent[], orders: Order[] = []): AcquisitionSummary {
  // Revenue per session id joined from the Orders sheet, when present.
  const revBySession = new Map<string, number>();
  for (const o of orders) {
    const sid = str(pick(o as unknown as TelemetryEvent, "sessionId", "session_id", "anonymousId", "anonymous_id"));
    if (!sid) continue;
    const price = num(o.price) ?? 0;
    const qty = num(o.quantity) ?? 1;
    revBySession.set(sid, (revBySession.get(sid) ?? 0) + price * qty);
  }

  // 1) Roll events up into sessions (first touch, landing, exit, pages, orders).
  interface Acc {
    id: string;
    anon: string;
    start: number;
    end: number;
    source: string;
    medium: string;
    landing: string;
    exit: string;
    pageSet: Set<string>;
    converted: boolean;
    revenue: number;
  }
  const acc = new Map<string, Acc>();
  events.forEach((e, i) => {
    const id = sessionOf(e, i);
    const t = timeOf(e);
    const tt = Number.isFinite(t) ? t : 0;
    const path = pagePath(e);
    const anon = str(pick(e, "anonymousId", "anonymous_id")) || id;
    let a = acc.get(id);
    if (!a) {
      const ft = firstTouch(e);
      a = {
        id,
        anon,
        start: tt || Infinity,
        end: tt,
        source: ft.source,
        medium: ft.medium,
        landing: path,
        exit: path,
        pageSet: new Set(path === "(unknown)" ? [] : [path]),
        converted: false,
        revenue: 0,
      };
      acc.set(id, a);
    }
    if (path !== "(unknown)") a.pageSet.add(path);
    // Earliest event → landing + first-touch attribution.
    if (Number.isFinite(t) && t < a.start) {
      a.start = t;
      a.landing = path;
      const ft = firstTouch(e);
      if (ft.source !== "(direct)" || a.source === "(direct)") {
        a.source = ft.source;
        a.medium = ft.medium;
      }
    }
    // Latest event → exit page.
    if (tt >= a.end) {
      a.end = tt;
      if (path !== "(unknown)") a.exit = path;
    }
    if (isOrderEvent(e)) {
      a.converted = true;
      a.revenue = Math.max(a.revenue, revBySession.get(id) ?? eventRevenue(e));
    }
  });

  // 2) New vs returning: earliest session per anon id is "new".
  const firstSeen = new Map<string, number>();
  for (const a of acc.values()) {
    const s = Number.isFinite(a.start) ? a.start : a.end;
    const prev = firstSeen.get(a.anon);
    if (prev == null || s < prev) firstSeen.set(a.anon, s);
  }

  const sessions: Session[] = [...acc.values()].map((a) => {
    const start = Number.isFinite(a.start) ? a.start : a.end;
    return {
      id: a.id,
      anon: a.anon,
      start,
      source: a.source,
      medium: a.medium,
      channel: channelOf(a.source, a.medium),
      landing: a.landing,
      exit: a.exit,
      pages: Math.max(1, a.pageSet.size),
      converted: a.converted,
      revenue: a.revenue,
      isNew: start <= (firstSeen.get(a.anon) ?? start),
    };
  });

  // 3) Aggregate: channels, sources, landing/exit pages, daily buckets.
  const chan = new Map<Channel, ChannelStat & { anon: Set<string>; newAnon: Set<string> }>();
  const src = new Map<string, SourceStat>();
  const land = new Map<string, PageStat>();
  const exit = new Map<string, PageStat>();
  const day = new Map<number, DayBucket>();

  const uniqueAnon = new Set<string>();
  let orderCount = 0;
  let revenue = 0;
  let pagesTotal = 0;
  let bounceTotal = 0;
  let newCount = 0;
  let newConvNum = 0;
  let retConvNum = 0;
  let newTot = 0;
  let retTot = 0;

  for (const s of sessions) {
    uniqueAnon.add(s.anon);
    pagesTotal += s.pages;
    const bounced = s.pages <= 1;
    if (bounced) bounceTotal++;
    if (s.isNew) newCount++;
    if (s.converted) {
      orderCount++;
      revenue += s.revenue;
    }
    if (s.isNew) {
      newTot++;
      if (s.converted) newConvNum++;
    } else {
      retTot++;
      if (s.converted) retConvNum++;
    }

    // Channel
    let c = chan.get(s.channel);
    if (!c) {
      c = {
        channel: s.channel,
        sessions: 0,
        visitors: 0,
        newVisitors: 0,
        orders: 0,
        conversion: 0,
        revenue: 0,
        share: 0,
        anon: new Set<string>(),
        newAnon: new Set<string>(),
      };
      chan.set(s.channel, c);
    }
    c.sessions++;
    c.anon.add(s.anon);
    if (s.isNew) c.newAnon.add(s.anon);
    if (s.converted) {
      c.orders++;
      c.revenue += s.revenue;
    }

    // Source / referrer
    const skey = `${s.source} / ${s.medium}`;
    let so = src.get(skey);
    if (!so) {
      so = { key: skey, source: s.source, medium: s.medium, channel: s.channel, sessions: 0, orders: 0, conversion: 0, revenue: 0 };
      src.set(skey, so);
    }
    so.sessions++;
    if (s.converted) {
      so.orders++;
      so.revenue += s.revenue;
    }

    // Landing (entry) page
    let lp = land.get(s.landing);
    if (!lp) {
      lp = { path: s.landing, sessions: 0, orders: 0, conversion: 0, revenue: 0, bounces: 0, bounceRate: 0 };
      land.set(s.landing, lp);
    }
    lp.sessions++;
    if (bounced) lp.bounces++;
    if (s.converted) {
      lp.orders++;
      lp.revenue += s.revenue;
    }

    // Exit page
    let ep = exit.get(s.exit);
    if (!ep) {
      ep = { path: s.exit, sessions: 0, orders: 0, conversion: 0, revenue: 0, bounces: 0, bounceRate: 0 };
      exit.set(s.exit, ep);
    }
    ep.sessions++;

    // Daily bucket (by session start day)
    if (s.start) {
      const d = new Date(s.start);
      d.setHours(0, 0, 0, 0);
      const ts = d.getTime();
      let b = day.get(ts);
      if (!b) {
        b = { ts, label: dayLabel(ts), sessions: 0, newVisitors: 0, returning: 0 };
        for (const ch of CHANNELS) b[ch] = 0;
        day.set(ts, b);
      }
      b.sessions = (b.sessions as number) + 1;
      b[s.channel] = ((b[s.channel] as number) ?? 0) + 1;
      if (s.isNew) b.newVisitors = (b.newVisitors as number) + 1;
      else b.returning = (b.returning as number) + 1;
    }
  }

  const totalSessions = sessions.length;
  const channels = [...chan.values()]
    .map((c) => ({
      channel: c.channel,
      sessions: c.sessions,
      visitors: c.anon.size,
      newVisitors: c.newAnon.size,
      orders: c.orders,
      conversion: c.sessions ? c.orders / c.sessions : 0,
      revenue: c.revenue,
      share: totalSessions ? c.sessions / totalSessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const sources = [...src.values()]
    .map((s) => ({ ...s, conversion: s.sessions ? s.orders / s.sessions : 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const landing = [...land.values()]
    .map((p) => ({ ...p, conversion: p.sessions ? p.orders / p.sessions : 0, bounceRate: p.sessions ? p.bounces / p.sessions : 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const exits = [...exit.values()]
    .map((p) => ({ ...p, conversion: p.sessions ? p.orders / p.sessions : 0, bounceRate: 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const daily = [...day.values()].sort((a, b) => a.ts - b.ts);

  return {
    sessions: totalSessions,
    visitors: uniqueAnon.size,
    newVisitors: newCount,
    returningVisitors: totalSessions - newCount,
    orders: orderCount,
    conversion: totalSessions ? orderCount / totalSessions : 0,
    revenue,
    avgPagesPerSession: totalSessions ? pagesTotal / totalSessions : 0,
    bounceRate: totalSessions ? bounceTotal / totalSessions : 0,
    channels,
    sources,
    landing,
    exits,
    daily,
    newReturningConv: {
      newConv: newTot ? newConvNum / newTot : 0,
      returningConv: retTot ? retConvNum / retTot : 0,
    },
  };
}

/** Fill any gaps between the first and last day so the time series is continuous. */
export function fillDailyGaps(daily: DayBucket[]): DayBucket[] {
  if (daily.length < 2) return daily;
  const out: DayBucket[] = [];
  const first = daily[0].ts;
  const last = daily[daily.length - 1].ts;
  const byTs = new Map(daily.map((d) => [d.ts, d]));
  for (let ts = first; ts <= last; ts += DAY) {
    const hit = byTs.get(ts);
    if (hit) {
      out.push(hit);
    } else {
      const empty: DayBucket = { ts, label: dayLabel(ts), sessions: 0, newVisitors: 0, returning: 0 };
      for (const ch of CHANNELS) empty[ch] = 0;
      out.push(empty);
    }
  }
  return out;
}
