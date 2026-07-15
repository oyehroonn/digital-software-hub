/**
 * Geo / location analytics aggregation for the Analytics area.
 *
 * Turns the STABLE Telemetry + Orders sheets into region rollups:
 *   • visitors / events per country & city  — derived from telemetry, where the
 *     region comes from event `metadata.country` / `metadata.city` (the shop
 *     tags page_view hits with a coarse geo), attributed across the whole
 *     session; when NO telemetry carries geo we fall back to grouping ORDERS
 *     (which always have city/country) so the map still lights up.
 *   • orders / revenue per country & city    — from the Orders sheet.
 *   • revenue-by-region (continent) rollup.
 *   • a per-day time trend (visitors + orders + revenue), globally or filtered
 *     to one selected country.
 *
 * Everything is pure + deterministic given its inputs, so it composes with the
 * deterministic seed and never throws (bad rows are skipped, not fatal).
 */
import type { Order, TelemetryEvent } from "./ecommerce";

export interface GeoCountry {
  iso2: string;
  name: string;
  continent: string;
  lat: number;
  lng: number;
}

/** iso2 -> [name, continent, lat, lng]. A pragmatic ~70-country atlas. */
const ATLAS: Record<string, [string, string, number, number]> = {
  US: ["United States", "N. America", 39.8, -98.6],
  CA: ["Canada", "N. America", 56.1, -106.3],
  MX: ["Mexico", "N. America", 23.6, -102.5],
  BR: ["Brazil", "S. America", -14.2, -51.9],
  AR: ["Argentina", "S. America", -38.4, -63.6],
  CL: ["Chile", "S. America", -35.7, -71.5],
  CO: ["Colombia", "S. America", 4.6, -74.3],
  PE: ["Peru", "S. America", -9.2, -75.0],
  GB: ["United Kingdom", "Europe", 54.4, -2.9],
  IE: ["Ireland", "Europe", 53.4, -8.2],
  FR: ["France", "Europe", 46.2, 2.2],
  DE: ["Germany", "Europe", 51.2, 10.5],
  ES: ["Spain", "Europe", 40.5, -3.7],
  PT: ["Portugal", "Europe", 39.4, -8.2],
  IT: ["Italy", "Europe", 41.9, 12.6],
  NL: ["Netherlands", "Europe", 52.1, 5.3],
  BE: ["Belgium", "Europe", 50.5, 4.5],
  CH: ["Switzerland", "Europe", 46.8, 8.2],
  AT: ["Austria", "Europe", 47.5, 14.6],
  SE: ["Sweden", "Europe", 60.1, 18.6],
  NO: ["Norway", "Europe", 60.5, 8.5],
  DK: ["Denmark", "Europe", 56.3, 9.5],
  FI: ["Finland", "Europe", 61.9, 25.7],
  PL: ["Poland", "Europe", 51.9, 19.1],
  CZ: ["Czechia", "Europe", 49.8, 15.5],
  RO: ["Romania", "Europe", 45.9, 24.9],
  GR: ["Greece", "Europe", 39.1, 21.8],
  RU: ["Russia", "Europe", 61.5, 90.3],
  UA: ["Ukraine", "Europe", 48.4, 31.2],
  TR: ["Turkey", "Asia", 39.0, 35.2],
  AE: ["United Arab Emirates", "Asia", 23.9, 54.0],
  SA: ["Saudi Arabia", "Asia", 23.9, 45.1],
  QA: ["Qatar", "Asia", 25.4, 51.2],
  KW: ["Kuwait", "Asia", 29.3, 47.5],
  BH: ["Bahrain", "Asia", 26.1, 50.6],
  OM: ["Oman", "Asia", 21.5, 55.9],
  IL: ["Israel", "Asia", 31.0, 34.9],
  JO: ["Jordan", "Asia", 30.6, 36.2],
  LB: ["Lebanon", "Asia", 33.9, 35.9],
  EG: ["Egypt", "Africa", 26.8, 30.8],
  ZA: ["South Africa", "Africa", -30.6, 22.9],
  NG: ["Nigeria", "Africa", 9.1, 8.7],
  KE: ["Kenya", "Africa", -0.02, 37.9],
  MA: ["Morocco", "Africa", 31.8, -7.1],
  GH: ["Ghana", "Africa", 7.9, -1.0],
  IN: ["India", "Asia", 22.6, 78.9],
  PK: ["Pakistan", "Asia", 30.4, 69.3],
  BD: ["Bangladesh", "Asia", 23.7, 90.4],
  LK: ["Sri Lanka", "Asia", 7.9, 80.8],
  CN: ["China", "Asia", 35.9, 104.2],
  HK: ["Hong Kong", "Asia", 22.3, 114.2],
  TW: ["Taiwan", "Asia", 23.7, 121.0],
  JP: ["Japan", "Asia", 36.2, 138.3],
  KR: ["South Korea", "Asia", 35.9, 127.8],
  SG: ["Singapore", "Asia", 1.35, 103.8],
  MY: ["Malaysia", "Asia", 4.2, 102.0],
  ID: ["Indonesia", "Asia", -0.8, 113.9],
  TH: ["Thailand", "Asia", 15.9, 101.0],
  VN: ["Vietnam", "Asia", 14.1, 108.3],
  PH: ["Philippines", "Asia", 12.9, 121.8],
  AU: ["Australia", "Oceania", -25.3, 133.8],
  NZ: ["New Zealand", "Oceania", -41.0, 173.0],
};

/** Common name / code aliases -> iso2, so free-text order.country resolves. */
const ALIASES: Record<string, string> = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", britain: "GB", "great britain": "GB", england: "GB", scotland: "GB", wales: "GB",
  uae: "AE", "u.a.e.": "AE", emirates: "AE", dubai: "AE", "abu dhabi": "AE",
  ksa: "SA", "saudi": "SA",
  "south korea": "KR", korea: "KR", "republic of korea": "KR",
  holland: "NL", "the netherlands": "NL",
  "czech republic": "CZ", deutschland: "DE", españa: "ES",
  "hong kong sar": "HK", "viet nam": "VN",
};

/** iso2 (or full/aliased name) -> canonical GeoCountry, if known. */
export function resolveCountry(raw?: string | null): GeoCountry | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const up = s.toUpperCase();
  if (ATLAS[up]) return { iso2: up, name: ATLAS[up][0], continent: ATLAS[up][1], lat: ATLAS[up][2], lng: ATLAS[up][3] };
  const low = s.toLowerCase();
  // exact name match
  for (const [iso2, v] of Object.entries(ATLAS)) {
    if (v[0].toLowerCase() === low) return { iso2, name: v[0], continent: v[1], lat: v[2], lng: v[3] };
  }
  const aliased = ALIASES[low];
  if (aliased && ATLAS[aliased]) {
    const v = ATLAS[aliased];
    return { iso2: aliased, name: v[0], continent: v[1], lat: v[2], lng: v[3] };
  }
  return undefined;
}

/** Regional-indicator flag emoji for a 2-letter code (🏳️ when unknown). */
export function flagEmoji(iso2?: string): string {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return "🏳️";
  const cc = iso2.toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Equirectangular projection of lat/lng into a [0..w] × [0..h] box. */
export function project(lat: number, lng: number, w: number, h: number): { x: number; y: number } {
  return { x: ((lng + 180) / 360) * w, y: ((90 - lat) / 180) * h };
}

export interface CityStat {
  city: string;
  iso2: string;
  countryName: string;
  visitors: number;
  orders: number;
  revenue: number;
}

export interface CountryStat extends GeoCountry {
  flag: string;
  visitors: number;
  events: number;
  orders: number;
  revenue: number;
  cities: CityStat[];
}

export interface ContinentStat {
  continent: string;
  visitors: number;
  orders: number;
  revenue: number;
  countries: number;
}

export interface GeoTrendPoint {
  ts: number;
  label: string;
  visitors: number;
  orders: number;
  revenue: number;
}

export interface GeoAgg {
  countries: CountryStat[];
  cities: CityStat[];
  continents: ContinentStat[];
  trend: GeoTrendPoint[];
  totals: { visitors: number; events: number; orders: number; revenue: number; countries: number; cities: number };
  currency: string;
  /** True when at least one telemetry event carried a resolvable region. */
  telemetryGeo: boolean;
  /** Which source drove visitor counts. */
  visitorSource: "telemetry" | "orders";
}

type MetaBag = Record<string, unknown>;

function metaOf(ev: TelemetryEvent): MetaBag {
  const m = ev.metadata;
  if (m && typeof m === "object") return m as MetaBag;
  if (typeof m === "string") {
    try {
      const p = JSON.parse(m);
      return p && typeof p === "object" ? (p as MetaBag) : {};
    } catch {
      return {};
    }
  }
  return {};
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function orderRevenue(o: Order): number {
  const price = num(o.price);
  const qty = num(o.quantity) || 1;
  return price * qty;
}

function dayKey(ts: number): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Build the full geo rollup. `days` bounds the time-trend window; `country`
 * (iso2) optionally filters the trend to one country.
 */
export function buildGeo(
  events: TelemetryEvent[],
  orders: Order[],
  opts: { days?: number; country?: string | null } = {},
): GeoAgg {
  const days = opts.days ?? 30;
  const filterIso = opts.country ?? null;

  // ---- 1. Session -> region from telemetry metadata (first resolvable hit) ----
  const sessionGeo = new Map<string, { iso2: string; city: string }>();
  const sessionSeen = new Set<string>();
  let telemetryGeo = false;

  for (const ev of events) {
    const sid = str(ev.sessionId) || str(ev.anonymousId);
    if (sid) sessionSeen.add(sid);
    if (!sid || sessionGeo.has(sid)) continue;
    const m = metaOf(ev);
    const c = resolveCountry(str(m.country) || str(m.countryCode) || str(m.geo_country));
    if (c) {
      telemetryGeo = true;
      const city = str(m.city) || str(m.geo_city);
      sessionGeo.set(sid, { iso2: c.iso2, city });
    }
  }

  const useTelemetry = telemetryGeo && sessionGeo.size > 0;

  // Country accumulator keyed by iso2.
  interface Acc {
    geo: GeoCountry;
    visitors: Set<string>;
    ordersVisitors: Set<string>;
    events: number;
    orders: number;
    revenue: number;
    cities: Map<string, { visitors: Set<string>; orders: number; revenue: number }>;
  }
  const acc = new Map<string, Acc>();
  const ensure = (geo: GeoCountry): Acc => {
    let a = acc.get(geo.iso2);
    if (!a) {
      a = { geo, visitors: new Set(), ordersVisitors: new Set(), events: 0, orders: 0, revenue: 0, cities: new Map() };
      acc.set(geo.iso2, a);
    }
    return a;
  };
  const ensureCity = (a: Acc, city: string) => {
    const key = city || "—";
    let c = a.cities.get(key);
    if (!c) {
      c = { visitors: new Set(), orders: 0, revenue: 0 };
      a.cities.set(key, c);
    }
    return c;
  };

  // ---- 2. Visitors + events from telemetry (when geo present) ----
  if (useTelemetry) {
    for (const ev of events) {
      const sid = str(ev.sessionId) || str(ev.anonymousId);
      const g = sid ? sessionGeo.get(sid) : undefined;
      if (!g) continue;
      const resolved = resolveCountry(g.iso2);
      if (!resolved) continue;
      const a = ensure(resolved);
      a.events += 1;
      if (sid) a.visitors.add(sid);
      if (g.city) ensureCity(a, g.city).visitors.add(sid || String(a.events));
    }
  }

  // ---- 3. Orders + revenue (always from the Orders sheet) ----
  let currency = "USD";
  for (const o of orders) {
    const resolved = resolveCountry(str(o.country));
    if (!resolved) continue;
    if (o.currency) currency = String(o.currency);
    const a = ensure(resolved);
    const rev = orderRevenue(o);
    a.orders += 1;
    a.revenue += rev;
    const custKey = str(o.email) || str(o.customerName) || `o${a.orders}`;
    a.ordersVisitors.add(custKey);
    const city = str(o.city);
    if (city) {
      const c = ensureCity(a, city);
      c.orders += 1;
      c.revenue += rev;
      c.visitors.add(custKey);
    }
  }

  // If telemetry carried no geo, visitors fall back to distinct order customers.
  const visitorSource: "telemetry" | "orders" = useTelemetry ? "telemetry" : "orders";

  // ---- 4. Materialize country + city rows ----
  const countries: CountryStat[] = [];
  for (const a of acc.values()) {
    const visitors = useTelemetry ? a.visitors.size : a.ordersVisitors.size;
    const cities: CityStat[] = [...a.cities.entries()].map(([city, c]) => ({
      city,
      iso2: a.geo.iso2,
      countryName: a.geo.name,
      visitors: c.visitors.size,
      orders: c.orders,
      revenue: c.revenue,
    }));
    cities.sort((x, y) => y.revenue - x.revenue || y.visitors - x.visitors);
    countries.push({
      ...a.geo,
      flag: flagEmoji(a.geo.iso2),
      visitors,
      events: a.events,
      orders: a.orders,
      revenue: a.revenue,
      cities,
    });
  }
  countries.sort((x, y) => y.visitors - x.visitors || y.revenue - x.revenue || y.orders - x.orders);

  const cities = countries
    .flatMap((c) => c.cities)
    .sort((x, y) => y.revenue - x.revenue || y.visitors - x.visitors);

  // ---- 5. Continent rollup ----
  const contMap = new Map<string, ContinentStat>();
  for (const c of countries) {
    let e = contMap.get(c.continent);
    if (!e) {
      e = { continent: c.continent, visitors: 0, orders: 0, revenue: 0, countries: 0 };
      contMap.set(c.continent, e);
    }
    e.visitors += c.visitors;
    e.orders += c.orders;
    e.revenue += c.revenue;
    e.countries += 1;
  }
  const continents = [...contMap.values()].sort((a, b) => b.visitors - a.visitors || b.revenue - a.revenue);

  // ---- 6. Time trend (optionally filtered to one country) ----
  const now = Date.now();
  const from = now - days * 86_400_000;
  const buckets = new Map<number, GeoTrendPoint>();
  const seenPerDay = new Map<number, Set<string>>();

  const bucket = (ts: number): GeoTrendPoint => {
    const k = dayKey(ts);
    let b = buckets.get(k);
    if (!b) {
      b = {
        ts: k,
        label: new Date(k).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        visitors: 0,
        orders: 0,
        revenue: 0,
      };
      buckets.set(k, b);
      seenPerDay.set(k, new Set());
    }
    return b;
  };

  if (useTelemetry) {
    for (const ev of events) {
      const t = ev.timestamp ? Date.parse(String(ev.timestamp)) : NaN;
      if (Number.isNaN(t) || t < from) continue;
      const sid = str(ev.sessionId) || str(ev.anonymousId);
      const g = sid ? sessionGeo.get(sid) : undefined;
      if (!g) continue;
      if (filterIso && g.iso2 !== filterIso) continue;
      const b = bucket(t);
      const seen = seenPerDay.get(b.ts)!;
      if (sid && !seen.has(sid)) {
        seen.add(sid);
        b.visitors += 1;
      }
    }
  }
  for (const o of orders) {
    const t = o.timestamp ? Date.parse(String(o.timestamp)) : NaN;
    if (Number.isNaN(t) || t < from) continue;
    const resolved = resolveCountry(str(o.country));
    if (filterIso && (!resolved || resolved.iso2 !== filterIso)) continue;
    const b = bucket(t);
    b.orders += 1;
    b.revenue += orderRevenue(o);
    if (!useTelemetry) {
      // Orders-only mode: approximate daily visitors by distinct customers.
      const seen = seenPerDay.get(b.ts)!;
      const custKey = str(o.email) || str(o.customerName) || `o${b.orders}`;
      if (!seen.has(custKey)) {
        seen.add(custKey);
        b.visitors += 1;
      }
    }
  }
  const trend = [...buckets.values()].sort((a, b) => a.ts - b.ts);

  const totals = {
    visitors: countries.reduce((s, c) => s + c.visitors, 0),
    events: countries.reduce((s, c) => s + c.events, 0),
    orders: countries.reduce((s, c) => s + c.orders, 0),
    revenue: countries.reduce((s, c) => s + c.revenue, 0),
    countries: countries.length,
    cities: cities.length,
  };

  return { countries, cities, continents, trend, totals, currency, telemetryGeo, visitorSource };
}
