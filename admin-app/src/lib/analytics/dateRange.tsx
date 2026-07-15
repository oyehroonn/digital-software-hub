/**
 * dateRange.tsx — the GLOBAL date-range + compare + group-by spine.
 *
 * Every Shopify-parity report in the Analytics area reads its window from ONE
 * place: the {@link DateRangeProvider} at the top of the area and the
 * {@link useDateRange} hook inside each report. That guarantees that changing
 * the range once (via the {@link DateRangePicker} toolbar) re-scopes every KPI,
 * chart and table on the page at once — and that every one of them can show a
 * "vs previous" delta against the comparison window.
 *
 * What this module gives a report author:
 *   • useDateRange()      — the live { range, previousRange, compare, groupBy,… }
 *   • useRangeFilter(rows)— filters an array by its `received_at`/`timestamp`
 *                           and returns { current, previous, buckets,
 *                           previousBuckets, metric() } already scoped to the
 *                           selected window + comparison window.
 *   • <DateRangePicker/>  — the polished toolbar (presets + compare + group-by
 *                           + custom dates) that drives all of the above.
 *   • pure helpers        — resolvePreset / resolvePrevious / filterByRange /
 *                           bucketRows / computeDelta / pctDelta — usable in
 *                           tests or outside React.
 *
 * Time model: all boundaries (start-of-day / week / month / quarter / year) and
 * all bucket labels are computed in the VIEWER'S LOCAL timezone, so "Today" and
 * "Month to date" mean what the operator expects. A range is a half-open
 * interval `{ start, end }` in epoch-ms with `end` EXCLUSIVE. Weeks start on
 * Monday (ISO). Nothing here throws on bad input — an unparseable timestamp is
 * simply excluded.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* types                                                                       */
/* -------------------------------------------------------------------------- */

/** Half-open interval in epoch-ms — `end` is EXCLUSIVE. */
export interface Range {
  start: number;
  end: number;
}

export type PresetKey =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "last90"
  | "last12mo"
  | "wtd"
  | "mtd"
  | "qtd"
  | "ytd"
  | "custom";

export type CompareMode = "none" | "previous_period" | "previous_year";

export type GroupBy = "hour" | "day" | "week" | "month";

export interface PresetMeta {
  key: PresetKey;
  label: string;
  short: string;
  group: "Relative" | "To date" | "Custom";
}

export const PRESETS: PresetMeta[] = [
  { key: "today", label: "Today", short: "Today", group: "Relative" },
  { key: "yesterday", label: "Yesterday", short: "Yest.", group: "Relative" },
  { key: "last7", label: "Last 7 days", short: "7d", group: "Relative" },
  { key: "last30", label: "Last 30 days", short: "30d", group: "Relative" },
  { key: "last90", label: "Last 90 days", short: "90d", group: "Relative" },
  { key: "last12mo", label: "Last 12 months", short: "12mo", group: "Relative" },
  { key: "wtd", label: "Week to date", short: "WTD", group: "To date" },
  { key: "mtd", label: "Month to date", short: "MTD", group: "To date" },
  { key: "qtd", label: "Quarter to date", short: "QTD", group: "To date" },
  { key: "ytd", label: "Year to date", short: "YTD", group: "To date" },
  { key: "custom", label: "Custom range", short: "Custom", group: "Custom" },
];

export const COMPARE_OPTIONS: { key: CompareMode; label: string; short: string }[] = [
  { key: "previous_period", label: "Previous period", short: "Prev. period" },
  { key: "previous_year", label: "Previous year", short: "Prev. year" },
  { key: "none", label: "No comparison", short: "Off" },
];

export const GROUPBY_OPTIONS: { key: GroupBy; label: string }[] = [
  { key: "hour", label: "Hour" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

/* -------------------------------------------------------------------------- */
/* date math (all local-time)                                                  */
/* -------------------------------------------------------------------------- */

export const DAY_MS = 86_400_000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfHour(t: number): number {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}
/** ISO week — Monday start. */
function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow);
  return d.getTime();
}
function startOfMonth(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}
function startOfQuarter(t: number): number {
  const d = new Date(t);
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).getTime();
}
function startOfYear(t: number): number {
  const d = new Date(t);
  return new Date(d.getFullYear(), 0, 1).getTime();
}
function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
function addMonths(t: number, n: number): number {
  const d = new Date(t);
  d.setMonth(d.getMonth() + n);
  return d.getTime();
}
function addYears(t: number, n: number): number {
  const d = new Date(t);
  d.setFullYear(d.getFullYear() + n);
  return d.getTime();
}

/** Advance one bucket of `unit` from `t` (DST-safe via Date arithmetic). */
function stepBucket(unit: GroupBy, t: number): number {
  switch (unit) {
    case "hour":
      return t + 3_600_000;
    case "day":
      return addDays(t, 1);
    case "week":
      return addDays(t, 7);
    case "month":
      return addMonths(t, 1);
  }
}
/** Floor `t` to the start of its `unit` bucket. */
function floorBucket(unit: GroupBy, t: number): number {
  switch (unit) {
    case "hour":
      return startOfHour(t);
    case "day":
      return startOfDay(t);
    case "week":
      return startOfWeek(t);
    case "month":
      return startOfMonth(t);
  }
}

/* -------------------------------------------------------------------------- */
/* preset + comparison resolution                                              */
/* -------------------------------------------------------------------------- */

/** ISO `YYYY-MM-DD` for an `<input type="date">`, in local time. */
export function toDateInputValue(t: number): string {
  const d = new Date(t);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
/** Parse a local `YYYY-MM-DD` to the epoch-ms of its local midnight. */
export function fromDateInputValue(v: string): number {
  const [y, m, d] = v.split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getTime();
}

export interface CustomRange {
  /** Local `YYYY-MM-DD` inclusive start. */
  start: string;
  /** Local `YYYY-MM-DD` inclusive end. */
  end: string;
}

/** Turn a preset (+ optional custom bounds) into a concrete half-open range. */
export function resolvePreset(preset: PresetKey, now: number, custom?: CustomRange): Range {
  const sod = startOfDay(now);
  switch (preset) {
    case "today":
      return { start: sod, end: now };
    case "yesterday":
      return { start: addDays(sod, -1), end: sod };
    case "last7":
      return { start: addDays(sod, -6), end: now };
    case "last30":
      return { start: addDays(sod, -29), end: now };
    case "last90":
      return { start: addDays(sod, -89), end: now };
    case "last12mo":
      return { start: addMonths(sod, -12), end: now };
    case "wtd":
      return { start: startOfWeek(now), end: now };
    case "mtd":
      return { start: startOfMonth(now), end: now };
    case "qtd":
      return { start: startOfQuarter(now), end: now };
    case "ytd":
      return { start: startOfYear(now), end: now };
    case "custom": {
      if (custom) {
        const s = fromDateInputValue(custom.start);
        const e = fromDateInputValue(custom.end);
        if (!Number.isNaN(s) && !Number.isNaN(e)) {
          // inclusive end day → exclusive next-midnight; tolerate reversed input
          const lo = Math.min(s, e);
          const hi = Math.max(s, e);
          return { start: lo, end: addDays(hi, 1) };
        }
      }
      return { start: addDays(sod, -29), end: now };
    }
  }
}

/** The comparison window for `range` under `mode` (null when comparison off). */
export function resolvePrevious(range: Range, mode: CompareMode): Range | null {
  if (mode === "none") return null;
  if (mode === "previous_year") {
    return { start: addYears(range.start, -1), end: addYears(range.end, -1) };
  }
  // previous_period — equal-length window ending exactly at range.start.
  const dur = range.end - range.start;
  return { start: range.start - dur, end: range.start };
}

/** A sensible default granularity for a range's span. */
export function suggestGroupBy(range: Range): GroupBy {
  const days = (range.end - range.start) / DAY_MS;
  if (days <= 2) return "hour";
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

/* -------------------------------------------------------------------------- */
/* row access + filtering + bucketing + deltas                                 */
/* -------------------------------------------------------------------------- */

/**
 * Default timestamp accessor: reads the first present of `received_at`,
 * `receivedAt`, `timestamp`, `time`, `date` and returns epoch-ms (NaN if none
 * parse). Matches both the raw CSV rows and the normalized camelCase shapes.
 */
export function rowTimestamp(row: unknown): number {
  if (row == null || typeof row !== "object") return NaN;
  const r = row as Record<string, unknown>;
  const raw = r.received_at ?? r.receivedAt ?? r.timestamp ?? r.time ?? r.date;
  if (raw == null || raw === "") return NaN;
  return typeof raw === "number" ? raw : Date.parse(String(raw));
}

export type TsAccessor<T> = (row: T) => number;

/** Rows whose timestamp falls in the half-open range `[start, end)`. */
export function filterByRange<T>(rows: T[], range: Range, getTs: TsAccessor<T> = rowTimestamp): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const t = getTs(r);
    if (!Number.isNaN(t) && t >= range.start && t < range.end) out.push(r);
  }
  return out;
}

export interface Bucket<T> {
  /** Bucket start (epoch-ms, local boundary). */
  start: number;
  /** Bucket end, exclusive. */
  end: number;
  /** Stable key for React / joins. */
  key: string;
  /** Human label for a chart axis (localized). */
  label: string;
  /** Rows that fall in this bucket. */
  rows: T[];
}

function bucketLabel(unit: GroupBy, start: number): string {
  const d = new Date(start);
  switch (unit) {
    case "hour":
      return d.toLocaleTimeString("en-US", { hour: "numeric" });
    case "day":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "week":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
}

/**
 * Bucket `rows` into a CONTIGUOUS series of `unit`-sized buckets that spans the
 * whole `range` (so charts get a continuous axis with zero-filled gaps). Rows
 * outside the range are ignored. Hard-capped at 600 buckets so an accidental
 * "hour over 5 years" can't hang the UI.
 */
export function bucketRows<T>(
  rows: T[],
  range: Range,
  unit: GroupBy,
  getTs: TsAccessor<T> = rowTimestamp,
): Bucket<T>[] {
  const buckets: Bucket<T>[] = [];
  const index = new Map<number, Bucket<T>>();
  let cur = floorBucket(unit, range.start);
  const GUARD = 600;
  for (let i = 0; cur < range.end && i < GUARD; i++) {
    const next = stepBucket(unit, cur);
    const b: Bucket<T> = {
      start: cur,
      end: next,
      key: String(cur),
      label: bucketLabel(unit, cur),
      rows: [],
    };
    buckets.push(b);
    index.set(cur, b);
    cur = next;
  }
  for (const r of rows) {
    const t = getTs(r);
    if (Number.isNaN(t) || t < range.start || t >= range.end) continue;
    const b = index.get(floorBucket(unit, t));
    if (b) b.rows.push(r);
  }
  return buckets;
}

/** Signed fractional change (0.25 = +25%); null when undefined (prev = 0). */
export function pctDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

export interface DeltaResult {
  current: number;
  previous: number;
  /** Fractional change vs previous, or null when there's no baseline. */
  pct: number | null;
}

/** Apply a metric fn to the current + previous row sets and diff them. */
export function computeDelta<T>(
  current: T[],
  previous: T[],
  metric: (rows: T[]) => number,
): DeltaResult {
  const c = metric(current);
  const p = metric(previous);
  return { current: c, previous: p, pct: pctDelta(c, p) };
}

/* -------------------------------------------------------------------------- */
/* range formatting                                                            */
/* -------------------------------------------------------------------------- */

/** "Jul 9 – Jul 15, 2026" style label for the current range (end is inclusive). */
export function formatRange(range: Range): string {
  const s = new Date(range.start);
  // inclusive last day = the day containing (end - 1ms)
  const e = new Date(Math.max(range.start, range.end - 1));
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const sameDay = sameMonth && s.getDate() === e.getDate();
  if (sameDay) {
    return s.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  const startStr = s.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endStr = e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} – ${endStr}`;
}

/* -------------------------------------------------------------------------- */
/* context                                                                     */
/* -------------------------------------------------------------------------- */

export interface DateRangeState {
  preset: PresetKey;
  setPreset: (p: PresetKey) => void;

  /** Resolved current window (half-open, epoch-ms). */
  range: Range;
  /** Resolved comparison window, or null when compare is off. */
  previousRange: Range | null;

  compare: CompareMode;
  setCompare: (c: CompareMode) => void;

  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;

  custom: CustomRange;
  /** Set the custom bounds and switch to the "custom" preset. */
  setCustom: (c: CustomRange) => void;

  /** Human label for the current range, e.g. "Jul 9 – Jul 15, 2026". */
  label: string;
  /** Anchor "now" for this session (stable unless refreshed). */
  now: number;
  /** Re-anchor "now" to the wall clock (re-resolves relative presets). */
  refreshNow: () => void;
}

const Ctx = createContext<DateRangeState | null>(null);

export function DateRangeProvider({
  children,
  initialPreset = "last30",
  initialCompare = "previous_period",
}: {
  children: ReactNode;
  initialPreset?: PresetKey;
  initialCompare?: CompareMode;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [preset, setPresetState] = useState<PresetKey>(initialPreset);
  const [compare, setCompare] = useState<CompareMode>(initialCompare);
  // groupBy tracks the preset unless the user overrides it explicitly.
  const [groupBy, setGroupByState] = useState<GroupBy>(() =>
    suggestGroupBy(resolvePreset(initialPreset, Date.now())),
  );
  const groupByTouched = useRef(false);

  const [custom, setCustomState] = useState<CustomRange>(() => {
    const n = Date.now();
    return { start: toDateInputValue(addDays(startOfDay(n), -29)), end: toDateInputValue(n) };
  });

  const range = useMemo(
    () => resolvePreset(preset, now, custom),
    [preset, now, custom],
  );
  const previousRange = useMemo(() => resolvePrevious(range, compare), [range, compare]);

  // When the preset changes and the user hasn't hand-picked a granularity,
  // auto-fit group-by to the new span.
  const setPreset = useCallback((p: PresetKey) => {
    setPresetState(p);
    if (!groupByTouched.current) {
      setGroupByState(suggestGroupBy(resolvePreset(p, Date.now())));
    }
  }, []);

  const setGroupBy = useCallback((g: GroupBy) => {
    groupByTouched.current = true;
    setGroupByState(g);
  }, []);

  const setCustom = useCallback((c: CustomRange) => {
    setCustomState(c);
    setPresetState("custom");
    if (!groupByTouched.current) {
      const r = resolvePreset("custom", Date.now(), c);
      setGroupByState(suggestGroupBy(r));
    }
  }, []);

  const refreshNow = useCallback(() => setNow(Date.now()), []);

  const value = useMemo<DateRangeState>(
    () => ({
      preset,
      setPreset,
      range,
      previousRange,
      compare,
      setCompare,
      groupBy,
      setGroupBy,
      custom,
      setCustom,
      label: formatRange(range),
      now,
      refreshNow,
    }),
    [preset, setPreset, range, previousRange, compare, groupBy, setGroupBy, custom, setCustom, now, refreshNow],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the global date-range state. Throws if used outside the provider. */
export function useDateRange(): DateRangeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDateRange must be used within a <DateRangeProvider>");
  return v;
}

/**
 * Read the global date-range state WITHOUT throwing when no provider is present
 * — returns a self-contained fallback anchored to a `last30 / previous period`
 * window. Lets an individual report be dropped onto a nav entry standalone.
 */
export function useOptionalDateRange(fallbackPreset: PresetKey = "last30"): DateRangeState {
  const v = useContext(Ctx);
  const [now] = useState(() => Date.now());
  const [preset, setPreset] = useState<PresetKey>(fallbackPreset);
  const [compare, setCompare] = useState<CompareMode>("previous_period");
  const [groupBy, setGroupBy] = useState<GroupBy>(() =>
    suggestGroupBy(resolvePreset(fallbackPreset, now)),
  );
  const [custom, setCustomState] = useState<CustomRange>(() => ({
    start: toDateInputValue(addDays(startOfDay(now), -29)),
    end: toDateInputValue(now),
  }));
  const range = useMemo(() => resolvePreset(preset, now, custom), [preset, now, custom]);
  const previousRange = useMemo(() => resolvePrevious(range, compare), [range, compare]);
  const fallback = useMemo<DateRangeState>(
    () => ({
      preset,
      setPreset,
      range,
      previousRange,
      compare,
      setCompare,
      groupBy,
      setGroupBy,
      custom,
      setCustom: (c: CustomRange) => {
        setCustomState(c);
        setPreset("custom");
      },
      label: formatRange(range),
      now,
      refreshNow: () => {},
    }),
    [preset, range, previousRange, compare, groupBy, custom, now],
  );
  return v ?? fallback;
}

/* -------------------------------------------------------------------------- */
/* the report-facing hook                                                       */
/* -------------------------------------------------------------------------- */

export interface RangeFilterResult<T> {
  /** Rows inside the current window. */
  current: T[];
  /** Rows inside the comparison window ([] when compare is off). */
  previous: T[];
  /** Contiguous, zero-filled buckets over the current window. */
  buckets: Bucket<T>[];
  /** Contiguous buckets over the comparison window ([] when off). */
  previousBuckets: Bucket<T>[];
  /** True when a comparison window is active. */
  hasCompare: boolean;
  range: Range;
  previousRange: Range | null;
  groupBy: GroupBy;
  /** Run a metric fn over current vs previous and get the % delta. */
  metric: (fn: (rows: T[]) => number) => DeltaResult;
}

/**
 * The one hook a report calls. Give it your raw rows (events or orders) and it
 * returns everything already scoped to the global window + comparison window,
 * memoized. Pass a custom `getTs` only if your rows time-stamp differently than
 * the default `received_at`/`timestamp` fields.
 */
export function useRangeFilter<T>(
  rows: T[],
  getTs: TsAccessor<T> = rowTimestamp,
): RangeFilterResult<T> {
  const { range, previousRange, groupBy } = useDateRange();
  return useMemo(() => {
    const current = filterByRange(rows, range, getTs);
    const previous = previousRange ? filterByRange(rows, previousRange, getTs) : [];
    return {
      current,
      previous,
      buckets: bucketRows(current, range, groupBy, getTs),
      previousBuckets: previousRange ? bucketRows(previous, previousRange, groupBy, getTs) : [],
      hasCompare: previousRange != null,
      range,
      previousRange,
      groupBy,
      metric: (fn: (rows: T[]) => number) => computeDelta(current, previous, fn),
    };
    // getTs is expected to be a stable module-level fn; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, range, previousRange, groupBy]);
}

/* -------------------------------------------------------------------------- */
/* <DateRangePicker/> toolbar                                                   */
/* -------------------------------------------------------------------------- */

/** Small segmented control shared by the compare + group-by pickers. */
function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "px-2.5 py-1 text-xs font-medium transition-colors",
            value === o.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The polished toolbar that drives the global date context: a preset dropdown
 * (relative / to-date / custom, with two date inputs when custom is active), a
 * "Compare to" selector and a group-by selector. Drop ONE of these near the top
 * of the Analytics area; every report below re-scopes when it changes.
 */
export function DateRangePicker({ className }: { className?: string }) {
  const {
    preset,
    setPreset,
    compare,
    setCompare,
    groupBy,
    setGroupBy,
    custom,
    setCustom,
    label,
    previousRange,
  } = useDateRange();

  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // outside-click / escape to close the preset popover
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = PRESETS.find((p) => p.key === preset) ?? PRESETS[0];
  const groups: PresetMeta["group"][] = ["Relative", "To date", "Custom"];
  const compareLabel = COMPARE_OPTIONS.find((c) => c.key === compare)?.short ?? "Off";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {/* Preset dropdown */}
      <div className="relative" ref={popRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent",
            open && "ring-1 ring-ring",
          )}
        >
          <CalendarDays className="h-3.5 w-3.5 text-primary" />
          <span className="tabular-nums">{active.label}</span>
          <span className="hidden text-muted-foreground sm:inline">· {label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="absolute left-0 z-50 mt-1.5 w-64 rounded-lg border border-border bg-card p-1.5 shadow-xl">
            {groups.map((g) => (
              <div key={g} className="mb-1 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {g}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {PRESETS.filter((p) => p.group === g).map((p) => {
                    const on = p.key === preset;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          setPreset(p.key);
                          if (p.key !== "custom") setOpen(false);
                        }}
                        className={cn(
                          "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors",
                          on
                            ? "bg-primary/15 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          p.key === "custom" && "col-span-2",
                        )}
                      >
                        {p.label}
                        {on && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {preset === "custom" && (
              <div className="mt-1 flex items-center gap-1.5 border-t border-border px-1 pt-2">
                <input
                  type="date"
                  value={custom.start}
                  max={custom.end}
                  onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <input
                  type="date"
                  value={custom.end}
                  min={custom.start}
                  onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compare selector */}
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">
          Compare
        </span>
        <Segmented
          options={COMPARE_OPTIONS.map((c) => ({ key: c.key, label: c.short }))}
          value={compare}
          onChange={setCompare}
        />
      </div>

      {/* Group-by selector */}
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <Segmented options={GROUPBY_OPTIONS} value={groupBy} onChange={setGroupBy} />
      </div>

      {/* Comparison-window hint */}
      {previousRange && (
        <span className="hidden text-[11px] text-muted-foreground xl:inline">
          vs {compareLabel.toLowerCase()} · {formatRange(previousRange)}
        </span>
      )}
    </div>
  );
}
