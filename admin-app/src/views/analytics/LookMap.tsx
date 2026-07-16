/**
 * LookMap — per-page ATTENTION / dwell heatmap on a <canvas>.
 *
 * Where the Click heatmap answers "where do people click?", the Look map answers
 * "where does the eye/cursor linger?". It bins non-click positional telemetry
 * (mousemove / hover / pointer / dwell / attention / focus / visibility events)
 * by normalized x,y and weights each sample by its DWELL time (seconds) pulled
 * from metadata — so a spot someone stared at for 8s glows far hotter than a
 * spot the cursor merely swept past. Rendered through the kit's "look" ramp
 * (indigo→magenta→amber) so it reads as a distinct lens from the click map.
 *
 * Real telemetry flows once the site emits movement/dwell events and the Apps
 * Script GET read action is live. With no real dwell data the map renders a
 * clean empty state — it never fabricates attention.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, ScanEye } from "lucide-react";
import type { TelemetryEvent } from "@/lib/ecommerce";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import {
  ALL_PAGES,
  clamp01,
  drawHeatmap,
  field,
  HeatLegend,
  meta,
  normalizePath,
  num,
  PageWireframe,
  pageUrlsFromEvents,
  Slider,
  topElements,
  type HeatPoint,
} from "./heatmapKit";

/* ------------------------------------------------------------------ */
/* Attention derivations                                               */
/* ------------------------------------------------------------------ */

const ATTENTION_RE = /move|hover|mouseover|pointer|dwell|attention|look|gaze|focus|visible|engage|linger|impression|view/;
const CLICK_RE = /click|tap|press|submit/;

/** An event that expresses where attention rested (not a discrete click). */
export function isAttentionEvent(e: TelemetryEvent): boolean {
  const type = String(field(e, "eventType", "event_type") ?? "").toLowerCase();
  const name = String(field(e, "event", "event_name") ?? "").toLowerCase();
  const s = `${type} ${name}`;
  if (!ATTENTION_RE.test(s)) return false;
  // A plain "click" that also matches nothing above is excluded; but a
  // "hover_click" style name shouldn't sneak in as pure attention either.
  if (type === "click" || type === "tap") return false;
  if (CLICK_RE.test(type)) return false;
  return true;
}

/** Default dwell (seconds) for a positional sample that carries no explicit time. */
const DEFAULT_DWELL = 0.6;
const MAX_DWELL = 30;

/** Best-effort dwell time (seconds) for one event from its metadata. */
export function dwellSeconds(m: Record<string, unknown>): number {
  const ms = num(
    m.dwellMs ?? m.dwell_ms ?? m.durationMs ?? m.duration_ms ?? m.visibleMs ?? m.visible_ms ??
      m.attentionMs ?? m.engagementMs ?? m.timeMs ?? m.time_ms ?? m.hoverMs ?? m.ms,
  );
  if (ms != null) return clampDwell(ms / 1000);

  const s = num(m.dwell ?? m.dwellTime ?? m.dwell_time ?? m.duration ?? m.seconds ?? m.sec ?? m.time ?? m.hover);
  if (s != null) return clampDwell(s > 200 ? s / 1000 : s); // >200 "seconds" is really ms
  return DEFAULT_DWELL;
}

function clampDwell(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DWELL;
  return n > MAX_DWELL ? MAX_DWELL : n;
}

/** Turn attention events for one page into normalized [0,1] points weighted by dwell. */
export function extractAttentionPoints(events: TelemetryEvent[], page: string): HeatPoint[] {
  const raw: {
    x: number;
    y: number;
    w: number;
    vw?: number;
    vh?: number;
    elementId: string;
    elementText: string;
  }[] = [];

  for (const e of events) {
    if (!isAttentionEvent(e)) continue;
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
      w: dwellSeconds(m),
      vw: vw && vw > 0 ? vw : undefined,
      vh: vh && vh > 0 ? vh : undefined,
      elementId: String(field(e, "elementId", "element_id") ?? ""),
      elementText: String(field(e, "elementText", "element_text") ?? ""),
    });
  }
  if (!raw.length) return [];

  let maxX = 1;
  let maxY = 1;
  for (const r of raw) {
    if (!r.vw) maxX = Math.max(maxX, r.x);
    if (!r.vh) maxY = Math.max(maxY, r.y);
  }
  maxX *= 1.02;
  maxY *= 1.02;

  // Normalize dwell weights to a sane blob range so one long stare doesn't wash
  // the whole field out, while still ranking hotter than a quick sweep.
  const maxW = Math.max(...raw.map((r) => r.w), 1);
  return raw.map((r) => ({
    nx: clamp01(r.x / (r.vw ?? maxX)),
    ny: clamp01(r.y / (r.vh ?? maxY)),
    weight: 0.35 + (r.w / maxW) * 1.65, // 0.35..2.0
    elementId: r.elementId,
    elementText: r.elementText,
  }));
}

export function pageUrlsFromAttention(events: TelemetryEvent[]): string[] {
  return pageUrlsFromEvents(events, isAttentionEvent);
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const FRAME_ASPECT = 1.42;

export interface LookMapProps {
  events: TelemetryEvent[];
  pageUrl?: string;
  onPageUrlChange?: (path: string) => void;
  className?: string;
}

export function LookMap({ events, pageUrl, onPageUrlChange, className }: LookMapProps) {
  const data = events;

  const pages = useMemo(() => pageUrlsFromAttention(data), [data]);

  const [internalPage, setInternalPage] = useState<string>("");
  const page = pageUrl ?? internalPage;

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

  const points = useMemo(() => extractAttentionPoints(data, page || ALL_PAGES), [data, page]);
  const ranked = useMemo(() => topElements(points), [points]);

  const [radius, setRadius] = useState(34);
  const [intensity, setIntensity] = useState(0.8);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ x: number; y: number; count: number; label: string } | null>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    drawHeatmap(canvas, points, { radius, intensity, ramp: "look" });
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

  const samples = points.length;

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <CardTitle>Look map · attention</CardTitle>
          <Badge variant="muted" className="tabular-nums">
            {samples} samples
          </Badge>
        </div>
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
      </CardHeader>

      <CardContent>
        {samples === 0 ? (
          <Empty
            icon={<ScanEye className="h-8 w-8" />}
            title="No attention telemetry for this page"
            hint="The Look map needs movement / hover / dwell events carrying x,y. Attention appears here once the tracking sheet is connected — share the Telemetry sheet as Viewer."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <div ref={wrapRef} className="w-full">
                <div
                  className="relative mx-auto overflow-hidden rounded-lg border border-border bg-background"
                  style={{ width: size.w || "100%", height: size.h || undefined }}
                  onMouseMove={onMove}
                  onMouseLeave={() => setHover(null)}
                >
                  <PageWireframe />
                  <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
                  {hover && (
                    <div
                      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-[#14161a] px-2 py-1 text-[11px] shadow-lg"
                      style={{ left: hover.x, top: Math.max(hover.y - 8, 0) }}
                    >
                      <div className="font-semibold tabular-nums text-foreground">
                        {hover.count} look{hover.count === 1 ? "" : "s"}
                      </div>
                      {hover.label && (
                        <div className="max-w-[180px] truncate text-muted-foreground">{hover.label}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                <HeatLegend ramp="look" />
                <Slider label="Radius" min={10} max={80} value={radius} onChange={setRadius} suffix="px" />
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

            {/* Most-looked-at elements (ranked by dwell weight) */}
            <div className="min-w-0">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Most-looked-at elements
              </div>
              <div className="rounded-lg border border-border">
                <Table>
                  <THead>
                    <TR>
                      <TH>Element</TH>
                      <TH className="text-right">Attention</TH>
                      <TH className="w-24 text-right">Share</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {ranked.map((r) => (
                      <TR key={r.key}>
                        <TD className="max-w-[240px]">
                          <div className="truncate">{r.label}</div>
                        </TD>
                        <TD className="text-right tabular-nums">{r.count.toFixed(1)}</TD>
                        <TD className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-muted-foreground">
                              {((r.count / ranked.reduce((a, b) => a + b.count, 0)) * 100).toFixed(0)}%
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
              <p className="mt-2 text-[11px] text-muted-foreground">
                "Attention" is summed dwell weight — how long the cursor / gaze lingered on each
                element, not how often it was clicked.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
