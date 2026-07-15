/**
 * Rage- & dead-click detector. Surfaces the controls visitors fight with:
 * frantic repeat clicks (rage) and clicks that went nowhere (dead), ranked by a
 * frustration score, plus a live incident feed. These are the highest-signal UX
 * bugs — a "Buy" button that doesn't respond is lost revenue you can see.
 */
import { useMemo } from "react";
import { MousePointerClick, Zap } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { detectRage } from "@/lib/rageClicks";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import { timeAgo } from "@/lib/utils";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function RageClicksView({ config }: { config: AppConfig }) {
  const { events, seeded, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const rage = useMemo(() => detectRage(events), [events]);
  const maxScore = rage.elements[0]?.score ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Zap className="h-4 w-4 text-warn" />}
        title="Rage & dead clicks"
        subtitle="Bursts of frantic repeat clicks (rage) and clicks that produced no response (dead) — the clearest signal of a broken or confusing control."
        seeded={seeded}
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Rage incidents" value={rage.incidents.length.toLocaleString("en-US")} tone="warn" />
        <StatTile
          label="Rage clicks"
          value={rage.rageClicks.toLocaleString("en-US")}
          sub={`${pct(rage.rageRate)} of all clicks`}
          tone="down"
        />
        <StatTile label="Dead clicks" value={rage.deadClicks.toLocaleString("en-US")} tone="down" />
        <StatTile
          label="Sessions affected"
          value={rage.affectedSessions.toLocaleString("en-US")}
          sub={`of ${(new Set(events.map((e, i) => e.sessionId ?? i)).size).toLocaleString("en-US")} sessions`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most frustrating elements</CardTitle>
          </CardHeader>
          <CardContent>
            {rage.elements.length === 0 ? (
              <Empty
                icon={<MousePointerClick className="h-8 w-8" />}
                title="No rage or dead clicks detected"
                hint="Nothing is driving visitors to frantic clicking — either the UI is smooth or there isn't enough click telemetry yet."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Element</TH>
                    <TH>Page</TH>
                    <TH className="text-right">Rage</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="w-28">Severity</TH>
                  </TR>
                </THead>
                <TBody>
                  {rage.elements.slice(0, 12).map((el) => (
                    <TR key={el.key}>
                      <TD className="max-w-[180px]">
                        <div className="truncate font-medium">{el.label}</div>
                        <div className="text-[11px] text-muted-foreground">{el.incidents} incidents</div>
                      </TD>
                      <TD className="max-w-[140px] truncate text-muted-foreground" title={el.page}>
                        {el.page}
                      </TD>
                      <TD className="text-right tabular-nums">{el.rageClicks}</TD>
                      <TD className="text-right tabular-nums">{el.sessions}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <MeterBar value={el.score} max={maxScore} tone="down" />
                          <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                            {el.score}
                          </span>
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent incidents</CardTitle>
          </CardHeader>
          <CardContent>
            {rage.incidents.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No incidents recorded.</div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>When</TH>
                    <TH>Element</TH>
                    <TH className="text-right">Clicks</TH>
                    <TH className="text-right">In</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {rage.incidents.slice(0, 40).map((inc, i) => (
                    <TR key={i}>
                      <TD className="whitespace-nowrap text-muted-foreground">{timeAgo(inc.timestamp)}</TD>
                      <TD className="max-w-[160px]">
                        <div className="truncate font-medium">{inc.elementText || inc.elementId || "(unlabeled)"}</div>
                        <div className="truncate text-[11px] text-muted-foreground" title={inc.page}>
                          {inc.page}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums font-semibold text-down">{inc.clicks}×</TD>
                      <TD className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                        {(inc.spanMs / 1000).toFixed(1)}s
                      </TD>
                      <TD>{inc.dead && <Badge variant="down">dead</Badge>}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
