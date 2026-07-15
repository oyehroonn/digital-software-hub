/**
 * Traffic source / campaign attribution.
 *
 * First-touch model: each session is attributed to the source/medium/campaign of
 * its EARLIEST event (the landing hit), read from UTM params or a referrer host
 * in metadata. A session "converts" if it fired any order/purchase event; revenue
 * is joined from the Orders sheet by session when possible, else estimated from
 * order-event metadata. Missing UTMs degrade gracefully — a bare referrer host is
 * mapped to a channel, and no referrer at all becomes "(direct)".
 */
import type { Order, TelemetryEvent } from "./ecommerce";
import { evName, metaOf, metaPick, num, pick, sessionOf, str, timeOf } from "./telemetryFields";

export interface ChannelStat {
  key: string; // source / medium
  source: string;
  medium: string;
  sessions: number;
  orders: number;
  conversion: number; // orders / sessions
  revenue: number;
}

export interface CampaignStat {
  campaign: string;
  source: string;
  medium: string;
  sessions: number;
  orders: number;
  conversion: number;
  revenue: number;
}

export interface AttributionSummary {
  channels: ChannelStat[];
  campaigns: CampaignStat[];
  sessions: number;
  attributed: number; // sessions with a known (non-direct) source
  orders: number;
  revenue: number;
}

interface SessionAttr {
  source: string;
  medium: string;
  campaign: string;
  t: number;
  converted: boolean;
  revenue: number;
}

/** Map a referrer URL/host to a coarse channel when UTMs are absent. */
function channelFromReferrer(ref: string): { source: string; medium: string } | null {
  if (!ref) return null;
  let host = ref;
  try {
    host = new URL(ref).hostname;
  } catch {
    /* keep raw */
  }
  host = host.replace(/^www\./, "").toLowerCase();
  if (!host) return null;
  if (/google\./.test(host)) return { source: "google", medium: "organic" };
  if (/bing\./.test(host)) return { source: "bing", medium: "organic" };
  if (/duckduckgo\./.test(host)) return { source: "duckduckgo", medium: "organic" };
  if (/facebook\.|fb\.|l\.facebook/.test(host)) return { source: "facebook", medium: "social" };
  if (/instagram\./.test(host)) return { source: "instagram", medium: "social" };
  if (/linkedin\.|lnkd\./.test(host)) return { source: "linkedin", medium: "social" };
  if (/t\.co|twitter\.|x\.com/.test(host)) return { source: "twitter", medium: "social" };
  if (/youtube\./.test(host)) return { source: "youtube", medium: "social" };
  if (/reddit\./.test(host)) return { source: "reddit", medium: "social" };
  return { source: host, medium: "referral" };
}

function attrOf(e: TelemetryEvent): { source: string; medium: string; campaign: string } {
  const m = metaOf(e);
  const source = str(metaPick(m, "utm_source", "utmSource", "source", "utm_src"));
  const medium = str(metaPick(m, "utm_medium", "utmMedium", "medium"));
  const campaign = str(metaPick(m, "utm_campaign", "utmCampaign", "campaign", "utm_camp"));
  const referrer = str(metaPick(m, "referrer", "referer", "ref", "document_referrer"));
  if (source) return { source: source.toLowerCase(), medium: (medium || "referral").toLowerCase(), campaign };
  const fromRef = channelFromReferrer(referrer);
  if (fromRef) return { ...fromRef, campaign };
  return { source: "(direct)", medium: "none", campaign };
}

function isOrder(e: TelemetryEvent): boolean {
  return /^order$|purchase|order_?placed|order_?created|order_?complete|transaction|checkout_?complete/.test(
    evName(e),
  );
}

function orderRevenue(e: TelemetryEvent): number {
  const m = metaOf(e);
  const price = num(metaPick(m, "price", "value", "total", "amount", "revenue")) ?? 0;
  const qty = num(metaPick(m, "quantity", "qty", "count")) ?? 1;
  return price * qty;
}

export function buildAttribution(events: TelemetryEvent[], orders: Order[] = []): AttributionSummary {
  // Revenue per session id from the Orders sheet, when orders carry a session.
  const revBySession = new Map<string, number>();
  for (const o of orders) {
    const sid = str(pick(o as unknown as TelemetryEvent, "sessionId", "session_id", "anonymousId", "anonymous_id"));
    if (!sid) continue;
    const price = num(o.price) ?? 0;
    const qty = num(o.quantity) ?? 1;
    revBySession.set(sid, (revBySession.get(sid) ?? 0) + price * qty);
  }

  const sessions = new Map<string, SessionAttr>();
  events.forEach((e, i) => {
    const sk = sessionOf(e, i);
    const t = timeOf(e);
    let s = sessions.get(sk);
    if (!s) {
      const a = attrOf(e);
      s = { source: a.source, medium: a.medium, campaign: a.campaign, t: Number.isFinite(t) ? t : Infinity, converted: false, revenue: 0 };
      sessions.set(sk, s);
    } else if (Number.isFinite(t) && t < s.t) {
      // Earlier event → this is the true first touch.
      const a = attrOf(e);
      // Only overwrite attribution if this earlier event actually carries one.
      if (a.source !== "(direct)" || (!s.source || s.source === "(direct)")) {
        s.source = a.source;
        s.medium = a.medium;
        s.campaign = a.campaign;
      }
      s.t = t;
    }
    if (isOrder(e)) {
      s.converted = true;
      const rev = revBySession.get(sk) ?? orderRevenue(e);
      s.revenue = Math.max(s.revenue, rev);
    }
  });

  const chan = new Map<string, ChannelStat>();
  const camp = new Map<string, CampaignStat>();
  let attributed = 0;
  let totalOrders = 0;
  let totalRevenue = 0;

  for (const s of sessions.values()) {
    if (s.source !== "(direct)") attributed++;
    const ckey = `${s.source} / ${s.medium}`;
    let c = chan.get(ckey);
    if (!c) {
      c = { key: ckey, source: s.source, medium: s.medium, sessions: 0, orders: 0, conversion: 0, revenue: 0 };
      chan.set(ckey, c);
    }
    c.sessions++;
    if (s.converted) {
      c.orders++;
      c.revenue += s.revenue;
      totalOrders++;
      totalRevenue += s.revenue;
    }

    if (s.campaign) {
      const pkey = `${s.campaign}::${s.source}`;
      let p = camp.get(pkey);
      if (!p) {
        p = { campaign: s.campaign, source: s.source, medium: s.medium, sessions: 0, orders: 0, conversion: 0, revenue: 0 };
        camp.set(pkey, p);
      }
      p.sessions++;
      if (s.converted) {
        p.orders++;
        p.revenue += s.revenue;
      }
    }
  }

  const channels = [...chan.values()]
    .map((c) => ({ ...c, conversion: c.sessions ? c.orders / c.sessions : 0 }))
    .sort((a, b) => b.sessions - a.sessions);
  const campaigns = [...camp.values()]
    .map((c) => ({ ...c, conversion: c.sessions ? c.orders / c.sessions : 0 }))
    .sort((a, b) => b.orders - a.orders || b.sessions - a.sessions);

  return {
    channels,
    campaigns,
    sessions: sessions.size,
    attributed,
    orders: totalOrders,
    revenue: totalRevenue,
  };
}
