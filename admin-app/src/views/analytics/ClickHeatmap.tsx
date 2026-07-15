/**
 * ClickHeatmap — per-page click density heatmap on a <canvas>.
 *
 * Bins click telemetry (eventType==="click" / event ~ /click/) by normalized
 * x,y into a Gaussian intensity field, then color-ramps cold→hot over a page
 * wireframe placeholder. Hover reads the underlying points and reports the
 * click count (and dominant element) under the cursor.
 *
 * Self-contained by design: it normalizes field casing defensively (accepts
 * snake_case `event_name/page_url/element_id/...` OR camelCase) so it lights up
 * regardless of whether the ecommerce.ts ingest fix has landed, and it derives
 * its own point set + page list so it can be dropped under the shared filter
 * bar (pass a controlled `pageUrl`) or run standalone (internal selector).
 *
 * NOTE: renders empty against production until the ecommerce Apps Script grows
 * a GET read action (`?action=telemetry` → {rows:[…]}). Pass `demo` to preview
 * with synthetic clustered clicks.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, MousePointerClick } from "lucide-react";
import type { TelemetryEvent } from "@/lib/ecommerce";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Pure, unit-testable derivations                                    */
/* ------------------------------------------------------------------ */

export interface ClickPoint {
  /** normalized to [0,1] across the page frame */
  nx: number;
  ny: number;
  weight: number;
  elementId: string;
  elementText: string;
}

/** Defensive field read — tolerates snake_case or camelCase serializations. */
function field(e: TelemetryEvent, ...keys: string[]): unknown {
  const bag = e as Record<string, unknown>;
  for (const k of keys) if (bag[k] != null && bag[k] !== "") return bag[k];
  return undefined;
}

function num(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
}

function meta(e: TelemetryEvent): Record<string, unknown> {
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

export function isClickEvent(e: TelemetryEvent): boolean {
  const type = String(field(e, "eventType", "event_type") ?? "").toLowerCase();
  if (type === "click" || type === "tap") return true;
  const name = String(field(e, "event", "event_name") ?? "").toLowerCase();
  return /click|tap/.test(name);
}

export function pageUrlsFromEvents(events: TelemetryEvent[]): string[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!isClickEvent(e)) continue;
    const raw = field(e, "pageUrl", "page_url");
    const url = normalizePath(raw == null ? "" : String(raw));
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
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

/**
 * Turn click events for one page into normalized [0,1] points.
 * Coordinate space, in priority order:
 *   1. per-event viewport from metadata (vw/vh, innerWidth/innerHeight, docHeight…)
 *   2. observed max extent across the page's clicks (padded), for raw-px data
 */
export function extractClickPoints(events: TelemetryEvent[], page: string): ClickPoint[] {
  const raw: {
    x: number;
    y: number;
    vw?: number;
    vh?: number;
    elementId: string;
    elementText: string;
  }[] = [];

  for (const e of events) {
    if (!isClickEvent(e)) continue;
    const url = normalizePath(String(field(e, "pageUrl", "page_url") ?? ""));
    if (page !== ALL_PAGES && url !== page) continue;
    const x = num(field(e, "x"));
    const y = num(field(e, "y"));
    if (x == null || y == null) continue;
    const m = meta(e);
    const vw = num(m.vw ?? m.viewportWidth ?? m.innerWidth ?? m.vpW);
    const vh = num(
      m.dh ?? m.docHeight ?? m.pageHeight ?? m.scrollHeight ?? m.vh ?? m.viewportHeight ?? m.innerHeight,
    );
    raw.push({
      x,
      y,
      vw: vw && vw > 0 ? vw : undefined,
      vh: vh && vh > 0 ? vh : undefined,
      elementId: String(field(e, "elementId", "element_id") ?? ""),
      elementText: String(field(e, "elementText", "element_text") ?? ""),
    });
  }
  if (!raw.length) return [];

  // Fallback extent for events that carry no viewport hint.
  let maxX = 1;
  let maxY = 1;
  for (const r of raw) {
    if (!r.vw) maxX = Math.max(maxX, r.x);
    if (!r.vh) maxY = Math.max(maxY, r.y);
  }
  maxX *= 1.02;
  maxY *= 1.02;

  return raw.map((r) => {
    const nx = clamp01(r.x / (r.vw ?? maxX));
    const ny = clamp01(r.y / (r.vh ?? maxY));
    return { nx, ny, weight: 1, elementId: r.elementId, elementText: r.elementText };
  });
}

export interface ElementRank {
  key: string;
  label: string;
  count: number;
}

/** Rank clicked elements by frequency for the accompanying table. */
export function topElements(points: ClickPoint[], limit = 12): ElementRank[] {
  const counts = new Map<string, ElementRank>();
  for (const p of points) {
    const label = p.elementText?.trim() || p.elementId || "(unlabeled)";
    const key = p.elementId || label;
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { key, label, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

const ALL_PAGES = "__all__";

/** Synthetic clustered clicks for dev/preview (only used when `demo`). */
export function sampleClickEvents(): TelemetryEvent[] {
  const out: TelemetryEvent[] = [];
  const clusters = [
    { x: 0.5, y: 0.08, n: 90, id: "nav-cta", text: "Get My Quote" }, // header CTA
    { x: 0.5, y: 0.34, n: 140, id: "hero-cta", text: "Start Free" }, // hero
    { x: 0.28, y: 0.62, n: 60, id: "card-1", text: "DSM" },
    { x: 0.72, y: 0.62, n: 40, id: "card-2", text: "Virtual Try-On" },
    { x: 0.5, y: 0.9, n: 25, id: "footer-link", text: "Contact" },
  ];
  const vw = 1440;
  const vh = 3200;
  for (const c of clusters) {
    for (let i = 0; i < c.n; i++) {
      const gx = c.x + (Math.random() - 0.5) * 0.09 + (Math.random() - 0.5) * 0.05;
      const gy = c.y + (Math.random() - 0.5) * 0.07 + (Math.random() - 0.5) * 0.04;
      out.push({
        eventType: "click",
        event: "click",
        pageUrl: "https://dsm.example/",
        x: Math.round(clamp01(gx) * vw),
        y: Math.round(clamp01(gy) * vh),
        elementId: c.id,
        elementText: c.text,
        metadata: { vw, dh: vh },
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Canvas rendering                                                    */
/* ------------------------------------------------------------------ */

// Cold → hot ramp aligned to the app's FUNNEL palette.
const RAMP: { stop: number; color: string }[] = [
  { stop: 0.0, color: "rgba(75,147,255,0)" },
  { stop: 0.14, color: "rgba(75,147,255,0.55)" },
  { stop: 0.4, color: "rgba(75,192,192,0.72)" },
  { stop: 0.6, color: "rgba(240,180,41,0.84)" },
  { stop: 0.78, color: "rgba(247,142,61,0.92)" },
  { stop: 1.0, color: "rgba(217,65,79,0.96)" },
];

let _lut: Uint8ClampedArray | null = null;
function gradientLut(): Uint8ClampedArray {
  if (_lut) return _lut;
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  for (const s of RAMP) grad.addColorStop(s.stop, s.color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 256);
  _lut = g.getImageData(0, 0, 1, 256).data;
  return _lut;
}

interface DrawOpts {
  radius: number; // css px
  intensity: number; // 0..1 multiplier on normalization
}

function drawHeatmap(canvas: HTMLCanvasElement, points: ClickPoint[], opts: DrawOpts) {
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
  const lut = gradientLut();
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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const FRAME_ASPECT = 1.42; // height / width — portrait page frame

export interface ClickHeatmapProps {
  events: TelemetryEvent[];
  /** Controlled page path (from a shared filter bar). Omit for internal selector. */
  pageUrl?: string;
  onPageUrlChange?: (path: string) => void;
  /** Inject synthetic clicks when the data layer is empty (dev/preview only). */
  demo?: boolean;
  className?: string;
}

export function ClickHeatmap({
  events,
  pageUrl,
  onPageUrlChange,
  demo = false,
  className,
}: ClickHeatmapProps) {
  const data = useMemo<TelemetryEvent[]>(() => {
    const hasClicks = events.some(isClickEvent);
    return demo && !hasClicks ? sampleClickEvents() : events;
  }, [events, demo]);

  const pages = useMemo(() => pageUrlsFromEvents(data), [data]);

  const [internalPage, setInternalPage] = useState<string>("");
  const page = pageUrl ?? internalPage;

  // Default the internal selector to the busiest page once data arrives.
  useEffect(() => {
    if (pageUrl != null) return;
    if (!internalPage && pages.length) setInternalPage(pages[0]);
    else if (internalPage && internalPage !== ALL_PAGES && !pages.includes(internalPage)) {
      setInternalPage(pages[0] ?? "");
    }
  }, [pages, internalPage, pageUrl]);

  const setPage = (p: string) => {
    if (onPageUrlChange) onPageUrlChange(p);
    if (pageUrl == null) setInternalPage(p);
  };

  const points = useMemo(() => extractClickPoints(data, page || ALL_PAGES), [data, page]);
  const ranked = useMemo(() => topElements(points), [points]);

  const [radius, setRadius] = useState(26);
  const [intensity, setIntensity] = useState(0.85);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    count: number;
    label: string;
  } | null>(null);

  // Track container width → derive canvas box (portrait, capped).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cw = Math.min(el.clientWidth, 560);
      setSize({ w: cw, h: Math.round(cw * FRAME_ASPECT) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render the heatmap whenever inputs change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    drawHeatmap(canvas, points, { radius, intensity });
  }, [points, size, radius, intensity]);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - box.left;
    const cy = e.clientY - box.top;
    if (size.w === 0) return;
    let count = 0;
    const labels = new Map<string, number>();
    for (const p of points) {
      const dx = (p.nx * size.w - cx) / radius;
      const dy = (p.ny * size.h - cy) / radius;
      if (dx * dx + dy * dy <= 1) {
        count += 1;
        const l = p.elementText?.trim() || p.elementId || "";
        if (l) labels.set(l, (labels.get(l) ?? 0) + 1);
      }
    }
    if (count === 0) {
      setHover(null);
      return;
    }
    const top = [...labels.entries()].sort((a, b) => b[1] - a[1])[0];
    setHover({ x: cx, y: cy, count, label: top ? top[0] : "" });
  };

  const totalClicks = points.length;

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-warn" />
          <CardTitle>Click heatmap</CardTitle>
          <Badge variant="muted" className="tabular-nums">
            {totalClicks} clicks
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={page || ""}
            onChange={(e) => setPage(e.target.value)}
            className="h-8 max-w-[220px] truncate rounded-md border border-border bg-secondary px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {pages.length > 1 && <option value={ALL_PAGES}>All pages ({pages.length})</option>}
            {pages.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            {pages.length === 0 && <option value="">No pages</option>}
          </select>
        </div>
      </CardHeader>

      <CardContent>
        {totalClicks === 0 ? (
          <Empty
            icon={<MousePointerClick className="h-8 w-8" />}
            title="No click telemetry for this page"
            hint="Waiting on the ecommerce Apps Script read endpoint (GET ?action=telemetry → {rows:[…]}). Pass demo to preview."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
            {/* Heatmap canvas over a wireframe page frame */}
            <div className="flex flex-col gap-3">
              <div ref={wrapRef} className="w-full">
                <div
                  className="relative mx-auto overflow-hidden rounded-lg border border-border bg-background"
                  style={{ width: size.w || "100%", height: size.h || undefined }}
                  onMouseMove={onMove}
                  onMouseLeave={() => setHover(null)}
                >
                  <PageWireframe />
                  <canvas
                    ref={canvasRef}
                    className="pointer-events-none absolute inset-0"
                  />
                  {hover && (
                    <div
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-[#14161a] px-2 py-1 text-[11px] shadow-lg"
                      style={{ left: hover.x, top: Math.max(hover.y - 8, 0) }}
                    >
                      <div className="font-semibold tabular-nums text-foreground">
                        {hover.count} click{hover.count === 1 ? "" : "s"}
                      </div>
                      {hover.label && (
                        <div className="max-w-[180px] truncate text-muted-foreground">
                          {hover.label}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Legend + controls */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Low</span>
                  <span
                    className="h-2 w-28 rounded"
                    style={{
                      background:
                        "linear-gradient(90deg,#4b93ff,#4bc0c0,#f0b429,#f78e3d,#d9414f)",
                    }}
                  />
                  <span>High</span>
                </div>
                <Slider
                  label="Radius"
                  min={8}
                  max={70}
                  value={radius}
                  onChange={setRadius}
                  suffix="px"
                />
                <Slider
                  label="Intensity"
                  min={20}
                  max={100}
                  value={Math.round(intensity * 100)}
                  onChange={(v) => setIntensity(v / 100)}
                  suffix="%"
                />
              </div>
            </div>

            {/* Top clicked elements */}
            <div className="min-w-0">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Most-clicked elements
              </div>
              <div className="rounded-lg border border-border">
                <Table>
                  <THead>
                    <TR>
                      <TH>Element</TH>
                      <TH className="text-right">Clicks</TH>
                      <TH className="w-24 text-right">Share</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ranked.map((r) => (
                      <TR key={r.key}>
                        <TD className="max-w-[240px]">
                          <div className="truncate">{r.label}</div>
                        </TD>
                        <TD className="text-right tabular-nums">{r.count}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-muted-foreground">
                              {((r.count / totalClicks) * 100).toFixed(0)}%
                            </span>
                            <span className="hidden h-1.5 w-16 overflow-hidden rounded bg-muted sm:block">
                              <span
                                className="block h-full bg-primary"
                                style={{ width: `${(r.count / ranked[0].count) * 100}%` }}
                              />
                            </span>
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Slider({
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

/** Faint page skeleton so the heatmap has spatial context (header/hero/grid/footer). */
function PageWireframe({ className }: { className?: string }) {
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
