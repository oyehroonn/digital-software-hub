import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, fetchTelemetry, type Order, type TelemetryEvent } from "@/lib/ecommerce";
import { extractOutages, outagesByService } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { FunnelChart } from "@/components/FunnelChart";
import { ClickHeatmap } from "@/views/analytics/ClickHeatmap";
import { ProductAnalytics } from "@/views/ProductAnalytics";
import { timeAgo } from "@/lib/utils";

export function AnalyticsView({ config }: { config: AppConfig }) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ev, ords] = await Promise.all([
        fetchTelemetry(config),
        fetchOrders(config).catch(() => [] as Order[]),
      ]);
      setEvents(ev);
      setOrders(ords);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const outages = useMemo(() => extractOutages(events), [events]);
  const outageBuckets = useMemo(() => outagesByService(outages), [outages]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Analytics</h1>
          <p className="text-xs text-muted-foreground">
            Funnel & AI-outage feed derived from the stable Telemetry sheet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>

      {error ? (
        <Empty title="Couldn't load telemetry" hint={error} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FunnelChart events={events} />
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>AI outages by service</CardTitle>
            </CardHeader>
            <CardContent>
              {outageBuckets.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No AI outages recorded. 🎉
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {outageBuckets.map((b) => (
                    <div key={b.service} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="h-3.5 w-3.5 text-warn" />
                        {b.service}
                      </span>
                      <Badge variant="warn">{b.count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>ai_outage feed</CardTitle>
        </CardHeader>
        <CardContent>
          {outages.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nothing here — every AI feature degraded silently or stayed healthy.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Service</TH>
                  <TH>Feature</TH>
                  <TH>Error</TH>
                </TR>
              </THead>
              <TBody>
                {outages.slice(0, 100).map((o, i) => (
                  <TR key={i}>
                    <TD className="whitespace-nowrap text-muted-foreground">{timeAgo(o.timestamp ?? "")}</TD>
                    <TD>
                      <Badge variant="down">{o.service}</Badge>
                    </TD>
                    <TD>{o.feature}</TD>
                    <TD className="max-w-md truncate text-muted-foreground" title={o.error}>
                      {o.error || "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!error && (
        <div className="pt-2">
          <div className="mb-2">
            <h2 className="text-base font-semibold">Click heatmap</h2>
            <p className="text-xs text-muted-foreground">
              Per-page click density from telemetry — hover a hotspot for counts & the top element.
            </p>
          </div>
          <ClickHeatmap events={events} demo />
        </div>
      )}

      {!error && (
        <div className="pt-2">
          <div className="mb-2">
            <h2 className="text-base font-semibold">Product analytics</h2>
            <p className="text-xs text-muted-foreground">
              Views, clicks, CTR, conversions & revenue per product, with daily-views trend.
            </p>
          </div>
          <ProductAnalytics config={config} events={events} orders={orders} />
        </div>
      )}
    </div>
  );
}
