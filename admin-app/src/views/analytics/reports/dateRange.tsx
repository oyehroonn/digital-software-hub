/**
 * GLOBAL date-range + compare context for the Analytics report pages.
 *
 * The Analytics area mounts <DateRangeProvider> once (the integration wires it
 * next to the hub sub-nav) and renders <DateRangeControls/> in the toolbar.
 * Every report calls `useDateRange()` and filters its data with `inRange` /
 * `inPrev`, then renders vs-previous deltas from the comparison window — so a
 * single toolbar drives the whole suite.
 *
 * Reports never mount their own provider. When one is read outside a provider
 * (isolated render, a test, an integration that hasn't wired the toolbar yet)
 * `useDateRange()` still returns a fully-resolved "Last 30 days" window with the
 * comparison enabled, so a report always computes and renders correctly.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CalendarRange, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

export type RangePreset = "today" | "7d" | "14d" | "30d" | "90d" | "12m" | "all";

export interface ResolvedRange {
  preset: RangePreset;
  /** inclusive epoch-ms lower bound of the primary window */
  start: number;
  /** exclusive-ish epoch-ms upper bound (≈ now for trailing windows) */
  end: number;
  /** comparison ("previous period") window bounds */
  prevStart: number;
  prevEnd: number;
  /** nominal length in whole days (0 ⇒ all-time, no fixed length) */
  days: number;
  label: string;
  compareEnabled: boolean;
  compareLabel: string;
  granularity: "hour" | "day" | "month";
  /** timestamp (epoch ms) falls inside the primary window */
  inRange: (t: number) => boolean;
  /** timestamp (epoch ms) falls inside the comparison window */
  inPrev: (t: number) => boolean;
}

export interface DateRangeState extends ResolvedRange {
  setPreset: (p: RangePreset) => void;
  setCompareEnabled: (v: boolean) => void;
  toggleCompare: () => void;
}

export const RANGE_PRESETS: { key: RangePreset; label: string; short: string }[] = [
  { key: "today", label: "Today", short: "1D" },
  { key: "7d", label: "Last 7 days", short: "7D" },
  { key: "14d", label: "Last 14 days", short: "14D" },
  { key: "30d", label: "Last 30 days", short: "30D" },
  { key: "90d", label: "Last 90 days", short: "90D" },
  { key: "12m", label: "Last 12 months", short: "12M" },
  { key: "all", label: "All time", short: "ALL" },
];

const PRESET_DAYS: Record<RangePreset, number> = {
  today: 1,
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
  "12m": 365,
  all: 0,
};

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Resolve a preset into concrete window bounds against `now`. */
export function resolveRange(preset: RangePreset, compareEnabled: boolean, now = Date.now()): ResolvedRange {
  const meta = RANGE_PRESETS.find((p) => p.key === preset) ?? RANGE_PRESETS[3];
  const days = PRESET_DAYS[preset];

  let start: number;
  let end: number;
  let prevStart: number;
  let prevEnd: number;
  let granularity: ResolvedRange["granularity"];

  if (preset === "today") {
    start = startOfDay(now);
    end = now;
    prevStart = start - DAY;
    prevEnd = start;
    granularity = "hour";
  } else if (preset === "all") {
    start = 0;
    end = now;
    prevStart = 0;
    prevEnd = 0; // empty comparison window
    granularity = "day";
  } else {
    end = now;
    start = now - days * DAY;
    prevEnd = start;
    prevStart = start - days * DAY;
    granularity = days <= 1 ? "hour" : days <= 45 ? "day" : "month";
  }

  const compareLabel =
    preset === "all"
      ? "no comparison"
      : preset === "today"
        ? "vs yesterday"
        : `vs previous ${days} days`;

  return {
    preset,
    start,
    end,
    prevStart,
    prevEnd,
    days,
    label: meta.label,
    compareEnabled: compareEnabled && preset !== "all",
    compareLabel,
    granularity,
    inRange: (t: number) => Number.isFinite(t) && t >= start && t <= end,
    inPrev: (t: number) => Number.isFinite(t) && t >= prevStart && t < prevEnd,
  };
}

const FALLBACK: DateRangeState = {
  ...resolveRange("30d", true),
  setPreset: () => {},
  setCompareEnabled: () => {},
  toggleCompare: () => {},
};

const DateRangeContext = createContext<DateRangeState | null>(null);

export function DateRangeProvider({
  children,
  defaultPreset = "30d",
  defaultCompare = true,
}: {
  children: ReactNode;
  defaultPreset?: RangePreset;
  defaultCompare?: boolean;
}) {
  const [preset, setPreset] = useState<RangePreset>(defaultPreset);
  const [compareEnabled, setCompareEnabled] = useState(defaultCompare);

  const value = useMemo<DateRangeState>(() => {
    const resolved = resolveRange(preset, compareEnabled);
    return {
      ...resolved,
      setPreset,
      setCompareEnabled,
      toggleCompare: () => setCompareEnabled((v) => !v),
    };
    // Re-resolve when the selection changes; `now` is captured per selection.
  }, [preset, compareEnabled]);

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

/** Read the global range. Safe outside a provider (returns a resolved default). */
export function useDateRange(): DateRangeState {
  return useContext(DateRangeContext) ?? FALLBACK;
}

/**
 * Toolbar control the integration renders beside the analytics sub-nav: a range
 * preset selector plus a "compare to previous period" toggle. Presentational —
 * it reads and writes the same global context every report consumes.
 */
export function DateRangeControls({ className }: { className?: string }) {
  const { preset, setPreset, compareEnabled, toggleCompare, compareLabel } = useDateRange();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
        <CalendarRange className="ml-1.5 mr-0.5 h-3.5 w-3.5 text-muted-foreground" />
        {RANGE_PRESETS.map((p) => {
          const on = p.key === preset;
          return (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              title={p.label}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors",
                on
                  ? "bg-primary/20 text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {p.short}
            </button>
          );
        })}
      </div>
      <button
        onClick={toggleCompare}
        disabled={preset === "all"}
        title={preset === "all" ? "Comparison unavailable for all-time" : compareLabel}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-40",
          compareEnabled && preset !== "all"
            ? "border-primary/40 bg-primary/15 text-foreground"
            : "border-border bg-card text-muted-foreground hover:text-foreground",
        )}
      >
        <GitCompareArrows className="h-3.5 w-3.5" />
        Compare
      </button>
    </div>
  );
}
