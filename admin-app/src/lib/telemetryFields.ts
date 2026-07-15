/**
 * Small, dependency-light field readers shared across the analytics
 * derivations (rage clicks, search, attribution, realtime, drop-off).
 *
 * Every reader tolerates both the normalized camelCase TelemetryEvent shape and
 * the raw snake_case sheet columns (event_name / page_url / metadata_json …), so
 * a derivation lights up whether or not `ecommerce.ts` normalized the rows first.
 */
import type { TelemetryEvent } from "./ecommerce";

/** First non-empty value across a set of aliases. */
export function pick(e: TelemetryEvent, ...keys: string[]): unknown {
  const bag = e as Record<string, unknown>;
  for (const k of keys) {
    const v = bag[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

export function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Parsed metadata object (handles metadata_json strings + camel/snake aliases). */
export function metaOf(e: TelemetryEvent): Record<string, unknown> {
  const m = pick(e, "metadata", "metadata_json", "meta", "properties");
  if (m && typeof m === "object") return m as Record<string, unknown>;
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return {};
}

/** First present value across meta keys. */
export function metaPick(m: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = m[k];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

/** Lower-cased event name (event / eventType), for loose matching. */
export function evName(e: TelemetryEvent): string {
  return str(pick(e, "event", "event_name", "eventName", "eventType", "event_type")).toLowerCase();
}

export function evType(e: TelemetryEvent): string {
  return str(pick(e, "eventType", "event_type", "interaction_type")).toLowerCase();
}

/** Stable session identity; falls back to anonymous id then a positional key. */
export function sessionOf(e: TelemetryEvent, i = 0): string {
  const k = pick(e, "sessionId", "session_id", "anonymousId", "anonymous_id");
  return k != null && String(k) !== "" ? String(k) : `__ev${i}`;
}

/** Epoch ms for an event's timestamp, or NaN. */
export function timeOf(e: TelemetryEvent): number {
  return Date.parse(str(pick(e, "timestamp", "received_at", "receivedAt", "time")));
}

/** Origin-less path (query + hash stripped) so pages group together. */
export function pagePath(e: TelemetryEvent): string {
  const raw = str(pick(e, "pageUrl", "page_url", "url", "href")).trim();
  if (!raw) return "(unknown)";
  try {
    const u = new URL(raw, "http://x");
    let p = u.pathname || "/";
    if (p.length > 1) p = p.replace(/\/+$/, "") || "/";
    return p;
  } catch {
    return raw.split(/[?#]/)[0] || "/";
  }
}

export function productOf(e: TelemetryEvent): string {
  return str(pick(e, "productId", "product_id")).trim();
}
