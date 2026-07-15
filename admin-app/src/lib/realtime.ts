/**
 * Real-time visitor feed: who is on the site right now and what they just did.
 *
 * "Now" is injected so the view can re-derive against a ticking clock without
 * refetching. Active sessions are those with an event inside `activeWindowMs`
 * (default 5 min). Each recent event is enriched with a friendly action label,
 * page, product, device + location (from metadata / UA) and how long ago it was.
 */
import type { TelemetryEvent } from "./ecommerce";
import { evName, evType, metaOf, metaPick, pagePath, productOf, sessionOf, str, timeOf } from "./telemetryFields";

export interface LiveEvent {
  id: string;
  sessionId: string;
  shortSession: string;
  action: string; // friendly label
  kind: LiveKind;
  page: string;
  product: string;
  device: string;
  location: string;
  t: number; // epoch ms
  agoMs: number;
}

export type LiveKind = "view" | "click" | "search" | "cart" | "checkout" | "order" | "rage" | "outage" | "other";

export interface ActiveSession {
  sessionId: string;
  shortSession: string;
  lastAction: string;
  page: string;
  device: string;
  location: string;
  events: number;
  lastT: number;
  agoMs: number;
  hasOrder: boolean;
}

export interface RealtimeSummary {
  now: number;
  activeSessions: ActiveSession[];
  activeCount: number;
  recent: LiveEvent[];
  perMinute: { minute: number; count: number }[]; // last 30 min, oldest first
  eventsLastHour: number;
  ordersToday: number;
}

function kindOf(e: TelemetryEvent): { kind: LiveKind; action: string } {
  const name = evName(e);
  const type = evType(e);
  const m = metaOf(e);
  if (name === "ai_outage") return { kind: "outage", action: `AI outage · ${str(metaPick(m, "service"))}` };
  if (metaPick(m, "rage", "dead", "noResponse")) return { kind: "rage", action: "Rage-clicked" };
  if (/^order$|purchase|order_?placed|transaction/.test(name)) return { kind: "order", action: "Placed an order" };
  if (/checkout|payment|billing/.test(name)) return { kind: "checkout", action: "Started checkout" };
  if (/add_?to_?cart|cart_?add|added_?to_?bag/.test(name)) return { kind: "cart", action: "Added to cart" };
  if (/search|query|lookup/.test(name) || type === "search") {
    const q = str(metaPick(m, "query", "q", "term")) || str(e.elementText);
    return { kind: "search", action: q ? `Searched "${q}"` : "Searched" };
  }
  if (type === "click" || type === "tap" || /click|tap|press/.test(name)) {
    const label = str(e.elementText ?? e.element_text) || str(e.elementId ?? e.element_id);
    return { kind: "click", action: label ? `Clicked "${label}"` : "Clicked" };
  }
  if (/product_?view|view_?product|pdp/.test(name)) {
    const p = str(metaPick(m, "productName", "name")) || str(e.elementText);
    return { kind: "view", action: p ? `Viewing ${p}` : "Viewing product" };
  }
  if (/page_?view|visit|session_?start|screen_?view/.test(name) || type === "view")
    return { kind: "view", action: "Viewing page" };
  if (/scroll/.test(name)) return { kind: "other", action: "Scrolling" };
  if (/hover|move|dwell/.test(name)) return { kind: "other", action: "Reading" };
  return { kind: "other", action: name || "Active" };
}

function deviceOf(e: TelemetryEvent, m: Record<string, unknown>): string {
  const d = str(metaPick(m, "device", "deviceType", "platform"));
  if (d) return d;
  const ua = str(e.userAgent ?? e.user_agent).toLowerCase();
  if (!ua) return "unknown";
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  return "desktop";
}

function locationOf(m: Record<string, unknown>): string {
  const city = str(metaPick(m, "city", "geoCity"));
  const country = str(metaPick(m, "country", "countryCode", "geoCountry"));
  return [city, country].filter(Boolean).join(", ") || "—";
}

function shortId(s: string): string {
  const cleaned = s.replace(/[^a-z0-9]/gi, "");
  return cleaned.slice(-4).toUpperCase() || s.slice(0, 4);
}

export function buildRealtime(
  events: TelemetryEvent[],
  now = Date.now(),
  opts: { activeWindowMs?: number; recentLimit?: number } = {},
): RealtimeSummary {
  const activeWindowMs = opts.activeWindowMs ?? 5 * 60_000;
  const recentLimit = opts.recentLimit ?? 60;

  const live: LiveEvent[] = [];
  const sessionMap = new Map<string, ActiveSession>();
  const perMin = new Map<number, number>();
  let eventsLastHour = 0;
  let ordersToday = 0;
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  events.forEach((e, i) => {
    const t = timeOf(e);
    if (!Number.isFinite(t)) return;
    const ago = now - t;
    const sk = sessionOf(e, i);
    const m = metaOf(e);
    const { kind, action } = kindOf(e);
    const device = deviceOf(e, m);
    const location = locationOf(m);
    const page = pagePath(e);

    if (ago <= 60 * 60_000 && ago >= 0) {
      eventsLastHour++;
      const minute = Math.floor(ago / 60_000);
      if (minute < 30) perMin.set(minute, (perMin.get(minute) ?? 0) + 1);
    }
    if (kind === "order" && t >= dayStart.getTime()) ordersToday++;

    live.push({
      id: `${sk}-${i}`,
      sessionId: sk,
      shortSession: shortId(sk),
      action,
      kind,
      page,
      product: productOf(e),
      device,
      location,
      t,
      agoMs: ago,
    });

    // Track the most-recent state per active session.
    if (ago <= activeWindowMs && ago >= 0) {
      const cur = sessionMap.get(sk);
      if (!cur || t > cur.lastT) {
        sessionMap.set(sk, {
          sessionId: sk,
          shortSession: shortId(sk),
          lastAction: action,
          page,
          device,
          location,
          events: (cur?.events ?? 0) + 1,
          lastT: t,
          agoMs: ago,
          hasOrder: (cur?.hasOrder ?? false) || kind === "order",
        });
      } else {
        cur.events++;
        if (kind === "order") cur.hasOrder = true;
      }
    }
  });

  live.sort((a, b) => b.t - a.t);
  const activeSessions = [...sessionMap.values()].sort((a, b) => a.agoMs - b.agoMs);
  const perMinute = Array.from({ length: 30 }, (_, k) => ({
    minute: 29 - k,
    count: perMin.get(29 - k) ?? 0,
  }));

  return {
    now,
    activeSessions,
    activeCount: activeSessions.length,
    recent: live.slice(0, recentLimit),
    perMinute,
    eventsLastHour,
    ordersToday,
  };
}
