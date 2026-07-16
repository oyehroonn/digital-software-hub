/**
 * ClickHeatmap — per-page click density heatmap on a <canvas>.
 *
 * Bins click telemetry (eventType==="click" / event ~ /click/) by normalized
 * x,y into a Gaussian intensity field, then color-ramps cold→hot over a page
 * wireframe placeholder. Hover reads the underlying points and reports the
 * click count (and dominant element) under the cursor.
 *
 * Field reads go through the shared heatmap kit, which tolerates snake_case
 * `event_name/page_url/element_id/…` OR camelCase — so it lights up whether the
 * ecommerce.ts normalizer ran or raw sheet rows arrive. It derives its own point
 * set + page list so it can sit under a shared filter bar (pass a controlled
 * `pageUrl`) or run standalone (internal selector).
 *
 * Real telemetry flows once the Apps Script GET read action (`?action=telemetry`
 * → {rows:[…]}) is deployed. With no real click data the component renders a
 * clean empty state — it never fabricates points.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, MousePointerClick } from "lucide-react";
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
/* Pure, unit-testable derivations                                    */
/* ------------------------------------------------------------------ */

export function isClickEvent(e: TelemetryEvent): boolean {
  const type = String(field(e, "eventType", "event_type") ?? "").toLowerCase();
  if (type === "click" || type === "tap") return true;
  const name = String(field(e, "event", "event_name") ?? "").toLowerCase();
  return /click|tap/.test(name);
}

export function pageUrlsFromClicks(events: TelemetryEvent[]): string[] {
  return pageUrlsFromEvents(events, isClickEvent);
}

/**
 * Turn click events for one page into normalized [0,1] points.
 * Coordinate space, in priority order:
 *   1. per-event viewport from metadata (vw/vh, innerWidth/innerHeight, docHeight…)
 *   2. observed max extent across the page's clicks (padded), for raw-px data
 */
export function extractClickPoints(events: TelemetryEvent[], page: string): HeatPoint[] {
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

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const FRAME_ASPECT = 1.42; // height / width — portrait page frame

export interface ClickHeatmapProps {
  events: TelemetryEvent[];
  /** Controlled page path (from a shared filter bar). Omit for internal selector. */
  pageUrl?: string;
  onPageUrlChange?: (path: string) => void;
  className?: string;
}

export function ClickHeatmap({
  events,
  pageUrl,
  onPageUrlChange,
  className,
}: ClickHeatmapProps) {
  const data = events;

  const pages = useMemo(() => pageUrlsFromClicks(data), [data]);

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
    drawHeatmap(canvas, points, { radius, intensity, ramp: "click" });
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
            hint="Click telemetry appears here once the tracking sheet is connected — share the Telemetry sheet as Viewer."
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
                  <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
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
                <HeatLegend ramp="click" />
                <Slider label="Radius" min={8} max={70} value={radius} onChange={setRadius} suffix="px" />
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
