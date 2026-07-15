/**
 * FunnelChart — conversion funnel (view → click → addToCart → checkout → order)
 * with per-visitor drop-off, overall and per product.
 *
 * Reads the data layer only: it takes raw telemetry events and derives distinct
 * session counts per stage via lib/analytics. A single-hue magnitude encoding —
 * bar length carries the count, one hue (the app `primary`) since it is a single
 * series; drop-off is a semantic loss (the `down` token) with numbers always
 * shown, so meaning never depends on color alone.
 */
import { useMemo, useState } from "react";
import {
  ChevronDown,
  CreditCard,
  Eye,
  Layers,
  MousePointerClick,
  Receipt,
  ShoppingCart,
  TrendingDown,
} from "lucide-react";
import type { TelemetryEvent } from "@/lib/ecommerce";
import {
  biggestDropStage,
  buildProductFunnels,
  buildSessionFunnel,
  type SessionFunnelStage,
} from "@/lib/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { cn } from "@/lib/utils";

const STAGE_ICON: Record<string, typeof Eye> = {
  view: Eye,
  click: MousePointerClick,
  addToCart: ShoppingCart,
  checkout: CreditCard,
  order: Receipt,
};

const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;
const num = (v: number) => v.toLocaleString("en-US");

export function FunnelChart({ events }: { events: TelemetryEvent[] }) {
  const [selected, setSelected] = useState<string>(""); // "" = overall

  const products = useMemo(() => buildProductFunnels(events), [events]);
  const overall = useMemo(() => buildSessionFunnel(events), [events]);

  const active = useMemo(() => {
    if (!selected) return overall;
    return products.find((p) => p.productId === selected)?.stages ?? overall;
  }, [selected, overall, products]);

  const activeName = selected
    ? products.find((p) => p.productId === selected)?.name ?? selected
    : "All traffic";

  const hasFunnel = active.some((s) => s.count > 0);

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conversion funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <Empty icon={<Layers className="h-8 w-8" />} title="No telemetry yet" />
        </CardContent>
      </Card>
    );
  }

  const dropIdx = biggestDropStage(active);
  const views = active[0].count;
  const orders = active[active.length - 1].count;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Conversion funnel</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Distinct visitors per stage · <span className="text-foreground/80">{activeName}</span>
            </p>
          </div>
          <div className="relative">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="h-8 appearance-none rounded-md border border-border bg-card pl-3 pr-8 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              title="Scope the funnel"
            >
              <option value="">Overall (all products)</option>
              {products.map((p) => (
                <option key={p.productId} value={p.productId}>
                  {p.name} · {num(p.stages[0].count)} views
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>

        <CardContent>
          {!hasFunnel ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No funnel activity for this selection.
            </div>
          ) : (
            <>
              <div className="flex flex-col">
                {active.map((s, i) => (
                  <FunnelRow key={s.key} stage={s} isWorstDrop={i === dropIdx} showDrop={i > 0} />
                ))}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-4">
                <SummaryStat
                  label="Overall conversion"
                  value={views ? pct(orders / views) : "—"}
                  sub={`${num(orders)} of ${num(views)} visitors`}
                  tone="ok"
                />
                <SummaryStat
                  label="Biggest drop-off"
                  value={dropIdx > 0 ? pct(active[dropIdx].dropOffPct, 0) : "—"}
                  sub={dropIdx > 0 ? `${active[dropIdx - 1].label} → ${active[dropIdx].label}` : "—"}
                  tone="down"
                />
                <SummaryStat
                  label="Reached checkout"
                  value={views ? pct(active[3].count / views) : "—"}
                  sub={`${num(active[3].count)} visitors`}
                  tone="muted"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ProductFunnelTable
        products={products}
        selected={selected}
        onSelect={(id) => setSelected(id)}
      />
    </div>
  );
}

/* --------------------------------- rows ---------------------------------- */

function FunnelRow({
  stage,
  isWorstDrop,
  showDrop,
}: {
  stage: SessionFunnelStage;
  isWorstDrop: boolean;
  showDrop: boolean;
}) {
  const Icon = STAGE_ICON[stage.key] ?? Eye;
  const gained = stage.stepRate > 1.0001;

  return (
    <div className="group">
      {/* drop-off connector above the bar (between this stage and the previous) */}
      {showDrop && (
        <div className="flex items-center justify-center py-1">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              gained
                ? "bg-ok/10 text-ok"
                : isWorstDrop
                  ? "bg-down/15 text-down"
                  : "bg-muted text-muted-foreground",
            )}
            title={
              gained
                ? `+${num(stage.count)} vs previous stage (more sessions than the prior step was tracked for)`
                : `${num(stage.lost)} visitors lost · ${pct(stage.stepRate)} continued`
            }
          >
            {gained ? (
              `↑ ${pct(stage.stepRate - 1, 0)} vs prev`
            ) : (
              <>
                <TrendingDown className="h-3 w-3" />
                {pct(stage.dropOffPct, 1)} drop · {num(stage.lost)} lost
              </>
            )}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex w-28 shrink-0 items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{stage.label}</span>
        </div>

        {/* centered funnel bar → the classic tapering silhouette */}
        <div className="relative min-w-0 flex-1">
          <div className="flex h-11 items-center justify-center rounded-md bg-muted/40">
            <div
              className="flex h-11 items-center justify-center rounded-md bg-primary/90 ring-1 ring-inset ring-primary/30 transition-[width] duration-500 group-hover:bg-primary"
              style={{ width: `${Math.max(stage.widthPct, 3)}%` }}
              title={`${stage.label}: ${num(stage.count)} visitors · ${pct(stage.rate)} of views`}
            >
              <span className="px-2 text-sm font-semibold tabular-nums text-primary-foreground">
                {num(stage.count)}
              </span>
            </div>
          </div>
        </div>

        <div className="w-20 shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums">{pct(stage.rate, 0)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">of views</div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "down" | "muted";
}) {
  const toneCls =
    tone === "ok" ? "text-ok" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="rounded-md border border-border/70 bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", toneCls)}>{value}</div>
      <div className="truncate text-[11px] text-muted-foreground" title={sub}>
        {sub}
      </div>
    </div>
  );
}

/* ---------------------------- per-product table --------------------------- */

function ProductFunnelTable({
  products,
  selected,
  onSelect,
}: {
  products: ReturnType<typeof buildProductFunnels>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const rows = products.filter((p) => p.stages[0].count > 0).slice(0, 15);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Funnel by product</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by views · click a row to scope the funnel above.
          </p>
        </div>
        {selected && (
          <button
            onClick={() => onSelect("")}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Show overall
          </button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No product-scoped telemetry yet — events aren't carrying a productId.
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">Product</th>
                  <th className="px-2 py-2 text-left font-medium">Shape</th>
                  <th className="px-2 py-2 text-right font-medium">View</th>
                  <th className="px-2 py-2 text-right font-medium">Click</th>
                  <th className="px-2 py-2 text-right font-medium">Cart</th>
                  <th className="px-2 py-2 text-right font-medium">Checkout</th>
                  <th className="px-2 py-2 text-right font-medium">Order</th>
                  <th className="px-2 py-2 text-right font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isSel = p.productId === selected;
                  return (
                    <tr
                      key={p.productId}
                      onClick={() => onSelect(isSel ? "" : p.productId)}
                      className={cn(
                        "cursor-pointer border-b border-border/50 transition-colors",
                        isSel ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <td className="max-w-[200px] px-2 py-2">
                        <div className="truncate font-medium" title={p.name}>
                          {p.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {p.productId}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <MiniFunnel stages={p.stages} />
                      </td>
                      {p.stages.map((s) => (
                        <td key={s.key} className="px-2 py-2 text-right tabular-nums">
                          {s.count ? num(s.count) : <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">
                        <Badge variant={p.conversion >= 0.02 ? "ok" : "muted"}>
                          {pct(p.conversion, 1)}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A 5-segment taper: each stage's height ∝ its share of the product's peak. */
function MiniFunnel({ stages }: { stages: SessionFunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="flex h-7 items-end gap-0.5" aria-hidden>
      {stages.map((s) => (
        <div
          key={s.key}
          className="w-3 rounded-sm bg-primary/80"
          style={{ height: `${Math.max((s.count / max) * 100, 6)}%` }}
          title={`${s.label}: ${num(s.count)}`}
        />
      ))}
    </div>
  );
}
