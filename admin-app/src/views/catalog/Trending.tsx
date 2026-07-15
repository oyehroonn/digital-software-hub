/**
 * TRENDING products — momentum from telemetry. Compares each product's views in
 * the recent half of the window vs the earlier half, surfacing what's heating up
 * (promote it) and what's cooling off (investigate). Seed fallback keeps it live.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Flame, RefreshCw, Snowflake } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { TelemetryEvent, Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/utils";
import { buildProductAnalytics } from "@/lib/analytics";
import { loadPerformance, trendingProducts, type TrendPoint } from "./catalogData";
import { SeedBanner, ViewHeader, StatTile, Sparkline } from "./catalogUI";

export function Trending({
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
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [seeded, setSeeded] = useState(!!seededProp);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selfLoad) return;
    setLoading(true);
    const r = await loadPerformance(config);
    setTrends(trendingProducts(r.stats));
    setSeeded(r.seeded);
    setLoading(false);
  }, [config, selfLoad]);

  useEffect(() => {
    if (selfLoad) load();
  }, [selfLoad, load]);

  const fed = useMemo(() => {
    if (eventsProp === undefined) return null;
    return trendingProducts(buildProductAnalytics(eventsProp, ordersProp ?? []));
  }, [eventsProp, ordersProp]);
  useEffect(() => {
    if (fed) setTrends(fed);
  }, [fed]);
  useEffect(() => {
    if (seededProp !== undefined) setSeeded(seededProp);
  }, [seededProp]);

  const rising = trends.filter((t) => t.changePct > 0.05);
  const falling = trends.filter((t) => t.changePct < -0.05).reverse();
  const hottest = rising[0];

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Trending products"
        subtitle="Momentum from telemetry: recent-half views vs earlier-half. Promote what's rising; investigate what's cooling."
        right={
          selfLoad && (
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          )
        }
      />
      <SeedBanner show={seeded} what="analytics" />

      {trends.length === 0 && !loading ? (
        <Empty icon={<Flame className="h-8 w-8" />} title="No trend data yet" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={<Flame className="h-4 w-4" />}
              label="Rising"
              value={rising.length.toLocaleString()}
              tone="ok"
            />
            <StatTile
              icon={<Snowflake className="h-4 w-4" />}
              label="Cooling"
              value={falling.length.toLocaleString()}
              tone="down"
            />
            <StatTile
              label="Hottest"
              value={hottest ? `+${Math.round(hottest.changePct * 100)}%` : "—"}
              sub={hottest?.name}
              tone="ok"
            />
            <StatTile
              label="Products tracked"
              value={trends.length.toLocaleString()}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TrendCard title="Heating up" icon={<Flame className="h-4 w-4 text-ok" />} rows={rising} />
            <TrendCard
              title="Cooling off"
              icon={<Snowflake className="h-4 w-4 text-down" />}
              rows={falling}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TrendCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: TrendPoint[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        {icon}
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <Empty title="Nothing here" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="text-right">Recent</TH>
                <TH className="text-right">Change</TH>
                <TH className="text-right">Trend</TH>
              </TR>
            </THead>
            <TBody>
              {rows.slice(0, 12).map((t) => {
                const up = t.changePct >= 0;
                return (
                  <TR key={t.productId}>
                    <TD className="max-w-[10rem]">
                      <div className="truncate font-medium">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {t.revenue > 0 ? fmtMoney(t.revenue, t.currency) : `#${t.productId}`}
                      </div>
                    </TD>
                    <TD className="text-right tabular-nums">{t.recent.toLocaleString()}</TD>
                    <TD className="text-right">
                      <Badge variant={up ? "ok" : "down"} className="gap-0.5 tabular-nums">
                        {up ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {up ? "+" : ""}
                        {Math.round(t.changePct * 100)}%
                      </Badge>
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end">
                        <Sparkline
                          data={t.spark}
                          color={up ? "hsl(142 62% 45%)" : "hsl(4 65% 54%)"}
                        />
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
