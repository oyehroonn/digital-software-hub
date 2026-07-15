/**
 * QueryBuilder — the Custom Report / ad-hoc query builder for the Analytics area.
 *
 * Shopify-parity "Custom report" surface: pick one or more METRICS
 * (sessions · unique visitors · clicks · orders · revenue · AOV · conversion
 * rate · units) broken down by ONE DIMENSION (date · product · page · channel ·
 * source · medium · campaign · location · device), narrow it with FILTERS, and
 * the builder renders a results TABLE plus an auto-typed CHART (a line for the
 * date dimension, bars for every categorical dimension). Reports SAVE to a
 * localStorage library and reload with one click.
 *
 * It reads the GLOBAL date-range + compare context (`useDateRange`) so it always
 * respects the range the rest of the suite is on and shows vs-previous deltas —
 * per-metric on the KPI row and per-row (Δ column) in the table. All data comes
 * from the stable Telemetry + Orders sheets via `useAnalyticsData`, with the
 * deterministic seed fallback so it renders before the read endpoint is live.
 *
 * Grain note (honest by construction): sessions / visitors / clicks / conversion
 * are telemetry-derived; orders / revenue / units / AOV come from the Orders
 * sheet. Session-scoped dimensions (source, medium, campaign, channel, device,
 * location) attribute the telemetry side at first-touch; orders attribute via
 * their own columns + the "via <source>/<campaign>" note the storefront stamps,
 * and fall into "(unknown)" for dimensions an order row cannot express (device,
 * page). Native dimensions (date, product, location) line up on both sides.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BookmarkPlus,
  CalendarDays,
  CreditCard,
  DollarSign,
  Download,
  FileText,
  Filter as FilterIcon,
  Gauge,
  Globe,
  Megaphone,
  Monitor,
  MousePointerClick,
  Package,
  Plus,
  Radio,
  Route,
  Save,
  ShoppingCart,
  SlidersHorizontal,
  Table as TableIcon,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { cn, fmtMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { useAnalyticsData } from "./useAnalyticsData";
import { parseUA } from "./deviceTech";
import {
  metaOf,
  metaPick,
  pagePath,
  productOf as productIdOfEvent,
  sessionOf,
  str,
  timeOf,
} from "@/lib/telemetryFields";
import {
  countryOf,
  fieldStr,
  isRefunded,
  netOf,
  qtyOf,
  tsOf,
} from "./reports/salesData";
import {
  AXIS,
  GRID,
  KpiCard,
  PALETTE,
  ReportHeader,
  TOOLTIP,
  deltaOf,
  fmtNum,
} from "./reports/reportKit";
import { DateRangeControls, useDateRange } from "./reports/dateRange";

/* -------------------------------------------------------------------------- */
/* metric + dimension catalogue                                                */
/* -------------------------------------------------------------------------- */
type Metric =
  | "sessions"
  | "visitors"
  | "clicks"
  | "orders"
  | "revenue"
  | "aov"
  | "conv"
  | "units";

type Dimension =
  | "date"
  | "product"
  | "page"
  | "channel"
  | "source"
  | "medium"
  | "campaign"
  | "location"
  | "device";

interface MetricDef {
  key: Metric;
  label: string;
  short: string;
  icon: typeof Activity;
  kind: "int" | "money" | "pct";
  color: string;
  /** true when a bigger number is a better outcome (all of ours are). */
  higherIsBetter: boolean;
}

const METRICS: MetricDef[] = [
  { key: "sessions", label: "Sessions", short: "Sessions", icon: Activity, kind: "int", color: PALETTE.primary, higherIsBetter: true },
  { key: "visitors", label: "Unique visitors", short: "Visitors", icon: Users, kind: "int", color: PALETTE.violet, higherIsBetter: true },
  { key: "clicks", label: "Clicks", short: "Clicks", icon: MousePointerClick, kind: "int", color: PALETTE.ok, higherIsBetter: true },
  { key: "orders", label: "Orders", short: "Orders", icon: ShoppingCart, kind: "int", color: PALETTE.rose, higherIsBetter: true },
  { key: "revenue", label: "Revenue", short: "Revenue", icon: DollarSign, kind: "money", color: PALETTE.revenue, higherIsBetter: true },
  { key: "aov", label: "Avg order value", short: "AOV", icon: CreditCard, kind: "money", color: PALETTE.amber, higherIsBetter: true },
  { key: "conv", label: "Conversion rate", short: "Conv. rate", icon: Gauge, kind: "pct", color: PALETTE.primary, higherIsBetter: true },
  { key: "units", label: "Units sold", short: "Units", icon: Package, kind: "int", color: PALETTE.ok, higherIsBetter: true },
];
const METRIC_BY: Record<Metric, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<Metric, MetricDef>;

interface DimDef {
  key: Dimension;
  label: string;
  icon: typeof Activity;
}
const DIMENSIONS: DimDef[] = [
  { key: "date", label: "Date", icon: CalendarDays },
  { key: "product", label: "Product", icon: Package },
  { key: "page", label: "Page", icon: FileText },
  { key: "channel", label: "Channel", icon: Route },
  { key: "source", label: "Source", icon: Radio },
  { key: "medium", label: "Medium", icon: Megaphone },
  { key: "campaign", label: "Campaign", icon: Megaphone },
  { key: "location", label: "Location", icon: Globe },
  { key: "device", label: "Device", icon: Monitor },
];
const DIM_BY: Record<Dimension, DimDef> = Object.fromEntries(DIMENSIONS.map((d) => [d.key, d])) as Record<Dimension, DimDef>;

type FilterOp = "is" | "not" | "contains";
interface QueryFilter {
  id: string;
  dim: Dimension;
  op: FilterOp;
  value: string;
}

/* -------------------------------------------------------------------------- */
/* attribution helpers                                                         */
/* -------------------------------------------------------------------------- */
const DAY = 86_400_000;

function dayKeyUTC(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** GA-style channel grouping shared by the telemetry and order sides so keys align. */
function classifyChannel(source: string, medium: string): string {
  const s = source.toLowerCase();
  const m = medium.toLowerCase();
  if (s === "(direct)" || (!s && !m) || m === "none") return "Direct";
  if (/organic/.test(m)) return "Organic Search";
  if (/(cpc|ppc|paid)/.test(m) && /google|bing|yahoo/.test(s)) return "Paid Search";
  if (/email/.test(m) || /newsletter|klaviyo|mailchimp/.test(s)) return "Email";
  if (/social/.test(m) || /facebook|linkedin|instagram|twitter|x\.com|youtube|reddit|tiktok/.test(s)) return "Social";
  if (/(cpc|ppc|paid|display|banner)/.test(m)) return "Paid";
  if (/referral/.test(m)) return "Referral";
  return "Other";
}

interface SDims {
  source: string;
  medium: string;
  campaign: string;
  channel: string;
  device: string;
  location: string;
}

/** First-touch session attribution built once from the (windowed) telemetry. */
function buildSessionDims(events: TelemetryEvent[]): Map<string, SDims> {
  const earliest = new Map<string, { t: number; e: TelemetryEvent }>();
  const device = new Map<string, string>();
  const location = new Map<string, string>();

  for (const e of events) {
    const sid = sessionOf(e);
    if (!sid) continue;
    const t = timeOf(e);
    const cur = earliest.get(sid);
    if (!cur || (Number.isFinite(t) && t < cur.t)) {
      earliest.set(sid, { t: Number.isFinite(t) ? t : Infinity, e });
    }
    const m = metaOf(e);
    if (!device.has(sid)) {
      const md = str(m.device).toLowerCase();
      if (md === "desktop" || md === "mobile" || md === "tablet") device.set(sid, md);
      else if (e.userAgent) device.set(sid, parseUA(String(e.userAgent)).device);
    }
    if (!location.has(sid)) {
      const c = str(metaPick(m, "country", "country_code"));
      if (c) location.set(sid, c);
    }
  }

  const out = new Map<string, SDims>();
  for (const [sid, { e }] of earliest) {
    const m = metaOf(e);
    let source = str(metaPick(m, "utm_source", "utmSource", "source")).toLowerCase();
    let medium = str(metaPick(m, "utm_medium", "utmMedium", "medium")).toLowerCase();
    const campaign = str(metaPick(m, "utm_campaign", "utmCampaign", "campaign"));
    if (!source) source = "(direct)";
    if (!medium) medium = source === "(direct)" ? "none" : "referral";
    out.set(sid, {
      source,
      medium,
      campaign,
      channel: classifyChannel(source, medium),
      device: device.get(sid) || "unknown",
      location: location.get(sid) || "(unknown)",
    });
  }
  return out;
}

/* order-side attribution (columns first, then the "via x/y" note the shop stamps) */
function orderProductKey(o: Order): string {
  return fieldStr(o, "productId", "product_id") || fieldStr(o, "productName", "product_name") || "(unknown)";
}
function orderRawSource(o: Order): string {
  const explicit = fieldStr(o, "utm_source", "utmSource", "source");
  if (explicit) return explicit.toLowerCase();
  const m = /via\s+([a-z0-9_.-]+)/i.exec(String(o.notes ?? ""));
  return (m?.[1] ?? "(direct)").toLowerCase();
}
function orderCampaign(o: Order): string {
  const explicit = fieldStr(o, "utm_campaign", "utmCampaign", "campaign");
  if (explicit) return explicit;
  const m = /via\s+[a-z0-9_.-]+\/([a-z0-9_.-]+)/i.exec(String(o.notes ?? ""));
  return m?.[1] ?? "";
}
function orderMedium(o: Order): string {
  const explicit = fieldStr(o, "utm_medium", "utmMedium", "medium");
  if (explicit) return explicit.toLowerCase();
  const s = orderRawSource(o);
  if (s === "(direct)") return "none";
  if (/google|bing|yahoo|duckduckgo/.test(s)) return "organic";
  if (/facebook|instagram|linkedin|twitter|tiktok|youtube|reddit/.test(s)) return "social";
  if (/newsletter|email|klaviyo|mailchimp/.test(s)) return "email";
  return "referral";
}

/* -------------------------------------------------------------------------- */
/* dimension extractors (return a stable grouping key per record)              */
/* -------------------------------------------------------------------------- */
function eventDimKey(e: TelemetryEvent, dim: Dimension, sdims: Map<string, SDims>): string | null {
  switch (dim) {
    case "date": {
      const t = timeOf(e);
      return Number.isFinite(t) ? String(dayKeyUTC(t)) : null;
    }
    case "product":
      return productIdOfEvent(e) || "(none)";
    case "page":
      return pagePath(e);
    default: {
      const d = sdims.get(sessionOf(e));
      if (!d) return "(unknown)";
      if (dim === "channel") return d.channel;
      if (dim === "source") return d.source;
      if (dim === "medium") return d.medium;
      if (dim === "campaign") return d.campaign || "(none)";
      if (dim === "location") return d.location;
      if (dim === "device") return d.device;
      return "(unknown)";
    }
  }
}
function orderDimKey(o: Order, dim: Dimension): string | null {
  switch (dim) {
    case "date": {
      const t = tsOf(o);
      return Number.isFinite(t) ? String(dayKeyUTC(t)) : null;
    }
    case "product":
      return orderProductKey(o);
    case "page":
      return "(unknown)";
    case "location":
      return countryOf(o);
    case "channel":
      return classifyChannel(orderRawSource(o), orderMedium(o));
    case "source":
      return orderRawSource(o);
    case "medium":
      return orderMedium(o);
    case "campaign":
      return orderCampaign(o) || "(none)";
    case "device":
      return "(unknown)";
    default:
      return "(unknown)";
  }
}

function labelFor(dim: Dimension, key: string, names: Map<string, string>): string {
  if (dim === "date") {
    const n = Number(key);
    return Number.isFinite(n) && n > 0 ? dayLabel(n) : key;
  }
  if (dim === "product") return names.get(key) || key;
  if (dim === "device") return key === "unknown" ? "Unknown" : key.charAt(0).toUpperCase() + key.slice(1);
  return key || "(none)";
}

/* -------------------------------------------------------------------------- */
/* aggregation engine                                                          */
/* -------------------------------------------------------------------------- */
interface Acc {
  key: string;
  sessions: Set<string>;
  visitors: Set<string>;
  clicks: number;
  orders: number;
  revenue: number;
  units: number;
}
export interface ResultRow {
  key: string;
  label: string;
  sessions: number;
  visitors: number;
  clicks: number;
  orders: number;
  revenue: number;
  units: number;
  aov: number;
  conv: number;
}

const CLICK_RE = /(^|_)click|tap|press|add_?to_?cart|cart_?add|select_?item|cta/;
function isClick(e: TelemetryEvent): boolean {
  const type = String(e.eventType ?? "").toLowerCase();
  if (type === "click") return true;
  return CLICK_RE.test(String(e.event ?? "").toLowerCase());
}

function ensure(map: Map<string, Acc>, key: string): Acc {
  let a = map.get(key);
  if (!a) {
    a = { key, sessions: new Set(), visitors: new Set(), clicks: 0, orders: 0, revenue: 0, units: 0 };
    map.set(key, a);
  }
  return a;
}

function finalize(acc: Acc): Omit<ResultRow, "label"> {
  const sessions = acc.sessions.size;
  const orders = acc.orders;
  const revenue = acc.revenue;
  return {
    key: acc.key,
    sessions,
    visitors: acc.visitors.size,
    clicks: acc.clicks,
    orders,
    revenue,
    units: acc.units,
    aov: orders ? revenue / orders : 0,
    conv: sessions ? (orders / sessions) * 100 : 0,
  };
}

/** Aggregate events + orders grouped by `dim`. `null` key → record skipped. */
function aggregate(
  events: TelemetryEvent[],
  orders: Order[],
  keyOfEvent: (e: TelemetryEvent) => string | null,
  keyOfOrder: (o: Order) => string | null,
): Map<string, Acc> {
  const map = new Map<string, Acc>();
  for (const e of events) {
    const k = keyOfEvent(e);
    if (k == null) continue;
    const a = ensure(map, k);
    const sid = sessionOf(e);
    if (sid) a.sessions.add(sid);
    const an = String(e.anonymousId ?? "");
    if (an) a.visitors.add(an);
    if (isClick(e)) a.clicks++;
  }
  for (const o of orders) {
    const k = keyOfOrder(o);
    if (k == null) continue;
    const a = ensure(map, k);
    a.revenue += netOf(o);
    if (!isRefunded(o)) {
      a.orders++;
      a.units += qtyOf(o);
    }
  }
  return map;
}

function metricValue(row: Omit<ResultRow, "label" | "key"> | ResultRow, metric: Metric): number {
  return (row as Record<Metric, number>)[metric];
}

function fmtMetric(metric: Metric, value: number, currency: string): string {
  const def = METRIC_BY[metric];
  if (def.kind === "money") return fmtMoney(value, currency);
  if (def.kind === "pct") return `${value.toFixed(1)}%`;
  return fmtNum(value);
}

/* -------------------------------------------------------------------------- */
/* saved reports (localStorage)                                                */
/* -------------------------------------------------------------------------- */
const STORE_KEY = "dsm.analytics.savedReports.v1";
interface SavedReport {
  id: string;
  name: string;
  metrics: Metric[];
  dimension: Dimension;
  measure: Metric;
  filters: QueryFilter[];
  savedAt: number;
}
function loadSaved(): SavedReport[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedReport[]) : [];
  } catch {
    return [];
  }
}
function persistSaved(list: SavedReport[]) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    /* quota / disabled storage — non-fatal */
  }
}
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* -------------------------------------------------------------------------- */
/* small UI atoms                                                              */
/* -------------------------------------------------------------------------- */
function Chip({
  active,
  onClick,
  icon,
  children,
  color,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/15 text-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {icon && <span style={active && color ? { color } : undefined}>{icon}</span>}
      {children}
    </button>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* main component                                                              */
/* -------------------------------------------------------------------------- */
export function QueryBuilder({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const dr = useDateRange();

  // Query spec.
  const [metrics, setMetrics] = useState<Metric[]>(["sessions", "orders", "revenue", "conv"]);
  const [dimension, setDimension] = useState<Dimension>("date");
  const [measure, setMeasure] = useState<Metric>("revenue");
  const [filters, setFilters] = useState<QueryFilter[]>([]);

  // Saved-report library.
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [reportName, setReportName] = useState("");
  useEffect(() => setSaved(loadSaved()), []);

  // The measure must always be one of the selected metrics.
  useEffect(() => {
    if (!metrics.includes(measure) && metrics.length) setMeasure(metrics[0]);
  }, [metrics, measure]);

  const toggleMetric = (m: Metric) =>
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  /* ----- window scoping via the GLOBAL range/compare context ----- */
  const scoped = useMemo(() => {
    const cur = { events: [] as TelemetryEvent[], orders: [] as Order[] };
    const prev = { events: [] as TelemetryEvent[], orders: [] as Order[] };
    for (const e of events) {
      const t = timeOf(e);
      if (dr.inRange(t)) cur.events.push(e);
      else if (dr.compareEnabled && dr.inPrev(t)) prev.events.push(e);
    }
    for (const o of orders) {
      const t = tsOf(o);
      if (dr.inRange(t)) cur.orders.push(o);
      else if (dr.compareEnabled && dr.inPrev(t)) prev.orders.push(o);
    }
    return { cur, prev };
  }, [events, orders, dr]);

  const currency = useMemo(() => {
    for (const o of scoped.cur.orders) if (o.currency) return String(o.currency);
    for (const o of orders) if (o.currency) return String(o.currency);
    return "USD";
  }, [scoped.cur.orders, orders]);

  // Session attribution for each window.
  const sdimsCur = useMemo(() => buildSessionDims(scoped.cur.events), [scoped.cur.events]);
  const sdimsPrev = useMemo(() => buildSessionDims(scoped.prev.events), [scoped.prev.events]);

  // Product id → display name (for labels + filter suggestions).
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders) {
      const id = fieldStr(o, "productId", "product_id");
      const nm = fieldStr(o, "productName", "product_name");
      if (id && nm) m.set(id, nm);
    }
    for (const e of events) {
      const id = productIdOfEvent(e);
      const nm = str(metaPick(metaOf(e), "productName", "product_name"));
      if (id && nm && !m.has(id)) m.set(id, nm);
    }
    return m;
  }, [events, orders]);

  /* ----- filter predicates (evaluated against each record's dim key) ----- */
  const passEvent = useMemo(() => {
    return (e: TelemetryEvent, sdims: Map<string, SDims>): boolean => {
      for (const f of filters) {
        if (!f.value.trim()) continue;
        const key = eventDimKey(e, f.dim, sdims) ?? "";
        const label = labelFor(f.dim, key, names);
        const hay = `${key} ${label}`.toLowerCase();
        const val = f.value.toLowerCase().trim();
        const hit = f.op === "contains" ? hay.includes(val) : key.toLowerCase() === val || label.toLowerCase() === val;
        if (f.op === "not" ? hit : !hit) return false;
      }
      return true;
    };
  }, [filters, names]);

  const passOrder = useMemo(() => {
    return (o: Order): boolean => {
      for (const f of filters) {
        if (!f.value.trim()) continue;
        const key = orderDimKey(o, f.dim) ?? "";
        const label = labelFor(f.dim, key, names);
        const hay = `${key} ${label}`.toLowerCase();
        const val = f.value.toLowerCase().trim();
        const hit = f.op === "contains" ? hay.includes(val) : key.toLowerCase() === val || label.toLowerCase() === val;
        if (f.op === "not" ? hit : !hit) return false;
      }
      return true;
    };
  }, [filters, names]);

  /* ----- run the query for both windows ----- */
  const result = useMemo(() => {
    const curEvents = scoped.cur.events.filter((e) => passEvent(e, sdimsCur));
    const curOrders = scoped.cur.orders.filter(passOrder);
    const prevEvents = scoped.prev.events.filter((e) => passEvent(e, sdimsPrev));
    const prevOrders = scoped.prev.orders.filter(passOrder);

    const curMap = aggregate(curEvents, curOrders, (e) => eventDimKey(e, dimension, sdimsCur), (o) => orderDimKey(o, dimension));
    const prevMap = aggregate(prevEvents, prevOrders, (e) => eventDimKey(e, dimension, sdimsPrev), (o) => orderDimKey(o, dimension));

    // Previous measure by key (for the per-row Δ column).
    const prevMeasure = new Map<string, number>();
    for (const [k, a] of prevMap) prevMeasure.set(k, metricValue(finalize(a), measure));

    let rows: ResultRow[] = [...curMap.values()].map((a) => {
      const f = finalize(a);
      return { ...f, label: labelFor(dimension, f.key, names) };
    });

    if (dimension === "date") {
      rows.sort((a, b) => Number(a.key) - Number(b.key));
    } else {
      rows.sort((a, b) => metricValue(b, measure) - metricValue(a, measure));
    }

    // Whole-window totals (single bucket) for the KPI row + previous.
    const totalCurMap = aggregate(curEvents, curOrders, () => "all", () => "all");
    const totalPrevMap = aggregate(prevEvents, prevOrders, () => "all", () => "all");
    const totalCur = finalize(totalCurMap.get("all") ?? ensure(new Map(), "all"));
    const totalPrev = finalize(totalPrevMap.get("all") ?? ensure(new Map(), "all"));

    return { rows, prevMeasure, totalCur, totalPrev };
  }, [scoped, sdimsCur, sdimsPrev, dimension, measure, names, passEvent, passOrder]);

  const chartRows = useMemo(() => {
    const rows = result.rows;
    if (dimension === "date") return rows.map((r) => ({ label: r.label, value: metricValue(r, measure), key: r.key }));
    return rows.slice(0, 12).map((r) => ({ label: r.label, value: metricValue(r, measure), key: r.key }));
  }, [result.rows, dimension, measure]);

  const measureDef = METRIC_BY[measure];
  const chartIsLine = dimension === "date";
  const hasRows = result.rows.length > 0;

  /* ----- distinct values for the filter datalists (current window) ----- */
  const distinctFor = useMemo(() => {
    return (dim: Dimension): string[] => {
      const set = new Set<string>();
      for (const e of scoped.cur.events) {
        const k = eventDimKey(e, dim, sdimsCur);
        if (k) set.add(labelFor(dim, k, names));
      }
      for (const o of scoped.cur.orders) {
        const k = orderDimKey(o, dim);
        if (k) set.add(labelFor(dim, k, names));
      }
      return [...set].sort().slice(0, 40);
    };
  }, [scoped.cur.events, scoped.cur.orders, sdimsCur, names]);

  /* ----- actions ----- */
  const addFilter = () => setFilters((f) => [...f, { id: uid(), dim: "product", op: "is", value: "" }]);
  const updateFilter = (id: string, patch: Partial<QueryFilter>) =>
    setFilters((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeFilter = (id: string) => setFilters((f) => f.filter((x) => x.id !== id));

  const saveReport = () => {
    if (!metrics.length) return;
    const name = reportName.trim() || `${measureDef.short} by ${DIM_BY[dimension].label}`;
    const rep: SavedReport = { id: uid(), name, metrics, dimension, measure, filters, savedAt: Date.now() };
    const next = [rep, ...saved].slice(0, 50);
    setSaved(next);
    persistSaved(next);
    setReportName("");
  };
  const loadReport = (r: SavedReport) => {
    setMetrics(r.metrics);
    setDimension(r.dimension);
    setMeasure(r.measure);
    setFilters(r.filters.map((f) => ({ ...f, id: uid() })));
  };
  const deleteReport = (id: string) => {
    const next = saved.filter((r) => r.id !== id);
    setSaved(next);
    persistSaved(next);
  };

  const exportCsv = () => {
    const cols = ["dimension", ...metrics];
    const header = [DIM_BY[dimension].label, ...metrics.map((m) => METRIC_BY[m].label)];
    const lines = [header.join(",")];
    for (const r of result.rows) {
      const cells = [csvCell(r.label), ...metrics.map((m) => String(round(metricValue(r, m))))];
      lines.push(cells.join(","));
    }
    void cols;
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dsm-report-${measure}-by-${dimension}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ----- render ----- */
  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<SlidersHorizontal className="h-4 w-4 text-primary" />}
        title="Custom report builder"
        subtitle="Compose any metric by any dimension over the selected range, filter it, and save it to your report library. Metrics from the stable Telemetry & Orders sheets; falls back to seed data until the read endpoint is live."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {/* Global range control (also drives the rest of the suite when provided). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DateRangeControls />
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!hasRows}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>
      </div>

      {/* Builder controls */}
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div>
            <SectionLabel icon={<Gauge className="h-3.5 w-3.5" />}>Metrics</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => (
                <Chip key={m.key} active={metrics.includes(m.key)} onClick={() => toggleMetric(m.key)} icon={<m.icon className="h-3.5 w-3.5" />} color={m.color}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <SectionLabel icon={<TableIcon className="h-3.5 w-3.5" />}>Break down by</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {DIMENSIONS.map((d) => (
                  <Chip key={d.key} active={dimension === d.key} onClick={() => setDimension(d.key)} icon={<d.icon className="h-3.5 w-3.5" />}>
                    {d.label}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <SectionLabel icon={<Activity className="h-3.5 w-3.5" />}>Chart measure</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {metrics.length === 0 ? (
                  <span className="text-xs text-muted-foreground">Select at least one metric.</span>
                ) : (
                  metrics.map((m) => {
                    const def = METRIC_BY[m];
                    return (
                      <Chip key={m} active={measure === m} onClick={() => setMeasure(m)} icon={<def.icon className="h-3.5 w-3.5" />} color={def.color}>
                        {def.short}
                      </Chip>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionLabel icon={<FilterIcon className="h-3.5 w-3.5" />}>Filters</SectionLabel>
              <Button variant="outline" size="sm" onClick={addFilter}>
                <Plus className="h-3.5 w-3.5" /> Add filter
              </Button>
            </div>
            {filters.length === 0 ? (
              <p className="text-xs text-muted-foreground">No filters — showing every record in range.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {filters.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-center gap-2">
                    <select
                      value={f.dim}
                      onChange={(e) => updateFilter(f.id, { dim: e.target.value as Dimension, value: "" })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      {DIMENSIONS.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => updateFilter(f.id, { op: e.target.value as FilterOp })}
                      className="h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    >
                      <option value="is">is</option>
                      <option value="not">is not</option>
                      <option value="contains">contains</option>
                    </select>
                    <input
                      list={`fl-${f.id}`}
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      placeholder="value…"
                      className="h-8 min-w-[9rem] flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground"
                    />
                    <datalist id={`fl-${f.id}`}>
                      {distinctFor(f.dim).map((v) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                    <button onClick={() => removeFilter(f.id)} className="text-muted-foreground hover:text-down" title="Remove filter">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Save row */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Input
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              placeholder={`Name (default: ${measureDef.short} by ${DIM_BY[dimension].label})`}
              className="h-8 max-w-xs text-xs"
            />
            <Button size="sm" onClick={saveReport} disabled={!metrics.length}>
              <BookmarkPlus className="h-3.5 w-3.5" /> Save report
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI row — selected metrics, whole-window totals with vs-previous deltas */}
      {metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {metrics.map((m) => {
            const def = METRIC_BY[m];
            const cur = metricValue(result.totalCur, m);
            const prev = metricValue(result.totalPrev, m);
            return (
              <KpiCard
                key={m}
                label={def.label}
                value={fmtMetric(m, cur, currency)}
                icon={<def.icon className="h-3.5 w-3.5" />}
                color={def.color}
                delta={deltaOf(cur, prev)}
                higherIsBetter={def.higherIsBetter}
              />
            );
          })}
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <measureDef.icon className="h-4 w-4" style={{ color: measureDef.color }} />
              {measureDef.label} by {DIM_BY[dimension].label}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {chartIsLine ? "Daily trend across the selected range." : "Top values by the chosen measure."}
            </p>
          </div>
          <Badge variant="muted" className="gap-1">
            {chartIsLine ? "line" : "bar"}
          </Badge>
        </CardHeader>
        <CardContent>
          {!hasRows ? (
            <Empty icon={<TableIcon className="h-8 w-8" />} title="No records match this query in the selected range" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {chartIsLine ? (
                  <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <defs>
                      <linearGradient id="qb-line" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={measureDef.color} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={measureDef.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => axisFmt(v, measureDef.kind)} />
                    <Tooltip {...TOOLTIP} formatter={(v: number) => [fmtMetric(measure, v, currency), measureDef.label]} />
                    <Line type="monotone" dataKey="value" name={measureDef.label} stroke={measureDef.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                ) : (
                  <BarChart data={chartRows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-18} textAnchor="end" height={54} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => axisFmt(v, measureDef.kind)} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 6% 16% / 0.4)" }} formatter={(v: number) => [fmtMetric(measure, v, currency), measureDef.label]} />
                    <Bar dataKey="value" name={measureDef.label} radius={[4, 4, 0, 0]} maxBarSize={54}>
                      {chartRows.map((r) => (
                        <Cell key={r.key} fill={measureDef.color} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <TableIcon className="h-4 w-4 text-muted-foreground" /> Results
            <span className="text-xs font-normal text-muted-foreground">{result.rows.length} rows</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasRows ? (
            <Empty icon={<FilterIcon className="h-7 w-7" />} title="Nothing to show — loosen the filters or widen the range" />
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">{DIM_BY[dimension].label}</th>
                    {metrics.map((m) => (
                      <th key={m} className="px-3 py-2 text-right font-semibold">
                        {METRIC_BY[m].short}
                      </th>
                    ))}
                    {dr.compareEnabled && (
                      <th className="px-3 py-2 text-right font-semibold" title={`${measureDef.short} ${dr.compareLabel}`}>
                        Δ {measureDef.short}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 200).map((r) => {
                    const prevV = result.prevMeasure.get(r.key) ?? 0;
                    const d = deltaOf(metricValue(r, measure), prevV);
                    return (
                      <tr key={r.key} className="border-b border-border/60 last:border-0 hover:bg-accent/30">
                        <td className="max-w-[16rem] truncate px-3 py-2 font-medium text-foreground" title={r.label}>
                          {r.label}
                        </td>
                        {metrics.map((m) => (
                          <td key={m} className="px-3 py-2 text-right tabular-nums text-foreground/90">
                            {fmtMetric(m, metricValue(r, m), currency)}
                          </td>
                        ))}
                        {dr.compareEnabled && (
                          <td className="px-3 py-2 text-right tabular-nums">
                            <DeltaCell value={d} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Saved report library */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="h-4 w-4 text-muted-foreground" /> Saved reports
            <span className="text-xs font-normal text-muted-foreground">{saved.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {saved.length === 0 ? (
            <Empty icon={<BookmarkPlus className="h-7 w-7" />} title="No saved reports yet" hint="Compose a query above and hit “Save report” to add it here." />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((r) => (
                <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-border bg-background/60 p-3">
                  <button onClick={() => loadReport(r)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-medium text-foreground">{r.name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {METRIC_BY[r.measure]?.short ?? r.measure} · {DIM_BY[r.dimension]?.label ?? r.dimension} · {r.metrics.length} metric
                      {r.metrics.length === 1 ? "" : "s"}
                      {r.filters.length ? ` · ${r.filters.length} filter${r.filters.length === 1 ? "" : "s"}` : ""}
                    </div>
                  </button>
                  <button onClick={() => deleteReport(r.id)} className="shrink-0 text-muted-foreground hover:text-down" title="Delete report">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* leaf helpers                                                                */
/* -------------------------------------------------------------------------- */
function DeltaCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-[11px] text-muted-foreground">new</span>;
  if (value === 0) return <span className="text-[11px] text-muted-foreground">0%</span>;
  const up = value > 0;
  return (
    <span className={cn("text-[11px] font-semibold", up ? "text-ok" : "text-down")}>
      {up ? "+" : ""}
      {(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
    </span>
  );
}

function axisFmt(v: number, kind: "int" | "money" | "pct"): string {
  if (kind === "pct") return `${Math.round(v)}%`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(v));
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
