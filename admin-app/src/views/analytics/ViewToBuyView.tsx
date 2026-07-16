/**
 * Product VIEW→BUY leaderboard — which products turn eyeballs into orders.
 * Joins telemetry views/clicks with the Orders sheet to rank products by revenue
 * / view→buy rate / views, and calls out the best converter and the biggest
 * opportunity (lots of views, weak conversion).
 */
import { useMemo, useState } from "react";
import { Trophy, Target, Sparkles } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildLeaderboard, type LeaderSort } from "@/lib/leaderboard";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const SORTS: { key: LeaderSort; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "viewToBuy", label: "View→Buy" },
  { key: "views", label: "Views" },
  { key: "conversions", label: "Orders" },
];

/** Tiny inline sparkline of daily views. */
function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-[11px] text-muted-foreground">—</span>;
  const max = Math.max(...data, 1);
  const w = 72;
  const h = 20;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function ViewToBuyView({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const [sort, setSort] = useState<LeaderSort>("revenue");
  const lb = useMemo(() => buildLeaderboard(events, orders, sort), [events, orders, sort]);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Trophy className="h-4 w-4 text-warn" />}
        title="View → Buy leaderboard"
        subtitle="Which products convert attention into orders. View→Buy is orders ÷ product views — the truest measure of a product page's sales performance."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
        right={
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as LeaderSort)}
            className="h-8 rounded-md border border-border bg-secondary px-2 text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title="Sort leaderboard"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        }
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Trophy className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Products" value={lb.rows.length.toLocaleString("en-US")} />
        <StatTile label="Total views" value={lb.totals.views.toLocaleString("en-US")} />
        <StatTile label="Orders" value={lb.totals.conversions.toLocaleString("en-US")} tone="ok" />
        <StatTile
          label="Overall View→Buy"
          value={pct(lb.totals.viewToBuy)}
          tone="primary"
          sub={fmtMoney(lb.totals.revenue, lb.totals.currency)}
        />
      </div>

      {(lb.bestConverter || lb.biggestOpportunity) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {lb.bestConverter && (
            <div className="flex items-center gap-3 rounded-lg border border-ok/40 bg-ok/5 p-3">
              <Sparkles className="h-5 w-5 text-ok" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Best converter</div>
                <div className="truncate text-sm font-semibold">{lb.bestConverter.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {pct(lb.bestConverter.viewToBuy)} view→buy · {lb.bestConverter.views} views
                </div>
              </div>
            </div>
          )}
          {lb.biggestOpportunity && (
            <div className="flex items-center gap-3 rounded-lg border border-warn/40 bg-warn/5 p-3">
              <Target className="h-5 w-5 text-warn" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Biggest opportunity</div>
                <div className="truncate text-sm font-semibold">{lb.biggestOpportunity.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {lb.biggestOpportunity.views} views but only {pct(lb.biggestOpportunity.viewToBuy)} convert
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          {lb.rows.length === 0 ? (
            <Empty
              icon={<Trophy className="h-8 w-8" />}
              title="No product telemetry yet"
              hint="Products appear once events carry a productId (views / clicks) and the Orders sheet has matching sales."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-8">#</TH>
                  <TH>Product</TH>
                  <TH className="text-right">Views</TH>
                  <TH className="text-right">Clicks</TH>
                  <TH className="text-right">Orders</TH>
                  <TH className="text-right">View→Buy</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">AOV</TH>
                  <TH className="text-right">Trend</TH>
                </TR>
              </THead>
              <TBody>
                {lb.rows.slice(0, 20).map((r) => (
                  <TR key={r.productId}>
                    <TD className="tabular-nums text-muted-foreground">{r.rank}</TD>
                    <TD className="max-w-[200px]">
                      <div className="truncate font-medium" title={r.name}>
                        {r.name}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{r.productId}</div>
                    </TD>
                    <TD className="text-right tabular-nums">{r.views.toLocaleString("en-US")}</TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{r.clicks.toLocaleString("en-US")}</TD>
                    <TD className="text-right tabular-nums">{r.conversions.toLocaleString("en-US")}</TD>
                    <TD className="text-right">
                      <Badge variant={r.viewToBuy >= 0.05 ? "ok" : r.viewToBuy > 0 ? "warn" : "muted"}>
                        {pct(r.viewToBuy)}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {r.revenue ? fmtMoney(r.revenue, r.currency) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums text-muted-foreground">
                      {r.aov ? fmtMoney(r.aov, r.currency) : "—"}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end">
                        <Spark data={r.spark} />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
        </>
      )}
    </div>
  );
}
