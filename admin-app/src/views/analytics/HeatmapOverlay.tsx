/**
 * HeatmapOverlay — the flagship "Clarity / Hotjar"-style visual heatmap.
 *
 * Renders a full-page SCREENSHOT of a live DSM page and paints behavioural
 * telemetry directly on top of it, pixel-registered to the real layout:
 *   • Click     — Gaussian click-density blobs (cold→hot).
 *   • Move       — attention / hover dwell field (indigo→amber lens).
 *   • Scroll     — a vertical reach gradient + fold markers showing the % of
 *                  sessions that reached each depth of the page.
 *
 * Coordinates are NORMALIZED to a fraction of the page: every click's x is
 * divided by the captured viewport width (metadata `vw`/`innerWidth`, falling
 * back to 1440px) and its y by the document height (`dh`/`docHeight`, falling
 * back to the observed extent). The normalized [0,1] point then maps 1:1 onto
 * the screenshot regardless of how wide it renders — so hotspots land on the
 * actual button, card or hero they belong to.
 *
 * Screenshots live in `public/heatmap-pages/<slug>.png` (captured with headless
 * Chrome at 1440px wide). Live telemetry flows through the shared seed-aware
 * data hook, so the overlay renders the deterministic seed until the Apps Script
 * read endpoint is deployed. Pages whose screenshot could not be captured (dead
 * API loaders) degrade to a styled dark frame — the heatmap still draws.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Eye,
  Flame,
  ImageOff,
  MonitorSmartphone,
  MousePointerClick,
  MoveVertical,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent } from "@/lib/ecommerce";
import { extractScrollDepth } from "@/lib/scrollmap";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile } from "./shell";
import {
  clamp01,
  drawHeatmap,
  field,
  HeatLegend,
  legendGradient,
  meta,
  normalizePath,
  num,
  Slider,
  topElements,
  type HeatPoint,
} from "./heatmapKit";

/* ------------------------------------------------------------------ */
/* Page registry — screenshot slots + telemetry path matchers          */
/* ------------------------------------------------------------------ */

interface PageDef {
  slug: string;
  label: string;
  path: string;
  /** Public screenshot URL, or undefined when the page could not be captured. */
  image?: string;
  imgW: number;
  imgH: number;
  /** Does a normalized telemetry path belong to this screenshot? */
  match: (p: string) => boolean;
}

const SHOT = (slug: string) => `${import.meta.env.BASE_URL}heatmap-pages/${slug}.png`;

/**
 * Only the Home page currently has a live screenshot — the Store / Services /
 * Marketing / Reseller routes hang on the site's dead-API loaders, so they
 * render as styled frames. Each still aggregates any telemetry whose path
 * matches, so seed / live traffic to `/products`, `/pricing`, `/ai-lab` etc.
 * lights up the relevant slot.
 */
const PAGES: PageDef[] = [
  {
    slug: "home",
    label: "Home",
    path: "/",
    image: SHOT("home"),
    imgW: 1440,
    imgH: 3000,
    match: (p) => p === "/" || p === "" || p === "/home" || p === "/index",
  },
  {
    slug: "store",
    label: "Store",
    path: "/store",
    imgW: 1440,
    imgH: 3000,
    match: (p) => /^\/(store|storefront|products?|shop|catalog|pdp|cart|checkout|item)/.test(p),
  },
  {
    slug: "services",
    label: "Services",
    path: "/services",
    imgW: 1440,
    imgH: 3000,
    match: (p) => /^\/(services|service|pricing|plans|ai-?lab|enterprise|support)/.test(p),
  },
  {
    slug: "marketing",
    label: "Marketing",
    path: "/marketing",
    imgW: 1440,
    imgH: 3000,
    match: (p) => /^\/(marketing|about|portfolio|blog|case)/.test(p),
  },
  {
    slug: "reseller",
    label: "Reseller",
    path: "/reseller",
    imgW: 1440,
    imgH: 3000,
    match: (p) => /^\/(reseller|account|partner|affiliate)/.test(p),
  },
];

const PAGE_BY_SLUG: Record<string, PageDef> = Object.fromEntries(PAGES.map((p) => [p.slug, p]));

function cleanPath(url: string): string {
  const p = normalizePath(url).split("?")[0].split("#")[0].toLowerCase();
  const trimmed = p.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Map a telemetry pageUrl to the screenshot slot it belongs to (default Home). */
function matchSlug(url: string): string {
  const p = cleanPath(url);
  for (const pg of PAGES) if (pg.match(p)) return pg.slug;
  return "home";
}

/* ------------------------------------------------------------------ */
/* Telemetry → normalized points, grouped by screenshot slot           */
/* ------------------------------------------------------------------ */

function isClick(e: TelemetryEvent): boolean {
  const t = String(field(e, "eventType", "event_type") ?? "").toLowerCase();
  if (t === "click" || t === "tap") return true;
  const n = String(field(e, "event", "event_name") ?? "").toLowerCase();
  return /click|tap|press/.test(n);
}

function isMove(e: TelemetryEvent): boolean {
  const t = String(field(e, "eventType", "event_type") ?? "").toLowerCase();
  if (/hover|mousemove|move|mouseover|pointermove|dwell/.test(t)) return true;
  const n = String(field(e, "event", "event_name") ?? "").toLowerCase();
  return /hover|mousemove|attention|dwell|(^|_)move/.test(n);
}

interface RawPt {
  x: number;
  y: number;
  vw?: number;
  dh?: number;
  weight: number;
  elementId: string;
  elementText: string;
}

/**
 * Build normalized [0,1] heat points per screenshot slot for the events passing
 * `keep`. Width divides by captured viewport (meta.vw / innerWidth, else the
 * observed extent ≈ 1440); height divides by document height (meta.dh, else the
 * observed extent) — the "% of page" normalization the overlay registers on.
 */
function buildPoints(
  events: TelemetryEvent[],
  keep: (e: TelemetryEvent) => boolean,
  weightOf: (e: TelemetryEvent) => number,
): Record<string, HeatPoint[]> {
  const rawBySlug: Record<string, RawPt[]> = {};
  for (const e of events) {
    if (!keep(e)) continue;
    const x = num(field(e, "x"));
    const y = num(field(e, "y"));
    if (x == null || y == null) continue;
    const slug = matchSlug(String(field(e, "pageUrl", "page_url") ?? ""));
    const m = meta(e);
    const vw = num(m.vw ?? m.viewportWidth ?? m.innerWidth ?? m.vpW);
    const dh = num(
      m.dh ?? m.docHeight ?? m.pageHeight ?? m.scrollHeight ?? m.vh ?? m.viewportHeight ?? m.innerHeight,
    );
    (rawBySlug[slug] ??= []).push({
      x,
      y,
      vw: vw && vw > 0 ? vw : undefined,
      dh: dh && dh > 0 ? dh : undefined,
      weight: weightOf(e),
      elementId: String(field(e, "elementId", "element_id") ?? ""),
      elementText: String(field(e, "elementText", "element_text") ?? ""),
    });
  }

  const out: Record<string, HeatPoint[]> = {};
  for (const [slug, raw] of Object.entries(rawBySlug)) {
    // Observed extents cover events with no viewport hint (raw-pixel data);
    // ≈1440 for desktop pixels, ≈100 when the site already sends percentages.
    let maxX = 1;
    let maxY = 1;
    for (const r of raw) {
      if (!r.vw) maxX = Math.max(maxX, r.x);
      if (!r.dh) maxY = Math.max(maxY, r.y);
    }
    maxX = Math.max(maxX * 1.02, 1);
    maxY = Math.max(maxY * 1.02, 1);
    out[slug] = raw.map((r) => ({
      nx: clamp01(r.x / (r.vw ?? maxX)),
      ny: clamp01(r.y / (r.dh ?? maxY)),
      weight: r.weight,
      elementId: r.elementId,
      elementText: r.elementText,
    }));
  }
  return out;
}

interface ScrollSlot {
  sessions: number;
  scrolled: number;
  avgDepth: number;
  bands: { depth: number; reach: number }[];
  reach75: number;
  reach50: number;
  reach25: number;
}

const BAND_STEP = 4;

/** Cumulative scroll-reach curve per screenshot slot. */
function buildScroll(events: TelemetryEvent[]): Record<string, ScrollSlot> {
  interface Acc {
    max: Map<string, number>;
    all: Set<string>;
  }
  const bySlug: Record<string, Acc> = {};
  events.forEach((e, i) => {
    const slug = matchSlug(String(field(e, "pageUrl", "page_url") ?? ""));
    const acc = (bySlug[slug] ??= { max: new Map(), all: new Set() });
    const sk =
      (e.sessionId ?? e.anonymousId) != null && String(e.sessionId ?? e.anonymousId) !== ""
        ? String(e.sessionId ?? e.anonymousId)
        : `__ev${i}`;
    acc.all.add(sk);
    const d = extractScrollDepth(e);
    if (d != null) acc.max.set(sk, Math.max(acc.max.get(sk) ?? 0, d));
  });

  const out: Record<string, ScrollSlot> = {};
  for (const [slug, acc] of Object.entries(bySlug)) {
    const total = acc.all.size || 1;
    const depths = [...acc.all].map((s) => acc.max.get(s) ?? 0);
    const scrolled = depths.filter((d) => d > 0).length;
    const avgDepth = depths.reduce((a, b) => a + b, 0) / total;
    const bands: { depth: number; reach: number }[] = [];
    for (let d = 0; d <= 100; d += BAND_STEP) {
      const n = depths.filter((v) => v >= d).length;
      bands.push({ depth: d, reach: (n / total) * 100 });
    }
    const thr = (t: number) => {
      let deep = 0;
      for (const b of bands) if (b.reach >= t) deep = b.depth;
      return deep;
    };
    out[slug] = {
      sessions: acc.all.size,
      scrolled,
      avgDepth,
      bands,
      reach75: thr(75),
      reach50: thr(50),
      reach25: thr(25),
    };
  }
  return out;
}

function reachAt(bands: { depth: number; reach: number }[], depthPct: number): number {
  if (!bands.length) return 0;
  const pos = depthPct / BAND_STEP;
  const lo = Math.max(0, Math.min(bands.length - 1, Math.floor(pos)));
  const hi = Math.min(bands.length - 1, lo + 1);
  const f = pos - lo;
  return bands[lo].reach * (1 - f) + bands[hi].reach * f;
}

/* Cold→hot ramp for the scroll gradient (mirrors the click LUT feel). */
function scrollColor(t: number): [number, number, number] {
  const stops: [number, number, number, number][] = [
    [0.0, 75, 147, 255],
    [0.35, 75, 192, 192],
    [0.6, 240, 180, 41],
    [0.8, 247, 142, 61],
    [1.0, 217, 65, 79],
  ];
  const c = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (c <= stops[i][0]) {
      const a = stops[i - 1];
      const b = stops[i];
      const f = (c - a[0]) / (b[0] - a[0] || 1);
      return [
        Math.round(a[1] + (b[1] - a[1]) * f),
        Math.round(a[2] + (b[2] - a[2]) * f),
        Math.round(a[3] + (b[3] - a[3]) * f),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type LayerKey = "click" | "move" | "scroll";

export function HeatmapOverlay({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });

  // Derive every layer once per dataset.
  const clicksBySlug = useMemo(() => buildPoints(events, isClick, () => 1), [events]);
  const movesBySlug = useMemo(
    () =>
      buildPoints(events, isMove, (e) => {
        const m = meta(e);
        const dwell = num(m.dwellMs ?? m.dwell ?? m.durationMs ?? m.ms);
        return dwell ? Math.min(6, Math.max(0.6, dwell / 1200)) : 1;
      }),
    [events],
  );
  const scrollBySlug = useMemo(() => buildScroll(events), [events]);

  // Page selector — default to the busiest slot that has a screenshot.
  const pageStats = useMemo(() => {
    return PAGES.map((p) => ({
      def: p,
      clicks: clicksBySlug[p.slug]?.length ?? 0,
      moves: movesBySlug[p.slug]?.length ?? 0,
      sessions: scrollBySlug[p.slug]?.sessions ?? 0,
    }));
  }, [clicksBySlug, movesBySlug, scrollBySlug]);

  const [slug, setSlug] = useState<string>("home");
  const page = PAGE_BY_SLUG[slug] ?? PAGES[0];

  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    click: true,
    move: false,
    scroll: false,
  });
  const [opacity, setOpacity] = useState(85);
  const [radius, setRadius] = useState(30);

  const clicks = clicksBySlug[slug] ?? [];
  const moves = movesBySlug[slug] ?? [];
  const scroll = scrollBySlug[slug];
  const ranked = useMemo(() => topElements(clicks), [clicks]);
  const activeLayer: LayerKey = layers.click ? "click" : layers.move ? "move" : "scroll";

  // Sizing — screenshot renders full container width; canvases match its box.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const clickCanvas = useRef<HTMLCanvasElement | null>(null);
  const moveCanvas = useRef<HTMLCanvasElement | null>(null);
  const scrollCanvas = useRef<HTMLCanvasElement | null>(null);
  const [dispW, setDispW] = useState(0);
  const dispH = dispW * (page.imgH / page.imgW);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDispW(el.clientWidth));
    ro.observe(el);
    setDispW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // (Re)draw every layer whenever inputs change.
  useEffect(() => {
    if (dispW === 0) return;
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    const setup = (c: HTMLCanvasElement | null) => {
      if (!c) return null;
      c.width = Math.round(dispW * dpr);
      c.height = Math.round(dispH * dpr);
      c.style.width = `${dispW}px`;
      c.style.height = `${dispH}px`;
      return c;
    };

    const cc = setup(clickCanvas.current);
    if (cc) {
      if (layers.click) drawHeatmap(cc, clicks, { radius, intensity: 0.9, ramp: "click" });
      else cc.getContext("2d")?.clearRect(0, 0, cc.width, cc.height);
    }

    const mc = setup(moveCanvas.current);
    if (mc) {
      if (layers.move) drawHeatmap(mc, moves, { radius: radius + 8, intensity: 0.85, ramp: "look" });
      else mc.getContext("2d")?.clearRect(0, 0, mc.width, mc.height);
    }

    const sc = setup(scrollCanvas.current);
    if (sc) {
      const ctx = sc.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, sc.width, sc.height);
        if (layers.scroll && scroll) drawScroll(ctx, scroll.bands, sc.width, sc.height);
      }
    }
  }, [dispW, dispH, clicks, moves, scroll, layers, radius, slug]);

  // Click-count hover readout (only meaningful for the click layer).
  const [hover, setHover] = useState<{ x: number; y: number; count: number; label: string } | null>(
    null,
  );
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!layers.click || dispW === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - box.left;
    const cy = e.clientY - box.top;
    let count = 0;
    const labels = new Map<string, number>();
    for (const p of clicks) {
      const dx = (p.nx * dispW - cx) / radius;
      const dy = (p.ny * dispH - cy) / radius;
      if (dx * dx + dy * dy <= 1) {
        count += 1;
        const l = p.elementText?.trim() || p.elementId || "";
        if (l) labels.set(l, (labels.get(l) ?? 0) + 1);
      }
    }
    if (count === 0) return setHover(null);
    const top = [...labels.entries()].sort((a, b) => b[1] - a[1])[0];
    setHover({ x: cx, y: cy, count, label: top ? top[0] : "" });
  };

  const totalClicks = clicks.length;
  const toggle = (k: LayerKey) => setLayers((s) => ({ ...s, [k]: !s[k] }));

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Flame className="h-4 w-4 text-primary" />}
        title="Heatmap overlay"
        subtitle="A full-page screenshot of the live site with click density, attention and scroll-reach painted on top — Clarity-style. Coordinates are normalized to a fraction of the page so hotspots register on the real layout."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <Badge variant="muted" className="gap-1 tabular-nums">
            <MonitorSmartphone className="h-3 w-3" /> 1440w capture
          </Badge>
        }
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Flame className="h-7 w-7" />} />
      ) : (
        <>
      {/* Page selector — one tab per screenshot slot */}
      <div className="flex flex-wrap items-center gap-2">
        {pageStats.map(({ def, clicks: c, sessions }) => {
          const on = def.slug === slug;
          return (
            <button
              key={def.slug}
              onClick={() => setSlug(def.slug)}
              className={cn(
                "group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                on
                  ? "border-primary/50 bg-primary/15 text-foreground shadow-[0_0_0_1px_rgba(217,65,79,0.25)]"
                  : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
              )}
            >
              {def.image ? (
                <Camera className={cn("h-3.5 w-3.5", on ? "text-primary" : "text-muted-foreground")} />
              ) : (
                <ImageOff className="h-3.5 w-3.5 text-muted-foreground/60" />
              )}
              <span>{def.label}</span>
              <span className="tabular-nums text-[10px] text-muted-foreground">
                {c > 0 ? `${c} clk` : `${sessions} s`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Screenshot + overlay */}
        <div className="rounded-xl border border-border bg-[#0b0c0f] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-foreground/80">{page.path}</span>
              {!page.image && (
                <Badge variant="warn" className="gap-1">
                  <ImageOff className="h-3 w-3" /> screenshot pending
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <LayerToggle
                icon={<MousePointerClick className="h-3.5 w-3.5" />}
                label="Click"
                on={layers.click}
                onClick={() => toggle("click")}
              />
              <LayerToggle
                icon={<Eye className="h-3.5 w-3.5" />}
                label="Move"
                on={layers.move}
                onClick={() => toggle("move")}
              />
              <LayerToggle
                icon={<MoveVertical className="h-3.5 w-3.5" />}
                label="Scroll"
                on={layers.scroll}
                onClick={() => toggle("scroll")}
              />
            </div>
          </div>

          {/* Scroll container so the tall page can be inspected top-to-bottom */}
          <div className="max-h-[76vh] overflow-y-auto overflow-x-hidden rounded-lg border border-border/70 bg-black">
            <div ref={wrapRef} className="relative mx-auto w-full">
              <div
                className="relative w-full"
                style={{ height: dispH || undefined }}
                onMouseMove={onMove}
                onMouseLeave={() => setHover(null)}
              >
                {page.image ? (
                  <img
                    src={page.image}
                    alt={`${page.label} page screenshot`}
                    className="absolute inset-0 h-full w-full select-none object-cover object-top"
                    draggable={false}
                  />
                ) : (
                  <PlaceholderFrame label={page.label} />
                )}

                {/* Layer canvases, opacity-controlled, stacked scroll→move→click */}
                <canvas
                  ref={scrollCanvas}
                  className="pointer-events-none absolute inset-0"
                  style={{ opacity: layers.scroll ? opacity / 100 : 0, zIndex: 1 }}
                />
                <canvas
                  ref={moveCanvas}
                  className="pointer-events-none absolute inset-0"
                  style={{ opacity: layers.move ? opacity / 100 : 0, zIndex: 2 }}
                />
                <canvas
                  ref={clickCanvas}
                  className="pointer-events-none absolute inset-0"
                  style={{ opacity: layers.click ? opacity / 100 : 0, zIndex: 3 }}
                />

                {/* Scroll fold markers */}
                {layers.scroll && scroll && (
                  <>
                    {[
                      { pct: scroll.reach75, tone: "#4bc0c0", label: "75% reach" },
                      { pct: scroll.reach50, tone: "#f0b429", label: "50% reach" },
                      { pct: scroll.reach25, tone: "#d9414f", label: "25% reach" },
                    ].map((m) => (
                      <div
                        key={m.label}
                        className="pointer-events-none absolute left-0 right-0 z-[4] flex items-center"
                        style={{ top: (m.pct / 100) * dispH }}
                      >
                        <span
                          className="h-px w-full"
                          style={{ background: m.tone, boxShadow: `0 0 6px ${m.tone}` }}
                        />
                        <span
                          className="absolute right-2 -translate-y-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium tabular-nums"
                          style={{ color: m.tone }}
                        >
                          {m.label} · {m.pct}%
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {hover && (
                  <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-primary/40 bg-[#14161a] px-2 py-1 text-[11px] shadow-xl"
                    style={{ left: hover.x, top: Math.max(hover.y - 8, 12) }}
                  >
                    <div className="font-semibold tabular-nums text-foreground">
                      {hover.count} click{hover.count === 1 ? "" : "s"}
                    </div>
                    {hover.label && (
                      <div className="max-w-[200px] truncate text-muted-foreground">{hover.label}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Control + insight rail */}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Clicks" value={totalClicks.toLocaleString("en-US")} tone="primary" />
            <StatTile label="Move samples" value={moves.length.toLocaleString("en-US")} />
            <StatTile label="Sessions" value={(scroll?.sessions ?? 0).toLocaleString("en-US")} />
            <StatTile
              label="Avg scroll"
              value={`${Math.round(scroll?.avgDepth ?? 0)}%`}
              tone="ok"
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Overlay controls
            </div>
            <div className="flex flex-col gap-3 text-[11px] text-muted-foreground">
              <Slider
                label="Opacity"
                min={20}
                max={100}
                value={opacity}
                onChange={setOpacity}
                suffix="%"
              />
              <Slider label="Radius" min={12} max={70} value={radius} onChange={setRadius} suffix="px" />
              <div className="flex items-center gap-2 pt-1">
                <span className="w-12 text-foreground/70">Legend</span>
                {activeLayer === "scroll" ? (
                  <div className="flex items-center gap-2">
                    <span>Top</span>
                    <span
                      className="h-2 w-24 rounded"
                      style={{ background: "linear-gradient(90deg,#d9414f,#f0b429,#4bc0c0,#4b93ff)" }}
                    />
                    <span>Bottom</span>
                  </div>
                ) : (
                  <HeatLegend ramp={activeLayer === "move" ? "look" : "click"} />
                )}
              </div>
            </div>
          </div>

          {/* Layer explainer */}
          <div className="rounded-xl border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
            <LayerLine
              on={layers.click}
              swatch={legendGradient("click")}
              title="Click"
              body="Density of tap/click events — hot spots are the most-clicked pixels."
            />
            <LayerLine
              on={layers.move}
              swatch={legendGradient("look")}
              title="Move · attention"
              body="Hover / dwell field weighted by time spent — where eyes and cursor linger."
            />
            <LayerLine
              on={layers.scroll}
              swatch="linear-gradient(90deg,#d9414f,#f0b429,#4b93ff)"
              title="Scroll depth"
              body="% of sessions reaching each depth; fold lines mark 75 / 50 / 25% reach."
            />
          </div>

          {/* Most-clicked elements */}
          {ranked.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Most-clicked elements
              </div>
              <div className="flex flex-col gap-1.5">
                {ranked.slice(0, 8).map((r) => (
                  <div key={r.key} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{r.label}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(r.count)}</span>
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded bg-muted sm:block">
                      <span
                        className="block h-full rounded bg-primary"
                        style={{ width: `${(r.count / ranked[0].count) * 100}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll gradient painter                                            */
/* ------------------------------------------------------------------ */

function drawScroll(
  ctx: CanvasRenderingContext2D,
  bands: { depth: number; reach: number }[],
  w: number,
  h: number,
) {
  const step = 2;
  for (let y = 0; y < h; y += step) {
    const depthPct = (y / h) * 100;
    const reach = reachAt(bands, depthPct);
    const t = clamp01(reach / 100);
    const [r, g, b] = scrollColor(t);
    ctx.fillStyle = `rgba(${r},${g},${b},${0.15 + t * 0.5})`;
    ctx.fillRect(0, y, w, step + 1);
  }
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                        */
/* ------------------------------------------------------------------ */

function LayerToggle({
  icon,
  label,
  on,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
        on
          ? "border-primary/50 bg-primary/20 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LayerLine({
  on,
  swatch,
  title,
  body,
}: {
  on: boolean;
  swatch: string;
  title: string;
  body: string;
}) {
  return (
    <div className={cn("flex gap-2 py-1", !on && "opacity-40")}>
      <span className="mt-0.5 h-3 w-3 flex-none rounded" style={{ background: swatch }} />
      <div>
        <span className="font-semibold text-foreground/90">{title}</span> — {body}
      </div>
    </div>
  );
}

function PlaceholderFrame({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="h-full w-full"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(217,65,79,0.14), transparent 60%), linear-gradient(180deg,#0d0e12,#050506)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(217,65,79,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(217,65,79,0.6) 1px,transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute inset-x-0 top-1/3 flex flex-col items-center gap-2 text-center">
        <ImageOff className="h-8 w-8 text-primary/50" />
        <div className="text-sm font-semibold text-foreground/80">{label} — screenshot pending</div>
        <div className="max-w-xs text-[11px] text-muted-foreground">
          This route currently hangs on a dead-API loader, so no screenshot could be captured. The
          heatmap still renders over this frame from live / seed telemetry.
        </div>
      </div>
    </div>
  );
}
