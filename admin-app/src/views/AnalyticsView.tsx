import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, BarChart3, RefreshCw } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry, type TelemetryEvent } from "@/lib/ecommerce";
import { buildFunnel, extractOutages, outagesByService } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { timeAgo } from "@/lib/utils";

const FUNNEL_COLORS = ["#4b93ff", "#4bc0c0", "#f0b429", "#f78e3d", "#d9414f"];

export function AnalyticsView({ config }: { config: AppConfig }) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await fetchTelemetry(config));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  const funnel = useMemo(() => buildFunnel(events), [events]);
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
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Conversion funnel</CardTitle>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <Empty icon={<BarChart3 className="h-8 w-8" />} title="No telemetry yet" />
              ) : (
                <>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={funnel} layout="vertical" margin={{ left: 8, right: 24 }}>
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="label"
                          width={100}
                          tick={{ fill: "#9aa0a6", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          cursor={{ fill: "rgba(255,255,255,0.04)" }}
                          contentStyle={{
                            background: "#14161a",
                            border: "1px solid #262a30",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                          {funnel.map((_, i) => (
                            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                    {funnel.map((s) => (
                      <div key={s.key}>
                        <div className="text-lg font-semibold tabular-nums">{s.count}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(s.rate * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
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
    </div>
  );
}
