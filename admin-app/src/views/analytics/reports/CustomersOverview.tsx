/**
 * Customers — Overview report.
 *
 * Shopify-parity customer lens built from the STABLE Orders sheet, grouped by
 * email. Answers: first-time vs returning, customers over time, returning-
 * customer rate, one-time vs repeat, customers by location, avg orders per
 * customer, and predicted lifetime value. Consumes the GLOBAL date-range +
 * compare context (`useDateRange`) so every KPI shows a vs-previous delta and
 * the whole page re-computes when the shared toolbar range changes. Falls back
 * to the deterministic seed until the read endpoint is deployed.
 *
 * Charts follow the shared reportKit theme (dark tooltip, muted grid, one accent
 * per series) and the dataviz method: one measure per axis, a fixed accent per
 * entity, legend + direct labels so identity is never colour-alone.
 */
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Users, UserPlus, Repeat, MapPin, TrendingUp, ShoppingBag, Sparkles } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fmtMoney } from "@/lib/utils";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { useAnalyticsData } from "../useAnalyticsData";
import { MeterBar } from "../shell";
import { useDateRange } from "./dateRange";
import {
  AXIS,
  GRID,
  TOOLTIP,
  PALETTE,
  KpiCard,
  ChartCard,
  ReportHeader,
  fmtPct,
  deltaOf,
} from "./reportKit";
import {
  buildIndex,
  customersByLocation,
  customersOverTime,
  orderCountDistribution,
  overviewMetrics,
  topByLtv,
} from "./customerMetrics";
import { CustomerLink } from "../drilldown";

const NEW_COLOR = PALETTE.ok; // green — first-time
const RET_COLOR = PALETTE.primary; // blue — returning
const ONE_COLOR = PALETTE.amber; // amber — one-time
const REPEAT_COLOR = PALETTE.primary; // blue — repeat
const LTV_COLOR = PALETTE.violet; // violet — predicted LTV

const compact = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v));

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
      <span className="text-foreground/80">{label}</span>
    </span>
  );
}

export function CustomersOverview({ config }: { config: AppConfig }) {
  const { orders, seeded, loading, liveCount, refresh } = useAnalyticsData(config);
  const r = useDateRange();

  const win = useMemo(() => ({ start: r.start, end: r.end }), [r.start, r.end]);
  const prevWin = useMemo(() => ({ start: r.prevStart, end: r.prevEnd }), [r.prevStart, r.prevEnd]);

  const idx = useMemo(() => buildIndex(orders), [orders]);
  const cur = useMemo(() => overviewMetrics(orders, idx, win), [orders, idx, win]);
  const prev = useMemo(
    () => (r.compareEnabled ? overviewMetrics(orders, idx, prevWin) : null),
    [orders, idx, prevWin, r.compareEnabled],
  );

  const overTime = useMemo(
    () => customersOverTime(orders, idx, win, r.granularity),
    [orders, idx, win, r.granularity],
  );
  const byLocation = useMemo(() => customersByLocation(orders, win), [orders, win]);
  const distribution = useMemo(() => orderCountDistribution(idx, win), [idx, win]);
  const ltvTop = useMemo(() => topByLtv(orders, win, 8), [orders, win]);

  const d = (get: (m: NonNullable<typeof prev>) => number) =>
    prev ? deltaOf(get(cur), get(prev)) : undefined;
  const sparkTotal = overTime.map((b) => b.total);
  const sparkNew = overTime.map((b) => b.newCustomers);
  const sparkRate = overTime.map((b) => b.returningRate);

  const newRetData = [
    { name: "First-time", value: cur.newCustomers, color: NEW_COLOR },
    { name: "Returning", value: cur.returningCustomers, color: RET_COLOR },
  ].filter((x) => x.value > 0);
  const oneRepeatData = [
    { name: "One-time", value: cur.oneTime, color: ONE_COLOR },
    { name: "Repeat", value: cur.repeat, color: REPEAT_COLOR },
  ].filter((x) => x.value > 0);

  const maxLocation = byLocation[0]?.customers ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        icon={<Users className="h-4 w-4 text-primary" />}
        title="Customers — Overview"
        subtitle="First-time vs returning, customers over time, returning rate, one-time vs repeat, location, avg orders and predicted LTV — grouped by email from the Orders sheet."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {cur.customers === 0 ? (
        <Empty
          icon={<Users className="h-8 w-8" />}
          title="No customers in this range"
          hint="Widen the date range, or the Orders sheet has no rows with a timestamp in the selected window."
        />
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Customers"
              icon={<Users className="h-3.5 w-3.5" />}
              value={cur.customers.toLocaleString("en-US")}
              delta={d((m) => m.customers)}
              spark={sparkTotal}
              color={PALETTE.primary}
            />
            <KpiCard
              label="First-time"
              icon={<UserPlus className="h-3.5 w-3.5" />}
              value={cur.newCustomers.toLocaleString("en-US")}
              delta={d((m) => m.newCustomers)}
              spark={sparkNew}
              color={NEW_COLOR}
            />
            <KpiCard
              label="Returning rate"
              icon={<Repeat className="h-3.5 w-3.5" />}
              value={fmtPct(cur.returningRate)}
              delta={d((m) => m.returningRate)}
              spark={sparkRate}
              color={RET_COLOR}
            />
            <KpiCard
              label="Avg predicted LTV"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              value={fmtMoney(cur.predictedLtv)}
              delta={d((m) => m.predictedLtv)}
              color={LTV_COLOR}
              sub={`${fmtMoney(cur.totalPredictedLtv)} across ${cur.activeBase.toLocaleString("en-US")} customers`}
            />
          </div>

          {/* Customers over time */}
          <ChartCard
            title={
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Customers over time
              </span>
            }
            right={
              <div className="flex items-center gap-3">
                <LegendChip color={NEW_COLOR} label="First-time" />
                <LegendChip color={RET_COLOR} label="Returning" />
              </div>
            }
          >
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overTime} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="c-new" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={NEW_COLOR} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={NEW_COLOR} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="c-ret" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={RET_COLOR} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={RET_COLOR} stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} cursor={{ stroke: GRID }} />
                  <Area type="monotone" dataKey="newCustomers" name="First-time" stackId="c" stroke={NEW_COLOR} strokeWidth={1.5} fill="url(#c-new)" />
                  <Area type="monotone" dataKey="returning" name="Returning" stackId="c" stroke={RET_COLOR} strokeWidth={1.5} fill="url(#c-ret)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Returning rate + first-time/returning split */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              className="lg:col-span-2"
              title={
                <span className="flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-primary" /> Returning-customer rate
                </span>
              }
            >
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={overTime} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="c-rr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RET_COLOR} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={RET_COLOR} stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                    <Tooltip {...TOOLTIP} cursor={{ stroke: GRID }} formatter={(v: number) => [fmtPct(v), "Returning rate"]} />
                    <Area type="monotone" dataKey="returningRate" name="Returning rate" stroke={RET_COLOR} strokeWidth={2} fill="url(#c-rr)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title={
                <span className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" /> First-time vs returning
                </span>
              }
            >
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={newRetData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2} stroke="hsl(220 8% 7%)" strokeWidth={2}>
                      {newRetData.map((x) => (
                        <Cell key={x.name} fill={x.color} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <LegendChip color={NEW_COLOR} label="First-time" />
                  <span className="tabular-nums text-muted-foreground">{cur.newCustomers.toLocaleString("en-US")}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <LegendChip color={RET_COLOR} label="Returning" />
                  <span className="tabular-nums text-muted-foreground">{cur.returningCustomers.toLocaleString("en-US")}</span>
                </div>
              </div>
            </ChartCard>
          </div>

          {/* One-time vs repeat + lifetime-orders distribution */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard
              title={
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" /> One-time vs repeat
                </span>
              }
            >
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={oneRepeatData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2} stroke="hsl(220 8% 7%)" strokeWidth={2}>
                      {oneRepeatData.map((x) => (
                        <Cell key={x.name} fill={x.color} />
                      ))}
                    </Pie>
                    <Tooltip {...TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div>
                  <div className="text-lg font-semibold tabular-nums" style={{ color: REPEAT_COLOR }}>{fmtPct(cur.repeatRate)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">repeat rate</div>
                </div>
                <div>
                  <div className="text-lg font-semibold tabular-nums text-foreground">{cur.avgOrdersPerCustomer.toFixed(2)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">orders / customer</div>
                </div>
              </div>
            </ChartCard>

            <ChartCard className="lg:col-span-2" title="Lifetime orders per customer">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barCategoryGap="24%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                    <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={compact} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} cursor={{ fill: GRID, opacity: 0.35 }} formatter={(v: number) => [v.toLocaleString("en-US"), "Customers"]} />
                    <Bar dataKey="customers" radius={[4, 4, 0, 0]} maxBarSize={54}>
                      {distribution.map((x, i) => (
                        <Cell key={x.bucket} fill={i === 0 ? ONE_COLOR : REPEAT_COLOR} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex items-center gap-3">
                <LegendChip color={ONE_COLOR} label="One-time" />
                <LegendChip color={REPEAT_COLOR} label="Repeat (2+)" />
              </div>
            </ChartCard>
          </div>

          {/* Location + predicted-LTV leaderboard */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title={
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" /> Customers by location
                </span>
              }
            >
              <Table>
                <THead>
                  <TR>
                    <TH>Country</TH>
                    <TH className="text-right">Customers</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {byLocation.slice(0, 12).map((l) => (
                    <TR key={l.country}>
                      <TD>
                        <div className="font-medium">{l.country}</div>
                        <div className="text-[11px] text-muted-foreground">top: {l.topCity}</div>
                        <MeterBar className="mt-1" value={l.customers} max={maxLocation} />
                      </TD>
                      <TD className="text-right tabular-nums">{l.customers.toLocaleString("en-US")}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{l.orders.toLocaleString("en-US")}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{l.revenue ? fmtMoney(l.revenue) : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </ChartCard>

            <ChartCard
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: LTV_COLOR }} /> Highest predicted LTV
                </span>
              }
              desc="Historical spend + recency-decayed forward value (2-yr horizon)"
            >
              <Table>
                <THead>
                  <TR>
                    <TH>Customer</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Spent</TH>
                    <TH className="text-right">Predicted LTV</TH>
                  </TR>
                </THead>
                <TBody>
                  {ltvTop.map((c) => (
                    <TR key={c.key}>
                      <TD>
                        <CustomerLink
                          email={c.email}
                          name={c.name}
                          className="max-w-[180px] truncate"
                          chevron
                        />
                        {c.location && <div className="text-[11px] text-muted-foreground">{c.location}</div>}
                      </TD>
                      <TD className="text-right tabular-nums">{c.orders}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{fmtMoney(c.spent)}</TD>
                      <TD className="text-right">
                        <Badge variant="default" className="tabular-nums" style={{ color: LTV_COLOR }}>
                          {fmtMoney(c.predictedLtv)}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
