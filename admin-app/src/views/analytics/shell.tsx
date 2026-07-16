/**
 * Shared chrome for the Analytics & Heatmaps views: a consistent page header
 * (title + subtitle + live badge + refresh) and a couple of small presentational
 * primitives (KPI tile, labeled progress bar, empty state) so every view reads
 * as one system.
 */
import type { ReactNode } from "react";
import { RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";

export function AnalyticsHeader({
  icon,
  title,
  subtitle,
  loading,
  liveCount,
  onRefresh,
  right,
}: {
  icon?: ReactNode;
  title: string;
  subtitle: string;
  loading?: boolean;
  liveCount?: number;
  onRefresh?: () => void;
  right?: ReactNode;
}) {
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
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Standard on-brand empty state for analytics views — shown when there is no
 * real telemetry/orders yet (the tracking sheet isn't connected). Never renders
 * fabricated data; the moment the sheet is shared as Viewer, real rows appear.
 */
export function AnalyticsEmpty({
  icon,
  title = "No data yet",
  hint = "Telemetry appears here once the tracking sheet is connected — share the Telemetry sheet as Viewer.",
}: {
  icon?: ReactNode;
  title?: string;
  hint?: string;
}) {
  return <Empty icon={icon ?? <Radio className="h-7 w-7" />} title={title} hint={hint} />;
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "ok" | "warn" | "down" | "primary";
  className?: string;
}) {
  const toneCls =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "down"
          ? "text-down"
          : tone === "primary"
            ? "text-primary"
            : "text-foreground";
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-2xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {sub != null && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** A horizontal magnitude bar (single-hue) used in ranking tables. */
export function MeterBar({
  value,
  max,
  tone = "primary",
  className,
}: {
  value: number;
  max: number;
  tone?: "primary" | "down" | "warn" | "ok";
  className?: string;
}) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  const bg =
    tone === "down" ? "bg-down" : tone === "warn" ? "bg-warn" : tone === "ok" ? "bg-ok" : "bg-primary";
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded bg-muted", className)}>
      <span className={cn("block h-full rounded", bg)} style={{ width: `${pct}%` }} />
    </span>
  );
}
