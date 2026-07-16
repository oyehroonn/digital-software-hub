/**
 * Shared presentational + math kit for the Analytics report pages.
 *
 * Keeps every report visually one system (chart theme, KPI cards, delta chips,
 * section chrome) and centralises the range/compare arithmetic so a report just
 * describes *what* to measure. All chart styling matches the existing admin
 * analytics suite (GeoAnalytics / AnalyticsOverview): dark tooltip, muted grid,
 * one accent per series.
 */
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";
import { useDateRange } from "./dateRange";

/* ---- shared chart styling (identical to the rest of the analytics suite) ---- */
export const AXIS = { fill: "#9aa0a6", fontSize: 11 } as const;
export const GRID = "hsl(220 6% 16%)";
export const TOOLTIP = {
  contentStyle: {
    background: "hsl(220 8% 7%)",
    border: "1px solid hsl(220 6% 16%)",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#e8e8e8" },
  itemStyle: { color: "#e8e8e8" },
} as const;

/** One accent per series, reused across every report chart. */
export const PALETTE = {
  primary: "hsl(210 80% 58%)",
  revenue: "hsl(38 92% 55%)",
  ok: "hsl(142 58% 46%)",
  violet: "hsl(265 62% 64%)",
  rose: "hsl(4 72% 56%)",
  amber: "hsl(24 88% 55%)",
  muted: "hsl(220 6% 45%)",
  compare: "hsl(220 6% 52%)",
} as const;

export const SERIES_COLORS = [
  PALETTE.primary,
  PALETTE.revenue,
  PALETTE.ok,
  PALETTE.violet,
  PALETTE.rose,
  PALETTE.amber,
];

/* ---------------------------------- math ---------------------------------- */

/** Ratio delta (cur-prev)/prev. null when there is no prior baseline. */
export function deltaOf(cur: number, prev: number): number | null {
  if (!prev) return cur > 0 ? null : 0;
  return (cur - prev) / prev;
}

export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export interface Bucket {
  key: string;
  label: string;
  start: number;
  end: number;
}

/**
 * Build an ordered set of time buckets spanning [start, end] at the requested
 * granularity (hour / day / month), capped so an unbounded window stays cheap.
 * Returned buckets carry a human label and their [start,end) epoch bounds so a
 * report can tally current AND previous-period values into the same axis.
 */
export function buildBuckets(
  start: number,
  end: number,
  granularity: "hour" | "day" | "month",
  cap = 400,
): Bucket[] {
  const out: Bucket[] = [];
  const from = new Date(start);
  if (granularity === "hour") {
    from.setMinutes(0, 0, 0);
    for (let t = from.getTime(); t <= end && out.length < cap; t += 3_600_000) {
      const d = new Date(t);
      out.push({
        key: String(t),
        label: `${String(d.getHours()).padStart(2, "0")}:00`,
        start: t,
        end: t + 3_600_000,
      });
    }
  } else if (granularity === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
    let cur = from.getTime();
    while (cur <= end && out.length < cap) {
      const d = new Date(cur);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      out.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString("en-US", { month: "short" }),
        start: cur,
        end: next,
      });
      cur = next;
    }
  } else {
    from.setHours(0, 0, 0, 0);
    for (let t = from.getTime(); t <= end && out.length < cap; t += 86_400_000) {
      const d = new Date(t);
      out.push({
        key: String(t),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        start: t,
        end: t + 86_400_000,
      });
    }
  }
  return out;
}

/* --------------------------------- pieces --------------------------------- */

/** Signed delta chip. `higherIsBetter=false` inverts tone (e.g. bounce rate). */
export function Delta({
  value,
  higherIsBetter = true,
  className,
}: {
  value: number | null;
  higherIsBetter?: boolean;
  className?: string;
}) {
  if (value == null) {
    return <span className={cn("text-[11px] font-medium text-muted-foreground", className)}>new</span>;
  }
  if (value === 0) {
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground", className)}>
        <Minus className="h-3 w-3" /> 0%
      </span>
    );
  }
  const up = value > 0;
  const good = higherIsBetter ? up : !up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        good ? "text-ok" : "text-down",
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
    </span>
  );
}

/** Minimal inline sparkline (no axis) for KPI cards. */
export function Spark({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  const w = 120;
  const h = height;
  if (data.length < 2) return <div style={{ height: h }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const px = (i: number) => (i / (data.length - 1)) * w;
  const py = (v: number) => h - 3 - ((v - min) / range) * (h - 6);
  const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `spk-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Headline metric card with a delta chip, sparkline and the compare caption. */
export function KpiCard({
  label,
  value,
  icon,
  color = PALETTE.primary,
  delta,
  spark,
  higherIsBetter = true,
  sub,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  color?: string;
  delta?: number | null;
  spark?: number[];
  higherIsBetter?: boolean;
  sub?: ReactNode;
}) {
  const { compareEnabled, compareLabel } = useDateRange();
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-border/80">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 opacity-70" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {icon && <span style={{ color }}>{icon}</span>}
          {label}
        </span>
        {compareEnabled && delta !== undefined && <Delta value={delta} higherIsBetter={higherIsBetter} />}
      </div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tabular-nums text-foreground">{value}</div>
      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Spark data={spark} color={color} />
        </div>
      )}
      <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
        {sub ?? (compareEnabled ? compareLabel : "current range")}
      </div>
    </div>
  );
}

/** A titled section card with an optional right-aligned control/legend slot. */
export function ChartCard({
  title,
  desc,
  right,
  children,
  className,
}: {
  title: ReactNode;
  desc?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between space-y-0 gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {right}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Small "current range vs previous" legend for charts with a compare overlay. */
export function CompareLegend() {
  const { compareEnabled, label, compareLabel } = useDateRange();
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-sm" style={{ background: PALETTE.primary }} /> {label}
      </span>
      {compareEnabled && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-3 border-t-2 border-dashed" style={{ borderColor: PALETTE.compare }} /> {compareLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Standard on-brand empty state for report pages — shown when there is no real
 * telemetry/orders yet. Never fabricates data.
 */
export function ReportEmpty({
  icon,
  title = "No data yet",
  hint = "Reports populate once the Telemetry and Orders sheets are connected — share them as Viewer.",
}: {
  icon?: ReactNode;
  title?: string;
  hint?: string;
}) {
  return <Empty icon={icon ?? <Radio className="h-7 w-7" />} title={title} hint={hint} />;
}

/**
 * Report page header — title, description, the resolved range label and the
 * standard live badge + refresh, mirroring `AnalyticsHeader` but wired to the
 * global range so every report announces which window it is showing.
 */
export function ReportHeader({
  icon,
  title,
  subtitle,
  loading,
  liveCount,
  onRefresh,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
  loading?: boolean;
  liveCount?: number;
  onRefresh?: () => void;
  /** Optional extra controls rendered in the right-hand action cluster. */
  children?: ReactNode;
}) {
  const { label, compareEnabled, compareLabel } = useDateRange();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {icon}
          {title}
          {typeof liveCount === "number" && liveCount > 0 && (
            <Badge variant="ok" title="Reading live telemetry from the sheet.">
              live · {liveCount.toLocaleString("en-US")}
            </Badge>
          )}
        </h1>
        <p className="max-w-3xl text-xs text-muted-foreground">{subtitle}</p>
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 font-semibold text-foreground/80">
            {label}
          </span>
          {compareEnabled && <span className="text-muted-foreground">{compareLabel}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        )}
      </div>
    </div>
  );
}
