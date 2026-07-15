/** Small shared building blocks for the catalog views (kept local to the area). */
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Amber note shown when a view is rendering the deterministic seed, not live data. */
export function SeedBanner({ show, what = "catalog" }: { show: boolean; what?: string }) {
  if (!show) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span>
        Showing a deterministic sample {what}. The VPS read endpoint isn't answering yet — live
        rows replace this automatically the moment it does.
      </span>
    </div>
  );
}

export function StatTile({
  icon,
  label,
  value,
  tone,
  sub,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  tone?: "ok" | "warn" | "down";
  sub?: string;
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "down" ? "text-down" : "";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon && <span className="opacity-70">{icon}</span>}
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{value}</div>
        {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function ViewHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="max-w-2xl text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Dependency-light inline SVG sparkline (matches ProductAnalytics styling). */
export function Sparkline({
  data,
  width = 96,
  height = 24,
  color = "hsl(4 65% 54%)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (!data.length || data.every((v) => v === 0)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const pad = 2;
  const max = Math.max(...data, 1);
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = pad + (data.length > 1 ? i * step : innerW / 2);
    const y = pad + innerH - (v / max) * innerH;
    return [x, y] as const;
  });
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={color} />
    </svg>
  );
}

/** Toast-style transient notice used across catalog tools. */
export function Notice({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border border-border bg-accent/50 px-3 py-2 text-xs">{msg}</div>
  );
}
