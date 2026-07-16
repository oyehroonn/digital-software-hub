/**
 * Traffic source / campaign attribution. First-touch: each session is credited
 * to the source/medium/campaign of its landing hit (UTMs or referrer host).
 * Shows which channels and campaigns bring visitors AND which actually convert
 * to orders + revenue — so spend follows what works.
 */
import { useMemo } from "react";
import { Radio, Megaphone } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildAttribution } from "@/lib/attribution";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function AttributionView({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const a = useMemo(() => buildAttribution(events, orders), [events, orders]);
  const maxSessions = a.channels[0]?.sessions ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Radio className="h-4 w-4 text-primary" />}
        title="Source & campaign attribution"
        subtitle="First-touch attribution — where each session came from, and which channels & campaigns actually drive orders and revenue, not just clicks."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Radio className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sessions" value={a.sessions.toLocaleString("en-US")} />
        <StatTile
          label="Attributed"
          value={pct(a.sessions ? a.attributed / a.sessions : 0)}
          sub={`${a.attributed.toLocaleString("en-US")} non-direct`}
        />
        <StatTile label="Orders" value={a.orders.toLocaleString("en-US")} tone="ok" />
        <StatTile label="Revenue" value={fmtMoney(a.revenue)} tone="primary" />
      </div>

      {a.sessions === 0 ? (
        <Empty
          icon={<Radio className="h-8 w-8" />}
          title="No attribution telemetry yet"
          hint="Channels appear once sessions carry a utm_source / utm_medium / referrer in event metadata."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Source / medium</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Conv.</TH>
                    <TH className="text-right">Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {a.channels.slice(0, 14).map((c) => (
                    <TR key={c.key}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{c.source}</span>
                          <Badge variant="muted">{c.medium}</Badge>
                        </div>
                        <MeterBar className="mt-1" value={c.sessions} max={maxSessions} />
                      </TD>
                      <TD className="text-right tabular-nums">{c.sessions}</TD>
                      <TD className="text-right tabular-nums">{c.orders}</TD>
                      <TD className="text-right">
                        <Badge variant={c.conversion >= 0.05 ? "ok" : c.conversion > 0 ? "warn" : "muted"}>
                          {pct(c.conversion)}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {c.revenue ? fmtMoney(c.revenue) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Megaphone className="h-4 w-4 text-primary" />
              <CardTitle>Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              {a.campaigns.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No campaign-tagged traffic (no utm_campaign present).
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Campaign</TH>
                      <TH>Source</TH>
                      <TH className="text-right">Sessions</TH>
                      <TH className="text-right">Orders</TH>
                      <TH className="text-right">Conv.</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {a.campaigns.slice(0, 14).map((c) => (
                      <TR key={`${c.campaign}-${c.source}`}>
                        <TD className="max-w-[160px] truncate font-medium">{c.campaign}</TD>
                        <TD className="text-muted-foreground">{c.source}</TD>
                        <TD className="text-right tabular-nums">{c.sessions}</TD>
                        <TD className="text-right tabular-nums">{c.orders}</TD>
                        <TD className="text-right">
                          <Badge variant={c.conversion >= 0.05 ? "ok" : c.conversion > 0 ? "warn" : "muted"}>
                            {pct(c.conversion)}
                          </Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
        </>
      )}
    </div>
  );
}
