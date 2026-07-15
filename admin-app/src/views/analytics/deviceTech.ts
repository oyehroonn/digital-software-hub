/**
 * deviceTech — turn raw telemetry into a device / browser / OS / screen-size
 * picture, plus a mobile-vs-desktop conversion comparison.
 *
 * Everything is derived at the SESSION grain: a visitor's device is fixed for a
 * session, so we fold every event of a session down to one "tech fingerprint"
 * (device type, browser, OS, viewport width) taken from the first event that
 * carries a user_agent / viewport, then aggregate sessions.
 *
 * Sources per the Telemetry sheet:
 *   - user_agent            → browser + OS + (fallback) device type
 *   - metadata_json.device  → authoritative device type when present
 *   - metadata_json viewport→ screen-size bucket (vw / viewport / width…),
 *     NORMALISED to a pixel width; falls back to 1440 (desktop) when absent.
 *   - event === "order"     → session converted (telemetry-attributed, so it
 *     keeps the device fingerprint the Orders sheet can't).
 *
 * Pure + deterministic: same events in → same numbers out, so it works on the
 * deterministic seed before the live read endpoint is deployed.
 */
import type { Order, TelemetryEvent } from "@/lib/ecommerce";

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

export interface TechRow {
  key: string;
  label: string;
  sessions: number;
  orders: number;
  conversion: number; // orders / sessions
  share: number; // sessions / totalSessions
}

export interface DeviceRow extends TechRow {
  device: DeviceType;
  avgEvents: number; // engagement proxy
  avgScroll: number; // mean max scroll-depth %
}

export interface DeviceTech {
  totalSessions: number;
  totalOrders: number; // telemetry-attributed orders
  sheetOrders: number; // orders from the Orders sheet (headline only)
  identifiedUA: number; // sessions we could read a UA / device for
  overallConversion: number;
  devices: DeviceRow[];
  browsers: TechRow[];
  os: TechRow[];
  screens: TechRow[]; // ordered small → large
  perf: DevicePerf[]; // per-device timing / engagement note
  hasTiming: boolean; // true when real load-timing metadata was found
  mobileShare: number;
}

export interface DevicePerf {
  device: DeviceType;
  label: string;
  sessions: number;
  avgLoadMs: number | null; // real page-load timing if telemetry carried it
  avgEvents: number;
  avgScroll: number;
  conversion: number;
}

interface Fingerprint {
  device: DeviceType;
  browser: string;
  os: string;
  vw: number | undefined;
}

const DESKTOP_FALLBACK_VW = 1440;

const SCREEN_BUCKETS: { label: string; max: number }[] = [
  { label: "≤480 · small phone", max: 480 },
  { label: "481–768 · phone", max: 768 },
  { label: "769–1024 · tablet", max: 1024 },
  { label: "1025–1440 · laptop", max: 1440 },
  { label: ">1440 · desktop", max: Infinity },
];

/** Parse a user-agent string into browser + OS + a coarse device type. */
export function parseUA(ua: string): { browser: string; os: string; device: DeviceType } {
  const s = ua || "";
  const l = s.toLowerCase();

  // Browser (order matters — Edge/Opera masquerade as Chrome).
  let browser = "Unknown";
  if (/edg[ea/]/i.test(s)) browser = "Edge";
  else if (/opr\/|opera/i.test(s)) browser = "Opera";
  else if (/samsungbrowser/i.test(s)) browser = "Samsung Internet";
  else if (/firefox|fxios/i.test(s)) browser = "Firefox";
  else if (/chrome|crios|chromium/i.test(s)) browser = "Chrome";
  else if (/safari/i.test(s) && /applewebkit/i.test(s)) browser = "Safari";
  else if (/msie|trident/i.test(s)) browser = "Internet Explorer";

  // OS.
  let os = "Unknown";
  if (/windows nt/i.test(s)) os = "Windows";
  else if (/iphone|ipod/i.test(s)) os = "iOS";
  else if (/ipad/i.test(s)) os = "iPadOS";
  else if (/android/i.test(s)) os = "Android";
  else if (/mac os x|macintosh/i.test(s)) os = "macOS";
  else if (/cros/i.test(s)) os = "ChromeOS";
  else if (/linux/i.test(s)) os = "Linux";

  // Device type from UA (metadata.device overrides this upstream).
  let device: DeviceType = "unknown";
  if (s) {
    if (/ipad|tablet|playbook|silk/i.test(s) || (/android/i.test(s) && !/mobile/i.test(s))) device = "tablet";
    else if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(l)) device = "mobile";
    else device = "desktop";
  }
  return { browser, os, device };
}

function asMeta(m: TelemetryEvent["metadata"]): Record<string, unknown> {
  if (!m) return {};
  if (typeof m === "string") {
    try {
      const p = JSON.parse(m);
      return p && typeof p === "object" ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return m as Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

/** Read a viewport / device pixel width out of event metadata (many aliases). */
function readViewportWidth(meta: Record<string, unknown>): number | undefined {
  return (
    num(meta.vw) ??
    num(meta.viewport) ??
    num(meta.viewportWidth) ??
    num(meta.viewport_width) ??
    num(meta.innerWidth) ??
    num(meta.screenWidth) ??
    num(meta.screen_width) ??
    num(meta.deviceWidth) ??
    num(meta.width) ??
    num(meta.sw)
  );
}

/** Read a page-load / paint timing (ms) out of metadata, if any was sent. */
function readLoadMs(meta: Record<string, unknown>): number | undefined {
  const cand =
    num(meta.loadMs) ??
    num(meta.load_ms) ??
    num(meta.loadTime) ??
    num(meta.pageLoadMs) ??
    num(meta.lcp) ??
    num(meta.fcp) ??
    num(meta.ttfb) ??
    num(meta.latencyMs) ??
    num(meta.perfMs);
  return cand != null && cand > 0 && cand < 120_000 ? cand : undefined;
}

function normDevice(v: unknown): DeviceType | undefined {
  const s = String(v ?? "").toLowerCase();
  if (s === "desktop" || s === "mobile" || s === "tablet") return s;
  return undefined;
}

function screenBucket(vw: number | undefined): number {
  const w = vw ?? DESKTOP_FALLBACK_VW;
  for (let i = 0; i < SCREEN_BUCKETS.length; i++) if (w <= SCREEN_BUCKETS[i].max) return i;
  return SCREEN_BUCKETS.length - 1;
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

interface Sess {
  device: DeviceType;
  browser: string;
  os: string;
  vw: number | undefined;
  ordered: boolean;
  events: number;
  maxScroll: number;
  loadMs: number | undefined;
  hasUA: boolean;
}

export function buildDeviceTech(events: TelemetryEvent[], orders: Order[] = []): DeviceTech {
  const sessions = new Map<string, Sess>();

  for (const e of events) {
    const sid = String(e.sessionId || e.anonymousId || "");
    if (!sid) continue;
    let s = sessions.get(sid);
    if (!s) {
      s = { device: "unknown", browser: "Unknown", os: "Unknown", vw: undefined, ordered: false, events: 0, maxScroll: 0, loadMs: undefined, hasUA: false };
      sessions.set(sid, s);
    }
    s.events++;

    const meta = asMeta(e.metadata);
    const ua = String(e.userAgent || "");

    // Lock the device fingerprint from the first event that carries a UA.
    if (!s.hasUA && ua) {
      const fp: Fingerprint = { ...parseUA(ua), vw: undefined };
      s.browser = fp.browser;
      s.os = fp.os;
      s.device = fp.device;
      s.hasUA = true;
    }
    // metadata.device is authoritative for device type.
    const md = normDevice(meta.device);
    if (md) s.device = md;

    // Viewport width — first seen wins (device is fixed per session).
    if (s.vw == null) {
      const vw = readViewportWidth(meta);
      if (vw != null) s.vw = vw;
    }
    // Load timing — keep the max (worst) seen so the note is honest.
    const lm = readLoadMs(meta);
    if (lm != null) s.loadMs = Math.max(s.loadMs ?? 0, lm);

    // Scroll depth (metadata.depth on scroll events, else y for scroll rows).
    if (String(e.event) === "scroll" || String(e.eventType) === "scroll") {
      const d = num(meta.depth) ?? (typeof e.y === "number" && e.y <= 100 ? e.y : undefined);
      if (d != null) s.maxScroll = Math.max(s.maxScroll, d);
    }
    if (String(e.event) === "order" || String(e.eventType) === "order") s.ordered = true;
  }

  const all = [...sessions.values()];
  const totalSessions = all.length;
  const totalOrders = all.filter((s) => s.ordered).length;
  const identifiedUA = all.filter((s) => s.hasUA).length;

  const tally = (keyOf: (s: Sess) => string, labelOf: (k: string) => string): TechRow[] => {
    const m = new Map<string, { sessions: number; orders: number }>();
    for (const s of all) {
      const k = keyOf(s);
      const e = m.get(k) ?? { sessions: 0, orders: 0 };
      e.sessions++;
      if (s.ordered) e.orders++;
      m.set(k, e);
    }
    return [...m.entries()]
      .map(([key, v]) => ({
        key,
        label: labelOf(key),
        sessions: v.sessions,
        orders: v.orders,
        conversion: v.sessions ? v.orders / v.sessions : 0,
        share: totalSessions ? v.sessions / totalSessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
  };

  // Devices (with engagement metrics baked in).
  const devMap = new Map<DeviceType, { sessions: number; orders: number; events: number; scroll: number; scrollN: number }>();
  for (const s of all) {
    const e = devMap.get(s.device) ?? { sessions: 0, orders: 0, events: 0, scroll: 0, scrollN: 0 };
    e.sessions++;
    e.events += s.events;
    if (s.ordered) e.orders++;
    if (s.maxScroll > 0) {
      e.scroll += s.maxScroll;
      e.scrollN++;
    }
    devMap.set(s.device, e);
  }
  const devices: DeviceRow[] = [...devMap.entries()]
    .map(([device, v]) => ({
      key: device,
      device,
      label: titleCase(device),
      sessions: v.sessions,
      orders: v.orders,
      conversion: v.sessions ? v.orders / v.sessions : 0,
      share: totalSessions ? v.sessions / totalSessions : 0,
      avgEvents: v.sessions ? v.events / v.sessions : 0,
      avgScroll: v.scrollN ? v.scroll / v.scrollN : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  const browsers = tally((s) => s.browser, (k) => k);
  const os = tally((s) => s.os, (k) => k);

  // Screen-size buckets in ascending order.
  const screenCounts = new Array(SCREEN_BUCKETS.length).fill(0).map(() => ({ sessions: 0, orders: 0 }));
  for (const s of all) {
    const b = screenBucket(s.vw);
    screenCounts[b].sessions++;
    if (s.ordered) screenCounts[b].orders++;
  }
  const screens: TechRow[] = SCREEN_BUCKETS.map((b, i) => ({
    key: b.label,
    label: b.label,
    sessions: screenCounts[i].sessions,
    orders: screenCounts[i].orders,
    conversion: screenCounts[i].sessions ? screenCounts[i].orders / screenCounts[i].sessions : 0,
    share: totalSessions ? screenCounts[i].sessions / totalSessions : 0,
  }));

  // Per-device performance / engagement note.
  const hasTiming = all.some((s) => s.loadMs != null);
  const perf: DevicePerf[] = devices
    .filter((d) => d.device !== "unknown")
    .map((d) => {
      const rows = all.filter((s) => s.device === d.device);
      const timed = rows.filter((s) => s.loadMs != null);
      const avgLoadMs = timed.length ? timed.reduce((a, s) => a + (s.loadMs as number), 0) / timed.length : null;
      return {
        device: d.device,
        label: d.label,
        sessions: d.sessions,
        avgLoadMs,
        avgEvents: d.avgEvents,
        avgScroll: d.avgScroll,
        conversion: d.conversion,
      };
    });

  const mobileSessions = devices.filter((d) => d.device === "mobile" || d.device === "tablet").reduce((a, d) => a + d.sessions, 0);

  return {
    totalSessions,
    totalOrders,
    sheetOrders: orders.length,
    identifiedUA,
    overallConversion: totalSessions ? totalOrders / totalSessions : 0,
    devices,
    browsers,
    os,
    screens,
    perf,
    hasTiming,
    mobileShare: totalSessions ? mobileSessions / totalSessions : 0,
  };
}

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export { toNum };
