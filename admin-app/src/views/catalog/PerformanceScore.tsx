/**
 * Product PERFORMANCE score. Blends demand (views), engagement (CTR), conversion
 * rate and revenue into one 0–100 score per product so you can see winners and
 * dead weight at a glance. Data joins the Telemetry + Orders sheets (seed
 * fallback keeps it rendering until the read endpoint ships).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, RefreshCw, TrendingDown, Trophy } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent, Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { buildProductAnalytics } from "@/lib/analytics";
import { loadPerformance, scoreProducts, type ScoredProduct } from "./catalogData";
import { SeedBanner, ViewHeader, StatTile } from "./catalogUI";

const CHART_TOOLTIP = {
  background: "hsl(220 8% 7%)",
  border: "1px solid hsl(220 6% 16%)",
  borderRadius: 8,
  fontSize: 12,
} as const;

export function PerformanceScore({
  config,
  events: eventsProp,
  orders: ordersProp,
  seeded: seededProp,
}: {
  config: AppConfig;
  events?: TelemetryEvent[];
  orders?: Order[];
  seeded?: boolean;
}) {
  const selfLoad = eventsProp === undefined;
  const [scored, setScored] = useState<ScoredProduct[]>([]);
  const [seeded, setSeeded] = useState(!!seededProp);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selfLoad) return;
    setLoading(true);
    const r = await loadPerformance(config);
    setScored(scoreProducts(r.stats));
    setSeeded(r.seeded);
    setLoading(false);
  }, [config, selfLoad]);

  useEffect(() => {
    if (selfLoad) load();
  }, [selfLoad, load]);

  // Parent-fed data path (avoids a second round trip): join right here.
  const fed = useMemo(() => {
    if (eventsProp === undefined) return null;
    return scoreProducts(buildProductAnalytics(eventsProp, ordersProp ?? []));
  }, [eventsProp, ordersProp]);
  useEffect(() => {
    if (fed) setScored(fed);
  }, [fed]);
  useEffect(() => {
    if (seededProp !== undefined) setSeeded(seededProp);
  }, [seededProp]);

  const top = scored[0];
  const worst = scored.filter((s) => s.views > 0).slice(-1)[0];
  const chart = scored.slice(0, 12).map((s) => ({
    name: s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name,
    score: s.score,
  }));

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Product performance score"
        subtitle="One 0–100 score per product — views 20% · CTR 20% · conversion 25% · revenue 35% — normalized across the catalog."
        right={
          selfLoad && (
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          )
        }
      />
      <SeedBanner show={seeded} what="analytics" />

      {scored.length === 0 && !loading ? (
        <Empty icon={<Award className="h-8 w-8" />} title="No performance data yet" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={<Trophy className="h-4 w-4" />}
              label="Top performer"
              value={top ? `${top.score.toFixed(0)}` : "—"}
              sub={top?.name}
              tone="ok"
            />
            <StatTile
              icon={<TrendingDown className="h-4 w-4" />}
              label="Weakest (with views)"
              value={worst ? `${worst.score.toFixed(0)}` : "—"}
              sub={worst?.name}
              tone="down"
            />
            <StatTile
              label="Products scored"
              value={scored.length.toLocaleString()}
            />
            <StatTile
              label="Total revenue"
              value={fmtMoney(
                scored.reduce((s, p) => s + p.revenue, 0),
                scored.find((s) => s.revenue > 0)?.currency ?? "USD",
              )}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top products by score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 6% 16%)" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9aa0a6", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      angle={-25}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fill: "#9aa0a6", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={32}
                      domain={[0, 100]}
                    />
                    <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: "hsl(220 6% 16% / 0.4)" }} />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {chart.map((_, i) => (
                        <Cell
                          key={i}
                          fill={i === 0 ? "hsl(142 62% 45%)" : "hsl(4 65% 54%)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Product</TH>
                  <TH className="text-right">Score</TH>
                  <TH className="text-right">Views</TH>
                  <TH className="text-right">CTR</TH>
                  <TH className="text-right">Conv. rate</TH>
                  <TH className="text-right">Conv.</TH>
                  <TH className="text-right">Revenue</TH>
                </TR>
              </THead>
              <TBody>
                {scored.map((s, i) => (
                  <TR key={s.productId}>
                    <TD className="text-muted-foreground tabular-nums">{i + 1}</TD>
                    <TD className="max-w-xs">
                      <div className="truncate font-medium">{s.name}</div>
                      <div className="text-[11px] text-muted-foreground">#{s.productId}</div>
                    </TD>
                    <TD className="text-right">
                      <ScoreBadge score={s.score} />
                    </TD>
                    <TD className="text-right tabular-nums">{s.views.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">
                      {s.views ? `${(s.ctr * 100).toFixed(1)}%` : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.views ? `${(s.convRate * 100).toFixed(1)}%` : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">{s.conversions.toLocaleString()}</TD>
                    <TD className="text-right tabular-nums">
                      {s.revenue > 0 ? fmtMoney(s.revenue, s.currency) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 66 ? "ok" : score >= 33 ? "warn" : "down";
  return (
    <Badge variant={variant} className="tabular-nums">
      {score.toFixed(0)}
    </Badge>
  );
}
