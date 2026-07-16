/**
 * SALES PERFORMANCE report — revenue, orders, AOV, units and top products for
 * the globally-selected date range, each with a vs-previous-period delta.
 *
 * Self-fetches the STABLE Orders + Telemetry sheets via `useAnalyticsData`
 * (deterministic-seed fallback so it renders before the read endpoint is live)
 * and consumes the GLOBAL date-range/compare context: the revenue trend overlays
 * the previous period, and every KPI shows its delta against the comparison
 * window. Recharts + the shared admin chart theme.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DollarSign, ShoppingBag, Receipt, Package, Users2, TrendingUp } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { fmtMoney } from "@/lib/utils";
import { useAnalyticsData } from "../useAnalyticsData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { MeterBar } from "../shell";
import { flagEmoji } from "@/lib/geo";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  GRID,
  TOOLTIP,
  PALETTE,
  SERIES_COLORS,
  KpiCard,
  ChartCard,
  ReportEmpty,
  ReportHeader,
  CompareLegend,
  Delta,
  buildBuckets,
  deltaOf,
  fmtNum,
} from "./reportKit";

const ordTime = (o: Order): number => Date.parse(String(o.timestamp ?? o.received_at ?? ""));
const ordQty = (o: Order): number => {
  const q = typeof o.quantity === "number" ? o.quantity : parseFloat(String(o.quantity ?? "1"));
  return Number.isFinite(q) && q > 0 ? q : 1;
};
const ordPrice = (o: Order): number => {
  const p = typeof o.price === "number" ? o.price : parseFloat(String(o.price ?? "0").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(p) ? p : 0;
};
const ordRevenue = (o: Order): number => ordPrice(o) * ordQty(o);

interface Totals {
  revenue: number;
  orders: number;
  units: number;
  customers: number;
  aov: number;
}

function totalsFor(orders: Order[]): Totals {
  const customers = new Set<string>();
  let revenue = 0;
  let units = 0;
  for (const o of orders) {
    revenue += ordRevenue(o);
    units += ordQty(o);
    const c = String(o.email ?? o.customerName ?? "").trim().toLowerCase();
    if (c) customers.add(c);
  }
  return {
    revenue,
    orders: orders.length,
    units,
    customers: customers.size,
    aov: orders.length ? revenue / orders.length : 0,
  };
}

export function SalesReport({ config }: { config: AppConfig }) {
  const { orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const model = useMemo(() => {
    const cur = orders.filter((o) => range.inRange(ordTime(o)));
    const prev = orders.filter((o) => range.inPrev(ordTime(o)));
    const curT = totalsFor(cur);
    const prevT = totalsFor(prev);

    const currency =
      (cur.find((o) => o.currency)?.currency as string) ||
      (orders.find((o) => o.currency)?.currency as string) ||
      "USD";

    // Trend: current window vs previous window aligned onto the same axis.
    const buckets = buildBuckets(range.start, range.end, range.granularity);
    const offset = range.start - range.prevStart;
    const trend = buckets.map((b) => {
      let curRev = 0;
      let prevRev = 0;
      for (const o of cur) {
        const t = ordTime(o);
        if (t >= b.start && t < b.end) curRev += ordRevenue(o);
      }
      if (range.compareEnabled) {
        for (const o of prev) {
          const t = ordTime(o) + offset;
          if (t >= b.start && t < b.end) prevRev += ordRevenue(o);
        }
      }
      return { label: b.label, current: Math.round(curRev), previous: Math.round(prevRev) };
    });

    // Top products by revenue.
    const prodMap = new Map<string, { name: string; revenue: number; units: number; orders: number }>();
    for (const o of cur) {
      const key = String(o.productId ?? o.productName ?? o.sku ?? "—");
      const name = String(o.productName ?? o.productId ?? o.sku ?? "—");
      const e = prodMap.get(key) ?? { name, revenue: 0, units: 0, orders: 0 };
      e.revenue += ordRevenue(o);
      e.units += ordQty(o);
      e.orders += 1;
      prodMap.set(key, e);
    }
    const topProducts = [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const prodMax = topProducts[0]?.revenue ?? 1;

    // Revenue by country.
    const geoMap = new Map<string, number>();
    for (const o of cur) {
      const cc = String(o.country ?? "").trim().toUpperCase() || "??";
      geoMap.set(cc, (geoMap.get(cc) ?? 0) + ordRevenue(o));
    }
    const byCountry = [...geoMap.entries()]
      .map(([cc, revenue]) => ({ cc, revenue: Math.round(revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Orders by hour of day (buying rhythm).
    const hours = Array.from({ length: 24 }, (_, h) => ({ h, label: `${h}`, orders: 0 }));
    for (const o of cur) {
      const t = ordTime(o);
      if (Number.isFinite(t)) hours[new Date(t).getHours()].orders += 1;
    }

    return {
      cur: curT,
      prev: prevT,
      currency,
      trend,
      topProducts,
      prodMax,
      byCountry,
      hours,
      hasData: cur.length > 0,
    };
  }, [orders, range]);

  const money = (n: number) => fmtMoney(n, model.currency);
  const trendMax = Math.max(1, ...model.trend.map((d) => Math.max(d.current, d.previous)));

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        title="Sales performance"
        subtitle="Revenue, orders, average order value and top products for the selected range — each measured against the previous period."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <ReportEmpty icon={<TrendingUp className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Revenue"
          value={money(model.cur.revenue)}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          color={PALETTE.revenue}
          delta={deltaOf(model.cur.revenue, model.prev.revenue)}
          spark={model.trend.map((d) => d.current)}
        />
        <KpiCard
          label="Orders"
          value={fmtNum(model.cur.orders)}
          icon={<ShoppingBag className="h-3.5 w-3.5" />}
          color={PALETTE.primary}
          delta={deltaOf(model.cur.orders, model.prev.orders)}
        />
        <KpiCard
          label="Avg order value"
          value={money(model.cur.aov)}
          icon={<Receipt className="h-3.5 w-3.5" />}
          color={PALETTE.violet}
          delta={deltaOf(model.cur.aov, model.prev.aov)}
        />
        <KpiCard
          label="Units sold"
          value={fmtNum(model.cur.units)}
          icon={<Package className="h-3.5 w-3.5" />}
          color={PALETTE.ok}
          delta={deltaOf(model.cur.units, model.prev.units)}
        />
        <KpiCard
          label="Customers"
          value={fmtNum(model.cur.customers)}
          icon={<Users2 className="h-3.5 w-3.5" />}
          color={PALETTE.amber}
          delta={deltaOf(model.cur.customers, model.prev.customers)}
        />
      </div>

      <ChartCard
        title="Revenue trend"
        desc="Daily revenue across the selected window."
        right={<CompareLegend />}
      >
        {model.hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={model.trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                <defs>
                  <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.revenue} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PALETTE.revenue} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => fmtNum(v)} />
                <Tooltip
                  {...TOOLTIP}
                  formatter={(v: number, n: string) => [money(v), n === "current" ? range.label : range.compareLabel]}
                />
                <Area type="monotone" dataKey="current" stroke={PALETTE.revenue} strokeWidth={2} fill="url(#rev-fill)" />
                {range.compareEnabled && (
                  <Line
                    type="monotone"
                    dataKey="previous"
                    stroke={PALETTE.compare}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <Empty icon={<ShoppingBag className="h-8 w-8" />} title="No orders in this range" hint="Widen the date range or wait for new orders." />
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ChartCard title="Top products" desc="By revenue in the selected range.">
          {model.topProducts.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="text-right">Orders</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="w-28">Share</TH>
                </TR>
              </THead>
              <TBody>
                {model.topProducts.map((p) => (
                  <TR key={p.name}>
                    <TD className="max-w-[220px] truncate font-medium text-foreground">{p.name}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(p.units)}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{fmtNum(p.orders)}</TD>
                    <TD className="text-right tabular-nums font-semibold text-foreground">{money(p.revenue)}</TD>
                    <TD>
                      <MeterBar value={p.revenue} max={model.prodMax} tone="warn" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <Empty icon={<Package className="h-8 w-8" />} title="No product sales yet" />
          )}
        </ChartCard>

        <ChartCard title="Revenue by country">
          {model.byCountry.length ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={model.byCountry} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNum(v)} />
                  <YAxis
                    type="category"
                    dataKey="cc"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(cc: string) => `${flagEmoji(cc)} ${cc}`}
                  />
                  <Tooltip {...TOOLTIP} cursor={{ fill: "hsl(220 8% 12%)" }} formatter={(v: number) => [money(v), "Revenue"]} />
                  <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
                    {model.byCountry.map((_, i) => (
                      <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty icon={<DollarSign className="h-8 w-8" />} title="No geographic data" />
          )}
        </ChartCard>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Orders by hour of day</CardTitle>
          <span className="text-[11px] text-muted-foreground">when customers buy</span>
        </CardHeader>
        <CardContent>
          {model.hasData ? (
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={model.hours} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={PALETTE.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={1} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => [`${v} orders`, "Orders"]} labelFormatter={(l) => `${l}:00`} />
                  <Area type="monotone" dataKey="orders" stroke={PALETTE.primary} strokeWidth={2} fill="url(#hr-fill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty icon={<Receipt className="h-8 w-8" />} title="No orders to chart" />
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
