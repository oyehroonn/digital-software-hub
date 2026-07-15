/**
 * Derives the sales funnel and the ai_outage feed from raw telemetry events.
 * Event names are matched loosely so minor naming drift on the site doesn't
 * silently zero out a funnel stage.
 */
import type { TelemetryEvent } from "./ecommerce";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  rate: number; // fraction of the first stage
}

export interface OutageEvent {
  timestamp?: string;
  service: string;
  feature: string;
  error: string;
  sessionId?: string;
}

const STAGE_MATCHERS: { key: string; label: string; test: (e: string) => boolean }[] = [
  { key: "view", label: "Page views", test: (e) => /page_?view|visit|session_?start/.test(e) },
  { key: "product", label: "Product views", test: (e) => /product_?view|view_?product|pdp/.test(e) },
  { key: "cart", label: "Add to cart", test: (e) => /add_?to_?cart|cart_?add/.test(e) },
  { key: "checkout", label: "Checkout", test: (e) => /checkout|begin_?checkout/.test(e) },
  { key: "order", label: "Orders", test: (e) => /^order$|purchase|order_?placed|order_?created/.test(e) },
];

export function buildFunnel(events: TelemetryEvent[]): FunnelStage[] {
  const counts = STAGE_MATCHERS.map(() => 0);
  for (const ev of events) {
    const name = String(ev.event ?? ev.eventType ?? "").toLowerCase();
    if (!name) continue;
    STAGE_MATCHERS.forEach((m, i) => {
      if (m.test(name)) counts[i]++;
    });
  }
  const base = counts[0] || 1;
  return STAGE_MATCHERS.map((m, i) => ({
    key: m.key,
    label: m.label,
    count: counts[i],
    rate: counts[i] / base,
  }));
}

export function extractOutages(events: TelemetryEvent[]): OutageEvent[] {
  return events
    .filter((e) => String(e.event ?? "").toLowerCase() === "ai_outage")
    .map((e) => {
      const meta = (typeof e.metadata === "object" && e.metadata ? e.metadata : {}) as Record<
        string,
        unknown
      >;
      return {
        timestamp: e.timestamp,
        service: String(meta.service ?? "unknown"),
        feature: String(meta.feature ?? "unknown"),
        error: String(meta.error ?? ""),
        sessionId: e.sessionId,
      };
    })
    .sort((a, b) => Date.parse(b.timestamp ?? "") - Date.parse(a.timestamp ?? ""));
}

export interface OutageBucket {
  service: string;
  count: number;
}

export function outagesByService(outages: OutageEvent[]): OutageBucket[] {
  const map = new Map<string, number>();
  for (const o of outages) map.set(o.service, (map.get(o.service) ?? 0) + 1);
  return [...map.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count);
}
