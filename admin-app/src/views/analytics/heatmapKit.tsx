/**
 * Shared primitives for the canvas heatmaps (Click heatmap + Look/attention map).
 *
 * Everything spatial lives here so the two views stay pixel-consistent:
 *   • field/num/meta — defensive reads tolerant of snake_case OR camelCase rows
 *   • normalizePath  — collapse a full URL to an origin-less path for grouping
 *   • drawHeatmap    — additive radial blobs → cold→hot LUT on a <canvas>
 *   • PageWireframe / Slider / HeatLegend — presentational chrome
 *
 * A HeatPoint is a normalized [0,1] position plus a weight (clicks → 1 each;
 * attention → dwell-seconds) and an optional label for hover/tables.
 */
import { cn } from "@/lib/utils";
import type { TelemetryEvent } from "@/lib/ecommerce";

export interface HeatPoint {
  /** normalized to [0,1] across the page frame */
  nx: number;
  ny: number;
  weight: number;
  elementId: string;
  elementText: string;
}

export const ALL_PAGES = "__all__";

/* ---------------------------------------------------------------- */
/* Defensive field reads (snake_case OR camelCase)                  */
/* ---------------------------------------------------------------- */

export function field(e: TelemetryEvent, ...keys: string[]): unknown {
  const bag = e as Record<string, unknown>;
  for (const k of keys) if (bag[k] != null && bag[k] !== "") return bag[k];
  return undefined;
}

export function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

export function meta(e: TelemetryEvent): Record<string, unknown> {
  const m = field(e, "metadata", "metadata_json");
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

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Collapse a full URL to origin-less path so the same page groups together. */
export function normalizePath(url: string): string {
  if (!url) return "(unknown)";
  try {
    const u = new URL(url);
    return (u.pathname || "/") + (u.search || "");
  } catch {
    return url;
  }
}

/** Ordered list of page paths (busiest first) for events passing `keep`. */
export function pageUrlsFromEvents(
  events: TelemetryEvent[],
  keep: (e: TelemetryEvent) => boolean,
): string[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!keep(e)) continue;
    const raw = field(e, "pageUrl", "page_url");
    const url = normalizePath(raw == null ? "" : String(raw));
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}

export interface ElementRank {
  key: string;
  label: string;
  count: number;
}

/** Rank labeled points by summed weight for the accompanying table. */
export function topElements(points: HeatPoint[], limit = 12): ElementRank[] {
  const counts = new Map<string, ElementRank>();
  for (const p of points) {
    const label = p.elementText?.trim() || p.elementId || "(unlabeled)";
    const key = p.elementId || label;
    const cur = counts.get(key);
    if (cur) cur.count += p.weight || 1;
    else counts.set(key, { key, label, count: p.weight || 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/* ---------------------------------------------------------------- */
/* Canvas rendering                                                 */
/* ---------------------------------------------------------------- */

// Cold → hot ramp aligned to the app's FUNNEL palette.
const RAMP: { stop: number; color: string }[] = [
  { stop: 0.0, color: "rgba(75,147,255,0)" },
  { stop: 0.14, color: "rgba(75,147,255,0.55)" },
  { stop: 0.4, color: "rgba(75,192,192,0.72)" },
  { stop: 0.6, color: "rgba(240,180,41,0.84)" },
  { stop: 0.78, color: "rgba(247,142,61,0.92)" },
  { stop: 1.0, color: "rgba(217,65,79,0.96)" },
];

// Cool → warm "attention" ramp (indigo → magenta → amber) so the Look map reads
// as a distinct lens from the click heatmap while sharing the same machinery.
const RAMP_LOOK: { stop: number; color: string }[] = [
  { stop: 0.0, color: "rgba(99,102,241,0)" },
  { stop: 0.16, color: "rgba(99,102,241,0.5)" },
  { stop: 0.42, color: "rgba(139,92,246,0.72)" },
  { stop: 0.62, color: "rgba(217,70,239,0.82)" },
  { stop: 0.8, color: "rgba(244,114,61,0.9)" },
  { stop: 1.0, color: "rgba(250,204,21,0.96)" },
];

export type HeatRamp = "click" | "look";

const _lut: Record<HeatRamp, Uint8ClampedArray | null> = { click: null, look: null };

function gradientLut(kind: HeatRamp): Uint8ClampedArray {
  const cached = _lut[kind];
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const s of kind === "look" ? RAMP_LOOK : RAMP) grad.addColorStop(s.stop, s.color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 256);
  const data = g.getImageData(0, 0, 1, 256).data;
  _lut[kind] = data;
  return data;
}

export interface DrawOpts {
  radius: number; // css px
  intensity: number; // 0..1 multiplier on normalization
  ramp?: HeatRamp;
}

export function drawHeatmap(canvas: HTMLCanvasElement, points: HeatPoint[], opts: DrawOpts) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!points.length) return;

  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const r = Math.max(4, opts.radius) * dpr;

  // Pass 1 — accumulate a grayscale intensity field via additive radial blobs.
  const perPointAlpha = 0.16;
  ctx.globalCompositeOperation = "source-over";
  for (const p of points) {
    const x = p.nx * w;
    const y = p.ny * h;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${perPointAlpha * (p.weight || 1)})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pass 2 — map the accumulated alpha through the cold→hot LUT.
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  let maxA = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > maxA) maxA = data[i];
  if (maxA === 0) return;
  const norm = (255 / maxA) * clamp01(opts.intensity);
  const lut = gradientLut(opts.ramp ?? "click");
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue;
    let t = a * norm;
    if (t > 255) t = 255;
    const li = (t | 0) * 4;
    data[i] = lut[li];
    data[i + 1] = lut[li + 1];
    data[i + 2] = lut[li + 2];
    data[i + 3] = lut[li + 3];
  }
  ctx.putImageData(img, 0, 0);
}

/** CSS gradient string mirroring the canvas ramp — for the legend swatch. */
export function legendGradient(kind: HeatRamp): string {
  return kind === "look"
    ? "linear-gradient(90deg,#6366f1,#8b5cf6,#d946ef,#f4723d,#facc15)"
    : "linear-gradient(90deg,#4b93ff,#4bc0c0,#f0b429,#f78e3d,#d9414f)";
}

/* ---------------------------------------------------------------- */
/* Presentational chrome                                            */
/* ---------------------------------------------------------------- */

export function Slider({
  label,
  min,
  max,
  value,
  onChange,
  suffix,
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-24 cursor-pointer accent-primary"
      />
      <span className="w-9 tabular-nums text-foreground/70">
        {value}
        {suffix}
      </span>
    </label>
  );
}

export function HeatLegend({ ramp = "click" }: { ramp?: HeatRamp }) {
  return (
    <div className="flex items-center gap-2">
      <span>Low</span>
      <span className="h-2 w-28 rounded" style={{ background: legendGradient(ramp) }} />
      <span>High</span>
    </div>
  );
}

/** Faint page skeleton so the heatmap has spatial context (header/hero/grid/footer). */
export function PageWireframe({ className }: { className?: string }) {
  const stroke = "hsl(var(--border))";
  const fill = "hsl(var(--muted))";
  return (
    <svg
      viewBox="0 0 100 142"
      preserveAspectRatio="none"
      className={cn("absolute inset-0 h-full w-full", className)}
      style={{ opacity: 0.5 }}
      aria-hidden
    >
      {/* header */}
      <rect x="0" y="0" width="100" height="9" fill={fill} opacity="0.5" />
      <rect x="5" y="3.2" width="16" height="2.6" rx="1" fill={stroke} />
      <rect x="66" y="3.2" width="9" height="2.6" rx="1" fill={stroke} />
      <rect x="77" y="3.2" width="9" height="2.6" rx="1" fill={stroke} />
      <rect x="88" y="2.8" width="10" height="3.4" rx="1.5" fill="hsl(var(--primary))" opacity="0.55" />
      {/* hero */}
      <rect x="18" y="20" width="64" height="4.5" rx="1" fill={stroke} />
      <rect x="26" y="27" width="48" height="3" rx="1" fill={stroke} opacity="0.7" />
      <rect x="40" y="35" width="20" height="5.5" rx="1.5" fill="hsl(var(--primary))" opacity="0.5" />
      {/* content grid */}
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={8 + i * 30}
          y="58"
          width="26"
          height="26"
          rx="2"
          fill={fill}
          opacity="0.45"
          stroke={stroke}
          strokeWidth="0.4"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <rect
          key={`b${i}`}
          x={8 + i * 30}
          y="90"
          width="26"
          height="26"
          rx="2"
          fill={fill}
          opacity="0.45"
          stroke={stroke}
          strokeWidth="0.4"
        />
      ))}
      {/* footer */}
      <rect x="0" y="126" width="100" height="16" fill={fill} opacity="0.5" />
      <rect x="8" y="131" width="18" height="2.4" rx="1" fill={stroke} />
      <rect x="40" y="131" width="18" height="2.4" rx="1" fill={stroke} />
      <rect x="72" y="131" width="18" height="2.4" rx="1" fill={stroke} />
    </svg>
  );
}
