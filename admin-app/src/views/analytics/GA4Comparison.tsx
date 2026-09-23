/**
 * GA4Comparison — real Google Analytics 4 data for DSM's old and new sites,
 * side by side, driven by the shared Analytics date-range toolbar.
 *
 * Both sites are data streams on the SAME GA4 property (281583873 — "G4 -
 * Digital Software Market"): the legacy `digitalsoftwaremarkett.com` (double
 * "t", substantial historical traffic) and the current
 * `digitalsoftwaremarket.ai` (new stream — thin/recent data is expected, not
 * a bug). The backend proxy (`dsm-analytics-api` `/api/ga4/overview`) filters
 * each report by GA4's `hostName` dimension server-side using a dedicated,
 * read-only GA4 service account — no Google credential or property id ever
 * reaches the browser.
 *
 * "Compare to previous period" — the date-range-comparison groundwork asked
 * for in this pass — comes straight from the GA4 Data API: the proxy sends
 * two `dateRanges` (current + previous) in one request, and every metric
 * tile here renders the delta GA4 itself computed. Campaign creation is
 * explicitly out of scope for this pass; see the note card at the bottom for
 * what that would need.
 */
import { useEffect, useState } from "react";
import {
  BarChart3,
  Clock,
  Globe2,
  LogOut,
  MousePointerClick,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchGa4Overview, type Ga4Overview, type Ga4SiteStats, type Ga4Totals } from "@/lib/ga4";
import { useDateRange } from "./reports/dateRange";
import { AnalyticsHeader, MeterBar } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";

const nf = (n: number) => Math.round(n || 0).toLocaleString("en-US");
const pctStr = (v: number) => `${(v || 0).toFixed(1)}%`;
const durStr = (sec: number) => {
  const s = Math.round(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
};

function delta(cur: number, prev: number | undefined | null): number | null {
  if (prev == null) return null;
  if (prev === 0) return cur > 0 ? null : 0;
  return (cur - prev) / prev;
}

function Delta({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-[11px] font-medium text-muted-foreground">—</span>;
  }
  const up = value >= 0;
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${up ? "text-ok" : "text-down"}`}>
      {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(1)}%
    </span>
  );
}

interface Metric {
  key: keyof Ga4Totals;
  label: string;
  icon: React.ReactNode;
  fmt: (v: number) => string;
}
const METRICS: Metric[] = [
  { key: "sessions", label: "Sessions", icon: <BarChart3 className="h-3.5 w-3.5" />, fmt: nf },
  { key: "totalUsers", label: "Users", icon: <Users className="h-3.5 w-3.5" />, fmt: nf },
  { key: "newUsers", label: "New users", icon: <Sparkles className="h-3.5 w-3.5" />, fmt: nf },
  { key: "pageViews", label: "Page views", icon: <Globe2 className="h-3.5 w-3.5" />, fmt: nf },
  { key: "keyEvents", label: "Conversions", icon: <Target className="h-3.5 w-3.5" />, fmt: nf },
  { key: "bounceRate", label: "Bounce rate", icon: <LogOut className="h-3.5 w-3.5" />, fmt: pctStr },
  { key: "avgSessionDurationSec", label: "Avg. session", icon: <Clock className="h-3.5 w-3.5" />, fmt: durStr },
];

function SitePanel({
  title,
  hostname,
  stats,
  compareLabel,
}: {
  title: string;
  hostname: string;
  stats: Ga4SiteStats | null;
  compareLabel: string;
}) {
  if (!stats || stats.error) {
    return (
      <Card className="flex h-full flex-col">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>{title}</span>
            <Badge variant="muted" className="font-mono text-[10px]">
              {hostname}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1">
          <Empty
            icon={<Globe2 className="h-7 w-7" />}
            title={stats?.error ? "GA4 proxy not ready" : "No data yet"}
            hint={
              stats?.error ??
              "The GA4 proxy hasn't returned data for this site yet — check dsm-analytics-api."
            }
          />
        </CardContent>
      </Card>
    );
  }

  const maxPage = Math.max(...stats.topPages.map((p) => p.views), 1);
  const maxChan = Math.max(...stats.channels.map((c) => c.sessions), 1);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>{title}</span>
          <Badge variant="muted" className="font-mono text-[10px]">
            {hostname}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {METRICS.map((m) => {
            const cur = Number(stats[m.key] ?? 0);
            const prev = stats.previous ? Number(stats.previous[m.key] ?? 0) : null;
            return (
              <div key={String(m.key)} className="rounded-lg border border-border bg-background/40 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.icon}
                    {m.label}
                  </span>
                  <Delta value={delta(cur, prev)} />
                </div>
                <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{m.fmt(cur)}</div>
                {prev != null && (
                  <div className="text-[10px] text-muted-foreground/70">
                    {compareLabel}: {m.fmt(prev)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Top pages
          </div>
          {stats.topPages.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">No page views in this range.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {stats.topPages.slice(0, 6).map((p) => (
                <div key={p.path} className="flex items-center gap-2">
                  <div className="w-32 shrink-0 truncate font-mono text-[11px] text-foreground" title={p.path}>
                    {p.path}
                  </div>
                  <div className="flex-1">
                    <MeterBar value={p.views} max={maxPage} />
                  </div>
                  <div className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {nf(p.views)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Traffic sources / channels
          </div>
          {stats.channels.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">No channel data in this range.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {stats.channels.slice(0, 6).map((c) => (
                <div key={c.channel || "unassigned"} className="flex items-center gap-2">
                  <div className="w-28 shrink-0 truncate text-[11px] text-foreground" title={c.channel}>
                    {c.channel || "(unassigned)"}
                  </div>
                  <div className="flex-1">
                    <MeterBar value={c.sessions} max={maxChan} tone="ok" />
                  </div>
                  <div className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {nf(c.sessions)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function GA4Comparison({ config }: { config: AppConfig }) {
  const { start, end, prevStart, prevEnd, compareEnabled, label, compareLabel } = useDateRange();
  const [data, setData] = useState<Ga4Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGa4Overview(config, { start, end, prevStart, prevEnd, compare: compareEnabled })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (!res.ok) setError(res.error ?? "GA4 proxy request failed");
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, start, end, prevStart, prevEnd, compareEnabled]);

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<TrendingUp className="h-4 w-4 text-primary" />}
        title="Google Analytics 4"
        subtitle={`Real GA4 traffic for both DSM domains — ${label.toLowerCase()}${
          compareEnabled ? `, ${compareLabel}` : ""
        }. Server-side proxy on dsm-analytics-api; no Google credentials ever reach the browser.`}
        loading={loading}
      />

      {error && (
        <div className="rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SitePanel
          title="Old site (legacy)"
          hostname={data?.sites.old.hostname || "digitalsoftwaremarkett.com"}
          stats={data?.sites.old ?? null}
          compareLabel={compareLabel}
        />
        <SitePanel
          title="New site (current)"
          hostname={data?.sites.new.hostname || "digitalsoftwaremarket.ai"}
          stats={data?.sites.new ?? null}
          compareLabel={compareLabel}
        />
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-1.5 py-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <MousePointerClick className="h-3.5 w-3.5" /> Campaign creation — planned, not built yet
          </div>
          <p>
            This view lays the groundwork for it (real GA4 data plus a working date-range comparison), but
            creating campaigns and UTM links from here needs its own scoping: either GA4&apos;s own
            campaign/UTM tooling (this proxy is read-only by design — no write access is wired up) or a Google
            Ads account linked to this GA4 property (none is linked today). Treat it as a separate follow-up.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
