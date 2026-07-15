/**
 * LANDING-PAGE performance compare across sites. Groups live Telemetry by URL
 * host, so multi-site DSM properties can be compared side-by-side on views,
 * sessions, CTR and bounce. A grouped bar chart compares sites; expandable rows
 * drill into each site's individual pages.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Globe, RefreshCw, Eye, MousePointerClick, Users, ChevronRight, TrendingDown } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchTelemetry, type TelemetryEvent } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { landingPages, type SiteGroup } from "./metrics";
import { StatTile, ViewHeader, Meter, pct } from "./ui";

const CHART_TOOLTIP = {
  background: "hsl(220 8% 7%)", border: "1px solid hsl(220 6% 16%)", borderRadius: 8, fontSize: 12,
} as const;

// Categorical palette (site series) — distinct, works light & dark.
const SITE_COLORS = ["hsl(4 65% 54%)", "hsl(199 89% 48%)", "hsl(142 62% 45%)", "hsl(38 92% 55%)", "hsl(280 65% 60%)", "hsl(160 60% 45%)"];

export function LandingCompareView({ config }: { config: AppConfig }) {
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [metric, setMetric] = useState<"views" | "sessions" | "ctr">("views");

  const load = () => {
    setLoading(true); setError(null);
    fetchTelemetry(config)
      .then((e) => setEvents(e))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [config]);

  const sites = useMemo(() => landingPages(events), [events]);
  const chartData = useMemo(
    () => sites.map((s) => ({ host: s.host, views: s.views, sessions: s.sessions, ctr: +(s.ctr * 100).toFixed(1) })),
    [sites],
  );

  const totals = useMemo(() => ({
    sites: sites.length,
    views: sites.reduce((s, x) => s + x.views, 0),
    sessions: sites.reduce((s, x) => s + x.sessions, 0),
    pages: sites.reduce((s, x) => s + x.pages.length, 0),
  }), [sites]);

  const best = sites[0];

  function toggle(host: string) {
    setOpen((s) => { const n = new Set(s); n.has(host) ? n.delete(host) : n.add(host); return n; });
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Landing-page performance"
        subtitle="Compare live traffic, engagement and bounce across every site (by URL host)."
        actions={<Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>}
      />

      {error ? (
        <Empty title="Couldn't load telemetry" hint={error} />
      ) : sites.length === 0 && !loading ? (
        <Empty icon={<Globe className="h-8 w-8" />} title="No page telemetry yet" hint="Once the site fires page_view telemetry, landing performance appears here." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={<Globe className="h-4 w-4" />} label="Sites" value={String(totals.sites)} sub={`${totals.pages} pages`} />
            <StatTile icon={<Eye className="h-4 w-4" />} label="Total views" value={totals.views.toLocaleString()} />
            <StatTile icon={<Users className="h-4 w-4" />} label="Sessions" value={totals.sessions.toLocaleString()} />
            <StatTile icon={<MousePointerClick className="h-4 w-4" />} label="Top site" value={best?.host ?? "—"} sub={best ? `${pct(best.ctr)} CTR` : undefined} />
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Site comparison</CardTitle>
              <div className="flex gap-1">
                {(["views", "sessions", "ctr"] as const).map((m) => (
                  <button key={m} onClick={() => setMetric(m)}
                    className={`rounded px-2 py-1 text-[11px] capitalize transition-colors ${metric === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                    {m}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 6% 16%)" vertical={false} />
                    <XAxis dataKey="host" tick={{ fill: "#9aa0a6", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fill: "#9aa0a6", fontSize: 11 }} axisLine={false} tickLine={false} width={44}
                      tickFormatter={(v) => (metric === "ctr" ? `${v}%` : String(v))} />
                    <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ fill: "hsl(220 6% 16%)", opacity: 0.4 }}
                      formatter={(v: number) => (metric === "ctr" ? `${v}%` : v.toLocaleString())} />
                    <Bar dataKey={metric} radius={[4, 4, 0, 0]} maxBarSize={72}>
                      {chartData.map((_, i) => <Cell key={i} fill={SITE_COLORS[i % SITE_COLORS.length]} />)}
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
                  <TH className="w-8" />
                  <TH>Site</TH>
                  <TH className="text-right">Pages</TH>
                  <TH className="text-right">Views</TH>
                  <TH className="text-right">Sessions</TH>
                  <TH className="w-28">CTR</TH>
                  <TH className="text-right">Clicks</TH>
                </TR>
              </THead>
              <TBody>
                {sites.map((s, i) => (
                  <SiteRows key={s.host} site={s} color={SITE_COLORS[i % SITE_COLORS.length]} open={open.has(s.host)} onToggle={() => toggle(s.host)} maxCtr={Math.max(...sites.map((x) => x.ctr), 0.0001)} />
                ))}
              </TBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function SiteRows({ site, color, open, onToggle, maxCtr }: { site: SiteGroup; color: string; open: boolean; onToggle: () => void; maxCtr: number }) {
  return (
    <Fragment>
      <TR className="cursor-pointer" onClick={onToggle}>
        <TD><ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} /></TD>
        <TD>
          <div className="flex items-center gap-2 font-medium">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} /> {site.host}
          </div>
        </TD>
        <TD className="text-right tabular-nums">{site.pages.length}</TD>
        <TD className="text-right tabular-nums">{site.views.toLocaleString()}</TD>
        <TD className="text-right tabular-nums">{site.sessions.toLocaleString()}</TD>
        <TD>
          <div className="flex flex-col gap-1">
            <Meter value={site.ctr / maxCtr} tone={site.ctr >= 0.1 ? "ok" : "primary"} />
            <span className="text-[10px] tabular-nums text-muted-foreground">{pct(site.ctr)}</span>
          </div>
        </TD>
        <TD className="text-right tabular-nums">{site.clicks.toLocaleString()}</TD>
      </TR>
      {open && site.pages.map((p) => (
        <TR key={p.url} className="bg-muted/30">
          <TD />
          <TD className="pl-6 font-mono text-[11px] text-muted-foreground">{p.path}</TD>
          <TD />
          <TD className="text-right tabular-nums">{p.views.toLocaleString()}</TD>
          <TD className="text-right tabular-nums">{p.sessions.toLocaleString()}</TD>
          <TD className="text-[11px] tabular-nums text-muted-foreground">{pct(p.ctr)}</TD>
          <TD className="text-right">
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground" title="Bounce rate">
              <TrendingDown className="h-3 w-3" />{pct(p.bounceRate, 0)}
            </span>
          </TD>
        </TR>
      ))}
    </Fragment>
  );
}
