/**
 * FINANCES report — a Shopify-style financial summary for the globally-selected
 * date range: gross sales, discounts, returns, net sales, taxes, COGS and gross
 * margin, each with a vs-previous-period delta and a P&L bridge.
 *
 * Consumes the GLOBAL date-range + compare context (`useDateRange`). Orders come
 * from the STABLE Orders sheet via `useAnalyticsData` (deterministic-seed
 * fallback). The sheet does not yet carry discount / tax / refund / cost columns,
 * so — when no such column is present — those figures are DERIVED deterministically
 * per order (campaign-attributed orders discount harder; ~6% returns; tax by
 * destination country; COGS from a per-product cost ratio) and the report clearly
 * flags them as "modeled". If the sheet ever adds real columns, they win.
 */
import { useMemo } from "react";
import {
  Area,
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
  Banknote,
  DollarSign,
  Percent,
  Receipt,
  RotateCcw,
  Landmark,
  TrendingDown,
  Wallet,
  Info,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
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
  ReportEmpty,
  ReportHeader,
  CompareLegend,
  Delta,
  deltaOf,
  fmtNum,
  fmtPct,
  buildBuckets,
} from "./reportKit";
import {
  evTime,
  grossOf,
  hasRealFinance,
  orderFinance,
  productKeyOfOrder,
  qtyOf,
} from "./reportMetrics";

const DAY = 86_400_000;

interface FinTotals {
  gross: number;
  discounts: number;
  returns: number;
  net: number;
  tax: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  orders: number;
  units: number;
  aov: number;
}

function aggregate(orders: Order[], real: boolean): FinTotals {
  let gross = 0;
  let discounts = 0;
  let returns = 0;
  let tax = 0;
  let cogs = 0;
  let units = 0;
  let orderCount = 0;
  for (const o of orders) {
    const f = orderFinance(o, real);
    if (f.returned) {
      returns += f.refund;
      continue;
    }
    gross += f.gross;
    discounts += f.discount;
    tax += f.tax;
    cogs += f.cogs;
    units += qtyOf(o);
    orderCount += 1;
  }
  const net = gross - discounts - returns;
  const grossProfit = net - cogs;
  return {
    gross,
    discounts,
    returns,
    net,
    tax,
    cogs,
    grossProfit,
    margin: net ? grossProfit / net : 0,
    orders: orderCount,
    units,
    aov: orderCount ? net / orderCount : 0,
  };
}

export function FinancesReport({ config }: { config: AppConfig }) {
  const { orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const range = useDateRange();

  const model = useMemo(() => {
    const real = hasRealFinance(orders);
    const curOrders = orders.filter((o) => range.inRange(evTime(o)));
    const prevOrders = orders.filter((o) => range.inPrev(evTime(o)));
    const cur = aggregate(curOrders, real);
    const prev = aggregate(prevOrders, real);
    const currency =
      (curOrders.find((o) => o.currency)?.currency as string) ||
      (orders.find((o) => o.currency)?.currency as string) ||
      "USD";

    // Sales over time — gross vs net, current window vs previous.
    let bStart = range.start;
    let bGran = range.granularity;
    if (range.days === 0) {
      const ts = curOrders.map(evTime).filter(Number.isFinite);
      bStart = ts.length ? Math.min(...ts) : range.end - 30 * DAY;
      bGran = range.end - bStart > 120 * DAY ? "month" : "day";
    }
    const buckets = buildBuckets(bStart, range.end, bGran);
    const offset = range.start - range.prevStart;
    const trend = buckets.map((b) => {
      const curSlice = curOrders.filter((o) => {
        const t = evTime(o);
        return t >= b.start && t < b.end;
      });
      const ct = aggregate(curSlice, real);
      let prevNet = 0;
      if (range.compareEnabled) {
        const prevSlice = prevOrders.filter((o) => {
          const t = evTime(o) + offset;
          return t >= b.start && t < b.end;
        });
        prevNet = aggregate(prevSlice, real).net;
      }
      return {
        label: b.label,
        gross: Math.round(ct.gross),
        net: Math.round(ct.net),
        previous: Math.round(prevNet),
      };
    });

    // P&L bridge (waterfall).
    const steps: { name: string; delta: number; kind: "total" | "sub" | "neg" }[] = [
      { name: "Gross sales", delta: cur.gross, kind: "total" },
      { name: "Discounts", delta: -cur.discounts, kind: "neg" },
      { name: "Returns", delta: -cur.returns, kind: "neg" },
      { name: "Net sales", delta: cur.net, kind: "sub" },
      { name: "COGS", delta: -cur.cogs, kind: "neg" },
      { name: "Gross profit", delta: cur.grossProfit, kind: "total" },
    ];
    let run = 0;
    const waterfall = steps.map((s) => {
      let base: number;
      let bar: number;
      if (s.kind === "total" || s.kind === "sub") {
        base = 0;
        bar = s.delta;
        run = s.delta;
      } else {
        const start = run;
        const end = run + s.delta;
        base = Math.min(start, end);
        bar = Math.abs(s.delta);
        run = end;
      }
      const fill =
        s.kind === "total"
          ? PALETTE.ok
          : s.kind === "sub"
            ? PALETTE.primary
            : PALETTE.rose;
      return { name: s.name, base, bar, fill, value: s.delta };
    });

    // Net sales by product (top).
    const byProduct = new Map<string, { name: string; net: number }>();
    for (const o of curOrders) {
      const f = orderFinance(o, real);
      const key = productKeyOfOrder(o);
      const name = String(o.productName ?? o.productId ?? o.sku ?? "—");
      const row = byProduct.get(key) ?? { name, net: 0 };
      row.net += f.returned ? -f.refund : f.gross - f.discount;
      byProduct.set(key, row);
    }
    const topProducts = [...byProduct.values()].sort((a, b) => b.net - a.net).slice(0, 8).map((p) => ({ name: p.name, net: Math.round(p.net) }));

    // Tax by country.
    const byCountry = new Map<string, { country: string; tax: number; net: number }>();
    for (const o of curOrders) {
      const f = orderFinance(o, real);
      if (f.returned) continue;
      const c = String(o.country ?? "—") || "—";
      const row = byCountry.get(c) ?? { country: c, tax: 0, net: 0 };
      row.tax += f.tax;
      row.net += f.gross - f.discount;
      byCountry.set(c, row);
    }
    const taxRows = [...byCountry.values()].sort((a, b) => b.tax - a.tax);

    // P&L statement rows (current / previous / delta).
    const pnl: { label: string; cur: number; prev: number; goodUp: boolean; strong?: boolean; pct?: boolean }[] = [
      { label: "Gross sales", cur: cur.gross, prev: prev.gross, goodUp: true },
      { label: "Discounts", cur: -cur.discounts, prev: -prev.discounts, goodUp: false },
      { label: "Returns", cur: -cur.returns, prev: -prev.returns, goodUp: false },
      { label: "Net sales", cur: cur.net, prev: prev.net, goodUp: true, strong: true },
      { label: "Taxes collected", cur: cur.tax, prev: prev.tax, goodUp: true },
      { label: "Cost of goods (COGS)", cur: -cur.cogs, prev: -prev.cogs, goodUp: false },
      { label: "Gross profit", cur: cur.grossProfit, prev: prev.grossProfit, goodUp: true, strong: true },
    ];

    return { real, cur, prev, currency, trend, waterfall, topProducts, taxRows, pnl };
  }, [orders, range]);

  const m = model;
  const money = (v: number) => fmtMoney(v, m.currency);
  const empty = m.cur.orders === 0 && m.cur.returns === 0;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Banknote className="h-5 w-5 text-primary" />}
        title="Finances"
        subtitle="Gross sales, discounts, returns, net sales, taxes and gross margin for the selected range, with a P&L bridge and vs-previous-period deltas."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <ReportEmpty icon={<Banknote className="h-7 w-7" />} />
      ) : (
        <>
      {!m.real && !empty && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
          <span>
            The Orders sheet has no discount / tax / refund / cost columns, so those figures are{" "}
            <span className="font-medium text-foreground">modeled</span> deterministically per order (stable &amp;
            repeatable). Gross sales, orders and units are exact. Add real columns to the sheet and they take over
            automatically.
          </span>
        </div>
      )}

      {empty ? (
        <Empty
          icon={<Banknote className="h-8 w-8" />}
          title="No orders in this range"
          hint="The financial summary populates once orders land inside the selected window."
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Gross sales"
              icon={<DollarSign className="h-3.5 w-3.5" />}
              color={PALETTE.revenue}
              value={money(m.cur.gross)}
              delta={deltaOf(m.cur.gross, m.prev.gross)}
            />
            <KpiCard
              label="Discounts"
              icon={<Receipt className="h-3.5 w-3.5" />}
              color={PALETTE.amber}
              value={money(m.cur.discounts)}
              delta={deltaOf(m.cur.discounts, m.prev.discounts)}
              higherIsBetter={false}
            />
            <KpiCard
              label="Returns"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              color={PALETTE.rose}
              value={money(m.cur.returns)}
              delta={deltaOf(m.cur.returns, m.prev.returns)}
              higherIsBetter={false}
            />
            <KpiCard
              label="Net sales"
              icon={<Wallet className="h-3.5 w-3.5" />}
              color={PALETTE.primary}
              value={money(m.cur.net)}
              delta={deltaOf(m.cur.net, m.prev.net)}
            />
            <KpiCard
              label="Taxes"
              icon={<Landmark className="h-3.5 w-3.5" />}
              color={PALETTE.violet}
              value={money(m.cur.tax)}
              delta={deltaOf(m.cur.tax, m.prev.tax)}
              sub="collected on sales"
            />
            <KpiCard
              label="Gross margin"
              icon={<Percent className="h-3.5 w-3.5" />}
              color={PALETTE.ok}
              value={fmtPct(m.cur.margin)}
              delta={deltaOf(m.cur.margin, m.prev.margin)}
              sub={`${money(m.cur.grossProfit)} profit`}
            />
          </div>

          {/* Sales over time + P&L bridge */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="Sales over time"
              desc="Gross vs net sales for the range; net overlays the previous period."
              right={<CompareLegend />}
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={m.trend} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                  <defs>
                    <linearGradient id="finGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PALETTE.revenue} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={PALETTE.revenue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => fmtNum(Number(v))} />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => money(Number(v))} />
                  <Area type="monotone" dataKey="gross" name="Gross" stroke={PALETTE.revenue} strokeWidth={1.5} fill="url(#finGross)" />
                  <Line type="monotone" dataKey="net" name="Net" stroke={PALETTE.primary} strokeWidth={2} dot={false} />
                  {range.compareEnabled && (
                    <Line
                      type="monotone"
                      dataKey="previous"
                      name="Prev net"
                      stroke={PALETTE.compare}
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="P&L bridge" desc="From gross sales down to gross profit.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={m.waterfall} margin={{ top: 8, right: 8, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={AXIS}
                    tickLine={false}
                    axisLine={{ stroke: GRID }}
                    interval={0}
                    angle={-18}
                    textAnchor="end"
                    height={58}
                  />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => fmtNum(Number(v))} />
                  <Tooltip
                    {...TOOLTIP}
                    cursor={{ fill: "hsl(220 8% 12% / 0.4)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as { name: string; value: number };
                      return (
                        <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
                          <div className="font-medium text-foreground">{row.name}</div>
                          <div className={`tabular-nums ${row.value < 0 ? "text-down" : "text-foreground"}`}>
                            {money(row.value)}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="base" stackId="w" fill="transparent" />
                  <Bar dataKey="bar" stackId="w" radius={[3, 3, 0, 0]} maxBarSize={46}>
                    {m.waterfall.map((s, i) => (
                      <Cell key={i} fill={s.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Net by product + tax by country */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Net sales by product" desc="Top revenue contributors after discounts & returns.">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={m.topProducts} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => fmtNum(Number(v))} />
                  <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={104} />
                  <Tooltip {...TOOLTIP} formatter={(v: number) => money(Number(v))} />
                  <Bar dataKey="net" radius={[0, 3, 3, 0]} maxBarSize={22}>
                    {m.topProducts.map((_, i) => (
                      <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Tax by destination"
              desc="Taxes collected per country at the destination rate."
              right={<Badge variant="muted">{m.taxRows.length} regions</Badge>}
            >
              {m.taxRows.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">No taxable sales in range.</div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Country</TH>
                      <TH className="text-right">Net sales</TH>
                      <TH>Share of tax</TH>
                      <TH className="text-right">Tax collected</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {m.taxRows.slice(0, 10).map((r, i) => {
                      const maxTax = m.taxRows[0]?.tax || 1;
                      return (
                        <TR key={r.country}>
                          <TD className="font-medium">{r.country}</TD>
                          <TD className="text-right tabular-nums text-muted-foreground">{money(r.net)}</TD>
                          <TD className="w-[160px]">
                            <MeterBar value={r.tax} max={maxTax} tone="primary" />
                          </TD>
                          <TD className="text-right tabular-nums font-medium">{money(r.tax)}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </ChartCard>
          </div>

          {/* P&L statement */}
          <ChartCard
            title="Profit & loss summary"
            desc="Full financial breakdown for the range, compared with the previous period."
          >
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Line item</TH>
                    <TH className="text-right">Current</TH>
                    {range.compareEnabled && <TH className="text-right">Previous</TH>}
                    {range.compareEnabled && <TH className="text-right">Change</TH>}
                  </TR>
                </THead>
                <TBody>
                  {m.pnl.map((r) => (
                    <TR key={r.label} className={r.strong ? "bg-secondary/40" : undefined}>
                      <TD className={r.strong ? "font-semibold" : ""}>{r.label}</TD>
                      <TD className={`text-right tabular-nums ${r.strong ? "font-semibold" : ""} ${r.cur < 0 ? "text-down" : ""}`}>
                        {money(r.cur)}
                      </TD>
                      {range.compareEnabled && (
                        <TD className="text-right tabular-nums text-muted-foreground">{money(r.prev)}</TD>
                      )}
                      {range.compareEnabled && (
                        <TD className="text-right">
                          <Delta value={deltaOf(Math.abs(r.cur), Math.abs(r.prev))} higherIsBetter={r.goodUp} className="justify-end" />
                        </TD>
                      )}
                    </TR>
                  ))}
                  <TR>
                    <TD className="text-muted-foreground">Gross margin</TD>
                    <TD className="text-right tabular-nums">{fmtPct(m.cur.margin)}</TD>
                    {range.compareEnabled && (
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtPct(m.prev.margin)}</TD>
                    )}
                    {range.compareEnabled && (
                      <TD className="text-right">
                        <Delta value={deltaOf(m.cur.margin, m.prev.margin)} className="justify-end" />
                      </TD>
                    )}
                  </TR>
                  <TR>
                    <TD className="text-muted-foreground">Orders · AOV</TD>
                    <TD className="text-right tabular-nums">
                      {fmtNum(m.cur.orders)} · {money(m.cur.aov)}
                    </TD>
                    {range.compareEnabled && (
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {fmtNum(m.prev.orders)} · {money(m.prev.aov)}
                      </TD>
                    )}
                    {range.compareEnabled && (
                      <TD className="text-right">
                        <Delta value={deltaOf(m.cur.aov, m.prev.aov)} className="justify-end" />
                      </TD>
                    )}
                  </TR>
                </TBody>
              </Table>
            </div>
          </ChartCard>
        </>
      )}
        </>
      )}
    </div>
  );
}

export default FinancesReport;
