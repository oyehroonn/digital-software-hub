/**
 * Search insights — top queries and, more importantly, ZERO-RESULT queries:
 * demand the catalog is failing to answer. Each zero-result query is a product
 * to add, a synonym to map, or a landing page to write.
 */
import { useMemo } from "react";
import { Search, SearchX } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { buildSearchStats } from "@/lib/searchQueries";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function SearchQueriesView({ config }: { config: AppConfig }) {
  const { events, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config, { orders: false });
  const s = useMemo(() => buildSearchStats(events), [events]);
  const maxTop = s.top[0]?.searches ?? 1;
  const maxZero = s.zero[0]?.zeroResults ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Search className="h-4 w-4 text-primary" />}
        title="Search queries"
        subtitle="What visitors type into on-site search. Zero-result queries are unmet demand — each one is a product to add, a synonym to map, or a page to write."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Search className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total searches" value={s.total.toLocaleString("en-US")} />
        <StatTile label="Distinct queries" value={s.distinct.toLocaleString("en-US")} />
        <StatTile label="Zero-result" value={s.zeroResults.toLocaleString("en-US")} tone="down" />
        <StatTile
          label="Zero-result rate"
          value={pct(s.zeroRate)}
          tone={s.zeroRate > 0.2 ? "down" : "warn"}
          sub="of searches with a known count"
        />
      </div>

      {s.total === 0 ? (
        <Empty
          icon={<Search className="h-8 w-8" />}
          title="No search telemetry yet"
          hint="Searches appear here once the site emits search events carrying the query text (and ideally a result count) in metadata."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Top queries</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Query</TH>
                    <TH className="text-right">Searches</TH>
                    <TH className="text-right">Avg results</TH>
                    <TH className="w-24">Volume</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.top.slice(0, 15).map((q) => (
                    <TR key={q.query}>
                      <TD className="max-w-[220px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{q.query}</span>
                          {q.zeroResults > 0 && (
                            <Badge variant="down" title={`${q.zeroResults} zero-result searches`}>
                              {q.zeroResults}× zero
                            </Badge>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">{q.searches}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {q.avgResults == null ? "—" : q.avgResults.toFixed(1)}
                      </TD>
                      <TD>
                        <MeterBar value={q.searches} max={maxTop} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <SearchX className="h-4 w-4 text-down" />
              <CardTitle>Zero-result queries</CardTitle>
            </CardHeader>
            <CardContent>
              {s.zero.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Every tracked query returned results. 🎉
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Query</TH>
                      <TH className="text-right">Zero-hits</TH>
                      <TH className="text-right">Sessions</TH>
                      <TH className="w-24">Demand</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {s.zero.slice(0, 15).map((q) => (
                      <TR key={q.query}>
                        <TD className="max-w-[220px]">
                          <div className="truncate font-medium text-down">{q.query}</div>
                        </TD>
                        <TD className="text-right tabular-nums">{q.zeroResults}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">{q.sessions}</TD>
                        <TD>
                          <MeterBar value={q.zeroResults} max={maxZero} tone="down" />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                Ranked by volume of searches that returned nothing — fix the top rows first.
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
