/**
 * AOV & order-value TRENDS. Buckets orders by week (or month) to chart revenue,
 * order count and average order value over time, with headline KPIs and a
 * top-products-by-revenue breakdown. Recharts, styled to the admin theme.
 */
import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCw, TrendingUp } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { SectionHeader, Stat } from "./parts";
import { useOrdersData, orderValue, orderCurrency } from "./ordersData";

type Grain = "week" | "month";

interface Bucket {
  label: string;
  ts: number;
  revenue: number;
  orders: number;
  aov: number;
}

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function bucketize(orders: Order[], grain: Grain): Bucket[] {
  const map = new Map<number, Bucket>();
  for (const o of orders) {
    const t = o.timestamp ? Date.parse(String(o.timestamp)) : NaN;
    if (Number.isNaN(t)) continue;
    const d = new Date(t);
    const key = grain === "week" ? startOfWeek(d) : new Date(d.getFullYear(), d.getMonth(), 1);
    const ts = key.getTime();
    let b = map.get(ts);
    if (!b) {
      b = {
        ts,
        label:
          grain === "week"
            ? key.toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : key.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        revenue: 0,
        orders: 0,
        aov: 0,
      };
      map.set(ts, b);
    }
    b.revenue += orderValue(o);
    b.orders += 1;
  }
  const arr = [...map.values()].sort((a, b) => a.ts - b.ts);
  for (const b of arr) b.aov = b.orders ? b.revenue / b.orders : 0;
  return arr;
}

const AXIS = { fill: "#9aa0a6", fontSize: 11 };

export function OrderTrends({ config }: { config: AppConfig }) {
  const { orders, loading, reload } = useOrdersData(config);
  const [grain, setGrain] = useState<Grain>("week");
  const currency = orders[0] ? orderCurrency(orders[0]) : "AUD";

  const buckets = useMemo(() => bucketize(orders, grain), [orders, grain]);

  const totals = useMemo(() => {
    const revenue = orders.reduce((s, o) => s + orderValue(o), 0);
    const count = orders.length;
    const aov = count ? revenue / count : 0;
    // momentum: last bucket vs previous
    const n = buckets.length;
    const last = n ? buckets[n - 1].revenue : 0;
    const prev = n > 1 ? buckets[n - 2].revenue : 0;
    const delta = prev ? (last - prev) / prev : 0;
    return { revenue, count, aov, delta };
  }, [orders, buckets]);

  const topProducts = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; units: number }>();
    for (const o of orders) {
      const name = String(o.productName || o.sku || "—");
      const e = m.get(name) ?? { name, revenue: 0, units: 0 };
      e.revenue += orderValue(o);
      e.units += parseFloat(String(o.quantity ?? 1)) || 1;
      m.set(name, e);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [orders]);

  const maxRev = Math.max(...topProducts.map((p) => p.revenue), 1);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Order value & AOV trends"
        subtitle="Revenue, order volume and average order value over time."
        right={
          <>
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(["week", "month"] as Grain[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGrain(g)}
                  className={
                    "px-2.5 py-1 text-xs " +
                    (grain === g ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")
                  }
                >
                  {g === "week" ? "Weekly" : "Monthly"}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat label="Total revenue" value={fmtMoney(totals.revenue, currency)} />
        <Stat label="Orders" value={String(totals.count)} />
        <Stat label="Avg order value" value={fmtMoney(totals.aov, currency)} />
        <Stat
          label={grain === "week" ? "WoW momentum" : "MoM momentum"}
          value={`${totals.delta >= 0 ? "+" : ""}${(totals.delta * 100).toFixed(0)}%`}
          sub="last period vs prior"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue & AOV over time</CardTitle>
        </CardHeader>
        <CardContent>
          {buckets.length === 0 ? (
            <Empty icon={<TrendingUp className="h-8 w-8" />} title="No dated orders to chart" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={buckets} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 6% 16%)" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "hsl(220 6% 16%)" }} />
                  <YAxis
                    yAxisId="rev"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <YAxis
                    yAxisId="aov"
                    orientation="right"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{ background: "hsl(220 8% 7%)", border: "1px solid hsl(220 6% 16%)", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#e8e8e8" }}
                    formatter={(value: number, name: string) => [
                      name === "orders" ? String(value) : fmtMoney(value, currency),
                      name === "revenue" ? "Revenue" : name === "aov" ? "AOV" : "Orders",
                    ]}
                  />
                  <Bar yAxisId="rev" dataKey="revenue" fill="hsl(4 65% 54%)" radius={[3, 3, 0, 0]} maxBarSize={44} />
                  <Line yAxisId="aov" type="monotone" dataKey="aov" stroke="hsl(38 92% 55%)" strokeWidth={2} dot={{ r: 2 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top products by revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No products yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {topProducts.map((p) => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="w-40 shrink-0 truncate text-sm" title={p.name}>
                    {p.name}
                  </div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted/40">
                    <div
                      className="flex h-6 items-center rounded bg-primary/85 px-2"
                      style={{ width: `${Math.max((p.revenue / maxRev) * 100, 4)}%` }}
                    >
                      <span className="text-[11px] font-semibold tabular-nums text-primary-foreground">
                        {fmtMoney(p.revenue, currency)}
                      </span>
                    </div>
                  </div>
                  <div className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {p.units} units
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
