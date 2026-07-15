/**
 * PRODUCTS & INVENTORY report — how each product performs down the funnel and
 * how much stock is tied up, for the globally-selected date range.
 *
 * Consumes the GLOBAL date-range + compare context (`useDateRange`): KPIs carry
 * vs-previous deltas and "top / slow movers" rank by change in units sold.
 * Sections:
 *   • product funnel (view → add-to-cart → order) with stage conversion,
 *   • per-product performance (views, CTR-to-cart, view→buy conversion, revenue),
 *   • ABC (Pareto) analysis of revenue concentration,
 *   • top & slow movers vs the previous period,
 *   • inventory value & days-of-stock.
 *
 * View / cart events come from the STABLE Telemetry sheet; units & revenue from
 * the Orders sheet (via `useAnalyticsData`, deterministic-seed fallback). Unit
 * cost and on-hand stock have no column in the sheet yet, so they are DERIVED
 * deterministically and clearly labelled "modeled".
 */
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Package,
  Eye,
  ShoppingCart,
  DollarSign,
  Boxes,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Warehouse,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { fmtMoney } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { MeterBar } from "../shell";
import { useAnalyticsData } from "../useAnalyticsData";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  GRID,
  TOOLTIP,
  PALETTE,
  SERIES_COLORS,
  KpiCard,
  ChartCard,
  ReportHeader,
  deltaOf,
  fmtNum,
  fmtPct,
} from "./reportKit";
import {
  abcClass,
  buildProductIndex,
  costRatioOf,
  evTime,
  grossOf,
  isAddToCart,
  isProductView,
  productKeyOfEvent,
  productKeyOfOrder,
  qtyOf,
  stockOf,
} from "./reportMetrics";
import { ProductLink } from "../drilldown";

const DAY = 86_400_000;

interface ProdStat {
  id: string;
  name: string;
  price: number;
  views: number;
  carts: number;
  orders: number;
  units: number;
  revenue: number;
  prevUnits: number;
  viewToCart: number;
  cartToBuy: number;
  viewToBuy: number;
  // inventory
  stock: number;
  unitCost: number;
  invValue: number;
  velocity: number; // units / day
  daysOfStock: number; // Infinity when no sales
  // abc
  cumShare: number;
  abc: "A" | "B" | "C";
  unitsDelta: number | null;
}

const ABC_TONE: Record<"A" | "B" | "C", "ok" | "warn" | "muted"> = { A: "ok", B: "warn", C: "muted" };

export function ProductsReport({ config }: { config: AppConfig }) {
  const { events, orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const model = useMemo(() => {
    const curEvents = events.filter((e) => range.inRange(evTime(e)));
    const prevEvents = events.filter((e) => range.inPrev(evTime(e)));
    const curOrders = orders.filter((o) => range.inRange(evTime(o)));
    const prevOrders = orders.filter((o) => range.inPrev(evTime(o)));

    const index = buildProductIndex(events, orders);
    const currency =
      (curOrders.find((o) => o.currency)?.currency as string) ||
      (orders.find((o) => o.currency)?.currency as string) ||
      "USD";

    // Effective window length in days for stock velocity.
    let windowDays = range.days;
    if (windowDays === 0) {
      const ts = [...curOrders, ...curEvents].map(evTime).filter(Number.isFinite);
      const span = ts.length ? Math.max(...ts) - Math.min(...ts) : 30 * DAY;
      windowDays = Math.max(1, Math.round(span / DAY));
    }

    const stats = new Map<string, ProdStat>();
    const ensure = (id: string): ProdStat => {
      let s = stats.get(id);
      if (!s) {
        const info = index.get(id);
        const price = info?.price ?? 0;
        const stock = stockOf(id);
        const unitCost = price * costRatioOf(id);
        s = {
          id,
          name: info?.name ?? id,
          price,
          views: 0,
          carts: 0,
          orders: 0,
          units: 0,
          revenue: 0,
          prevUnits: 0,
          viewToCart: 0,
          cartToBuy: 0,
          viewToBuy: 0,
          stock,
          unitCost,
          invValue: stock * unitCost,
          velocity: 0,
          daysOfStock: Infinity,
          cumShare: 0,
          abc: "C",
          unitsDelta: null,
        };
        stats.set(id, s);
      }
      return s;
    };

    for (const e of curEvents) {
      const id = productKeyOfEvent(e);
      if (!id) continue;
      if (isProductView(e)) ensure(id).views += 1;
      else if (isAddToCart(e)) ensure(id).carts += 1;
    }
    for (const o of curOrders) {
      const s = ensure(productKeyOfOrder(o));
      s.orders += 1;
      s.units += qtyOf(o);
      s.revenue += grossOf(o);
      if (!s.price) s.price = grossOf(o) / (qtyOf(o) || 1);
    }
    for (const o of prevOrders) {
      const id = productKeyOfOrder(o);
      const s = stats.get(id);
      if (s) s.prevUnits += qtyOf(o);
      else ensure(id).prevUnits += qtyOf(o);
    }

    let rows = [...stats.values()];
    for (const s of rows) {
      s.viewToCart = s.views ? s.carts / s.views : 0;
      s.cartToBuy = s.carts ? s.orders / s.carts : 0;
      s.viewToBuy = s.views ? s.orders / s.views : 0;
      s.velocity = s.units / windowDays;
      s.daysOfStock = s.velocity > 0 ? s.stock / s.velocity : Infinity;
      s.unitsDelta = deltaOf(s.units, s.prevUnits);
      if (!s.invValue) s.invValue = s.stock * s.unitCost;
    }

    // ABC by revenue (Pareto).
    rows.sort((a, b) => b.revenue - a.revenue);
    const totalRev = rows.reduce((a, s) => a + s.revenue, 0) || 1;
    let cum = 0;
    for (const s of rows) {
      cum += s.revenue;
      s.cumShare = cum / totalRev;
      s.abc = abcClass(s.cumShare);
    }

    // Totals (current + previous) for KPIs.
    const t = {
      views: rows.reduce((a, s) => a + s.views, 0),
      carts: rows.reduce((a, s) => a + s.carts, 0),
      orders: rows.reduce((a, s) => a + s.orders, 0),
      units: rows.reduce((a, s) => a + s.units, 0),
      revenue: rows.reduce((a, s) => a + s.revenue, 0),
      invValue: rows.reduce((a, s) => a + s.invValue, 0),
    };
    const pViews = prevEvents.filter(isProductView).length;
    const pCarts = prevEvents.filter(isAddToCart).length;
    const pUnits = prevOrders.reduce((a, o) => a + qtyOf(o), 0);
    const pRevenue = prevOrders.reduce((a, o) => a + grossOf(o), 0);
    const pOrders = prevOrders.length;
    const prev = {
      views: pViews,
      carts: pCarts,
      units: pUnits,
      revenue: pRevenue,
      viewToBuy: pViews ? pOrders / pViews : 0,
    };
    const viewToBuy = t.views ? t.orders / t.views : 0;

    // Charts.
    const funnel = [
      { stage: "Product views", value: t.views, color: PALETTE.primary },
      { stage: "Add to cart", value: t.carts, color: PALETTE.violet },
      { stage: "Orders", value: t.orders, color: PALETTE.ok },
    ];
    const topRevenue = rows.slice(0, 8).map((s) => ({ name: s.name, revenue: Math.round(s.revenue) }));
    const pareto = rows.slice(0, 12).map((s) => ({
      name: s.name,
      revenue: Math.round(s.revenue),
      cum: +(s.cumShare * 100).toFixed(1),
    }));
    const convByProduct = [...rows]
      .filter((s) => s.views >= 2)
      .sort((a, b) => b.viewToBuy - a.viewToBuy)
      .slice(0, 8)
      .map((s) => ({ name: s.name, rate: +(s.viewToBuy * 100).toFixed(1) }));

    const movers = [...rows].filter((s) => s.units > 0 || s.prevUnits > 0);
    const topMovers = [...movers].sort((a, b) => (b.unitsDelta ?? -1) - (a.unitsDelta ?? -1)).slice(0, 5);
    const slowMovers = [...rows]
      .filter((s) => s.views >= 2)
      .sort((a, b) => a.viewToBuy - b.viewToBuy || a.units - b.units)
      .slice(0, 5);
    const inventory = [...rows].sort((a, b) => a.daysOfStock - b.daysOfStock);

    return { rows, t, prev, viewToBuy, currency, windowDays, funnel, topRevenue, pareto, convByProduct, topMovers, slowMovers, inventory };
  }, [events, orders, range]);

  const m = model;
  const money = (v: number) => fmtMoney(v, m.currency);
  const empty = m.rows.length === 0;
  const maxRev = m.topRevenue[0]?.revenue || 1;

  const dosBadge = (d: number) => {
    if (!Number.isFinite(d)) return <Badge variant="muted">no sales</Badge>;
    if (d < 14) return <Badge variant="down">low · {Math.round(d)}d</Badge>;
    if (d > 120) return <Badge variant="warn">overstock · {Math.round(d)}d</Badge>;
    return <Badge variant="ok">{Math.round(d)}d</Badge>;
  };

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Package className="h-5 w-5 text-primary" />}
        title="Products & inventory"
        subtitle="Product funnel (view → cart → order), per-product conversion & revenue, ABC revenue concentration, top / slow movers vs the previous period, and inventory value & days-of-stock — for the selected range."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {empty ? (
        <Empty
          icon={<Package className="h-8 w-8" />}
          title="No product activity in this range"
          hint="Product performance appears once product-view / add-to-cart events or orders land inside the selected window."
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Product views"
              icon={<Eye className="h-3.5 w-3.5" />}
              color={PALETTE.primary}
              value={fmtNum(m.t.views)}
              delta={deltaOf(m.t.views, m.prev.views)}
            />
            <KpiCard
              label="Add to cart"
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              color={PALETTE.violet}
              value={fmtNum(m.t.carts)}
              delta={deltaOf(m.t.carts, m.prev.carts)}
              sub={`${fmtPct(m.t.views ? m.t.carts / m.t.views : 0)} of views`}
            />
            <KpiCard
              label="Units sold"
              icon={<Boxes className="h-3.5 w-3.5" />}
              color={PALETTE.ok}
              value={fmtNum(m.t.units)}
              delta={deltaOf(m.t.units, m.prev.units)}
            />
            <KpiCard
              label="Product revenue"
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color={PALETTE.revenue}
              value={money(m.t.revenue)}
              delta={deltaOf(m.t.revenue, m.prev.revenue)}
            />
            <KpiCard
              label="View → buy"
              icon={<Percent className="h-3.5 w-3.5" />}
              color={PALETTE.amber}
              value={fmtPct(m.viewToBuy)}
              delta={deltaOf(m.viewToBuy, m.prev.viewToBuy)}
            />
            <KpiCard
              label="Inventory value"
              icon={<Warehouse className="h-3.5 w-3.5" />}
              color={PALETTE.rose}
              value={money(m.t.invValue)}
              sub="at cost · modeled"
            />
          </div>

          {/* Funnel + top revenue */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Product funnel" desc="View → add-to-cart → order, with stage conversion.">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={m.funnel} layout="vertical" margin={{ top: 8, right: 40, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => fmtNum(Number(v))} />
                  <YAxis type="category" dataKey="stage" tick={AXIS} tickLine={false} axisLine={false} width={96} />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => fmtNum(Number(v))} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={40}>
                    {m.funnel.map((f, i) => (
                      <Cell key={i} fill={f.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex items-center justify-around text-center text-[11px]">
                <div>
                  <div className="font-semibold tabular-nums text-foreground">
                    {fmtPct(m.t.views ? m.t.carts / m.t.views : 0)}
                  </div>
                  <div className="text-muted-foreground">view → cart</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums text-foreground">
                    {fmtPct(m.t.carts ? m.t.orders / m.t.carts : 0)}
                  </div>
                  <div className="text-muted-foreground">cart → order</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums text-ok">{fmtPct(m.viewToBuy)}</div>
                  <div className="text-muted-foreground">view → order</div>
                </div>
              </div>
            </ChartCard>

            <ChartCard title="Top products by revenue" desc="Highest-grossing products in the range.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={m.topRevenue} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => fmtNum(Number(v))} />
                  <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={104} />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => money(Number(v))} />
                  <Bar dataKey="revenue" radius={[0, 3, 3, 0]} maxBarSize={22}>
                    {m.topRevenue.map((_, i) => (
                      <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ABC + conversion by product */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="ABC analysis (Pareto)"
              desc="Revenue concentration — A products drive the first 80% of revenue, B the next 15%, C the rest."
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={m.pareto} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={58}
                  />
                  <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => fmtNum(Number(v))} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={AXIS} tickLine={false} axisLine={false} width={40} />
                  <Tooltip {...TOOLTIP} />
                  <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill={PALETTE.primary} radius={[3, 3, 0, 0]} maxBarSize={30} />
                  <Line yAxisId="r" type="monotone" dataKey="cum" name="Cumulative %" stroke={PALETTE.revenue} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Conversion by product" desc="Best view→buy conversion (products with ≥2 views).">
              {m.convByProduct.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Not enough product views to rank.</div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={m.convByProduct} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit="%" />
                    <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={104} />
                    <Tooltip {...TOOLTIP} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="rate" radius={[0, 3, 3, 0]} maxBarSize={22}>
                      {m.convByProduct.map((_, i) => (
                        <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Top / slow movers */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Top movers"
              desc="Biggest gain in units sold vs the previous period."
              right={<ArrowUpRight className="h-4 w-4 text-ok" />}
            >
              <div className="flex flex-col divide-y divide-border">
                {m.topMovers.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2">
                    <ProductLink id={s.id} name={s.name} className="min-w-0 truncate" />
                    <div className="flex items-center gap-3 text-xs">
                      <span className="tabular-nums text-muted-foreground">{fmtNum(s.units)} units</span>
                      <span className="w-14 text-right">
                        {s.unitsDelta == null ? (
                          <span className="text-muted-foreground">new</span>
                        ) : (
                          <span className={`inline-flex items-center gap-0.5 font-semibold tabular-nums ${s.unitsDelta >= 0 ? "text-ok" : "text-down"}`}>
                            {s.unitsDelta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                            {Math.abs(s.unitsDelta * 100).toFixed(0)}%
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <ChartCard
              title="Slow movers"
              desc="High views but weakest view→buy conversion — candidates for merchandising or price review."
              right={<Layers className="h-4 w-4 text-warn" />}
            >
              <div className="flex flex-col divide-y divide-border">
                {m.slowMovers.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2">
                    <ProductLink id={s.id} name={s.name} className="min-w-0 truncate" />
                    <div className="flex items-center gap-3 text-xs">
                      <span className="tabular-nums text-muted-foreground">{fmtNum(s.views)} views</span>
                      <Badge variant={s.viewToBuy > 0 ? "warn" : "muted"}>{fmtPct(s.viewToBuy)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Performance table */}
          <ChartCard
            title="Product performance"
            desc="Funnel and revenue per product, with ABC class."
            right={<Badge variant="muted">{m.rows.length} products</Badge>}
          >
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">Views</TH>
                    <TH className="text-right">Carts</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">View→Cart</TH>
                    <TH className="text-right">Cart→Buy</TH>
                    <TH className="text-right">Conv.</TH>
                    <TH className="text-right">Units</TH>
                    <TH className="text-right">Revenue</TH>
                    <TH className="text-center">ABC</TH>
                  </TR>
                </THead>
                <TBody>
                  {m.rows.slice(0, 20).map((s) => (
                    <TR key={s.id}>
                      <TD className="max-w-[180px] truncate" title={s.name}>
                        <ProductLink id={s.id} name={s.name} className="max-w-[180px] truncate" chevron />
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(s.views)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(s.carts)}</TD>
                      <TD className="text-right tabular-nums">{fmtNum(s.orders)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtPct(s.viewToCart)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtPct(s.cartToBuy)}</TD>
                      <TD className="text-right">
                        <Badge variant={s.viewToBuy >= 0.05 ? "ok" : s.viewToBuy > 0 ? "warn" : "muted"}>
                          {fmtPct(s.viewToBuy)}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{fmtNum(s.units)}</TD>
                      <TD className="text-right tabular-nums font-medium">{money(s.revenue)}</TD>
                      <TD className="text-center">
                        <Badge variant={ABC_TONE[s.abc]}>{s.abc}</Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </ChartCard>

          {/* Inventory table */}
          <ChartCard
            title="Inventory value & days of stock"
            desc="On-hand units, capital tied up (at modeled cost) and days-of-stock at the current sell-through rate."
            right={<Badge variant="muted">modeled stock · {m.windowDays}d velocity</Badge>}
          >
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">On hand</TH>
                    <TH className="text-right">Unit cost</TH>
                    <TH className="text-right">Inv. value</TH>
                    <TH className="text-right">Units/day</TH>
                    <TH>Sell-through</TH>
                    <TH className="text-center">Days of stock</TH>
                  </TR>
                </THead>
                <TBody>
                  {m.inventory.slice(0, 20).map((s) => {
                    const maxVel = m.inventory.reduce((a, x) => Math.max(a, x.velocity), 0) || 1;
                    return (
                      <TR key={s.id}>
                        <TD className="max-w-[180px] truncate" title={s.name}>
                          <ProductLink id={s.id} name={s.name} className="max-w-[180px] truncate" chevron />
                        </TD>
                        <TD className="text-right tabular-nums">{fmtNum(s.stock)}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">{money(s.unitCost)}</TD>
                        <TD className="text-right tabular-nums font-medium">{money(s.invValue)}</TD>
                        <TD className="text-right tabular-nums">{s.velocity.toFixed(2)}</TD>
                        <TD className="w-[160px]">
                          <MeterBar value={s.velocity} max={maxVel} tone={s.daysOfStock < 14 ? "down" : "primary"} />
                        </TD>
                        <TD className="text-center">{dosBadge(s.daysOfStock)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}

export default ProductsReport;
