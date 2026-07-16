/**
 * Session drop-off index — where visits die. Ranks exit pages by a severity
 * score (exit volume × exit rate × non-conversion) and shows the funnel-stage
 * abandonment (cart-but-no-checkout, checkout-but-no-order) that maps directly
 * to recoverable revenue.
 */
import { useMemo } from "react";
import { LogOut, TrendingDown } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildDropOff } from "@/lib/dropoff";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function DropOffIndexView({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const d = useMemo(() => buildDropOff(events), [events]);
  const worstAbandon = d.abandonment.reduce((m, s) => (s.abandonRate > m ? s.abandonRate : m), 0);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<LogOut className="h-4 w-4 text-down" />}
        title="Session drop-off index"
        subtitle="Where sessions exit and where the funnel leaks. Exit pages are scored by volume, exit rate and how few of those sessions bought — the worst leaks rise to the top."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<LogOut className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sessions" value={d.sessions.toLocaleString("en-US")} />
        <StatTile label="Bounce rate" value={pct(d.bounceRate)} tone={d.bounceRate > 0.5 ? "down" : "warn"} sub="1-page sessions" />
        <StatTile label="Pages / session" value={d.avgPagesPerSession.toFixed(1)} />
        <StatTile label="Worst step loss" value={pct(worstAbandon)} tone="down" />
      </div>

      {d.sessions === 0 ? (
        <Empty icon={<LogOut className="h-8 w-8" />} title="No session telemetry yet" hint="Drop-off appears once sessions emit page events with a pageUrl." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Exit pages · drop-off index</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Page</TH>
                    <TH className="text-right">Exits</TH>
                    <TH className="text-right">Exit rate</TH>
                    <TH className="text-right">Bought</TH>
                    <TH className="w-28">Drop index</TH>
                  </TR>
                </THead>
                <TBody>
                  {d.exitPages.slice(0, 15).map((p) => (
                    <TR key={p.page}>
                      <TD className="max-w-[220px] truncate font-medium" title={p.page}>
                        {p.page}
                      </TD>
                      <TD className="text-right tabular-nums">{p.exits}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{pct(p.exitRate)}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">{p.converters}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <MeterBar value={p.dropIndex} max={100} tone={p.dropIndex > 60 ? "down" : "warn"} />
                          <span className="w-7 shrink-0 text-right text-[11px] font-semibold tabular-nums">
                            {p.dropIndex}
                          </span>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <TrendingDown className="h-4 w-4 text-down" />
              <CardTitle>Funnel abandonment</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {d.abandonment.map((s) => (
                <div key={s.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{s.label}</span>
                    <Badge variant={s.abandonRate > 0.6 ? "down" : s.abandonRate > 0.3 ? "warn" : "muted"}>
                      {pct(s.abandonRate)} lost
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <MeterBar value={s.abandoned} max={s.reached || 1} tone="down" />
                  </div>
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
                    <span>{s.reached.toLocaleString("en-US")} reached</span>
                    <span>{s.abandoned.toLocaleString("en-US")} dropped</span>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Each row is a step of the buying journey: how many sessions reached it, and how many
                never took the next step.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
        </>
      )}
    </div>
  );
}
