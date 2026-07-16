/**
 * UTM Builder + Campaign Tracking.
 *
 * Two halves in one view:
 *   (A) BUILDER — compose a UTM-tagged link (base url + utm_source/medium/
 *       campaign/term/content), copy it, and keep a saved-links list in
 *       localStorage so the team reuses consistent tags.
 *   (B) TRACKING — first-touch campaign attribution over the live Telemetry
 *       sheet (utm_* parsed from page_url query + event metadata), joined to the
 *       Orders sheet by session/email, aggregated into sortable tables + charts:
 *       top campaigns, source breakdown, conversion-rate-per-campaign and a
 *       sessions/orders trend.
 *
 * Self-fetches via useAnalyticsData → falls back to the deterministic seed so it
 * renders before the read endpoint is deployed.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Copy,
  Link2,
  Megaphone,
  PieChart as PieIcon,
  Plus,
  Tag,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import {
  buildCampaigns,
  buildUtmUrl,
  UTM_FIELDS,
  type CampaignRow,
  type UtmParams,
} from "@/lib/utm";
import { useAnalyticsData } from "./useAnalyticsData";
import { AnalyticsHeader, AnalyticsEmpty, StatTile } from "./shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/Empty";
import { cn, fmtMoney } from "@/lib/utils";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Categorical palette derived from the app's design tokens (dark-theme safe). */
const PALETTE = [
  "hsl(4 65% 54%)", // primary red
  "hsl(38 92% 55%)", // warn amber
  "hsl(142 62% 45%)", // ok green
  "hsl(210 80% 58%)", // blue
  "hsl(280 55% 62%)", // violet
  "hsl(190 70% 50%)", // cyan
  "hsl(24 80% 55%)", // orange
  "hsl(330 65% 60%)", // pink
];

const AXIS = "hsl(220 5% 62%)";
const GRID = "hsl(220 6% 16%)";

const MEDIUM_PRESETS = ["cpc", "email", "social", "organic", "referral", "banner", "affiliate"];

// ── shared chart chrome ──────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
  fmt?: (name: string, v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-lg">
      {label != null && <div className="mb-1 font-medium text-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 tabular-nums text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}</span>
          <span className="ml-auto">
            {fmt ? fmt(String(p.name ?? ""), Number(p.value ?? 0)) : Number(p.value ?? 0).toLocaleString("en-US")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── (A) UTM BUILDER ──────────────────────────────────────────────────────────

interface SavedLink {
  id: string;
  url: string;
  campaign: string;
  source: string;
  medium: string;
  createdAt: number;
}

const LS_KEY = "dsm.utm.savedLinks";

function loadSaved(): SavedLink[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedLink[]) : [];
  } catch {
    return [];
  }
}

function persistSaved(links: SavedLink[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(links));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const EMPTY_FORM: UtmParams & { base: string } = {
  base: "https://dsm.example/",
  source: "",
  medium: "",
  campaign: "",
  term: "",
  content: "",
};

function UtmBuilder() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saved, setSaved] = useState<SavedLink[]>(() => loadSaved());
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => persistSaved(saved), [saved]);

  const generated = useMemo(
    () => buildUtmUrl(form.base, form),
    [form],
  );
  const hasParams = UTM_FIELDS.some((f) => (form[f.key] ?? "").trim());
  const ready = form.base.trim().length > 0 && hasParams;

  const flashCopy = async (id: string, text: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
    }
  };

  const save = () => {
    if (!ready || !generated) return;
    if (saved.some((s) => s.url === generated)) return;
    const link: SavedLink = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      url: generated,
      campaign: form.campaign.trim() || "(untitled)",
      source: form.source.trim(),
      medium: form.medium.trim(),
      createdAt: Date.now(),
    };
    setSaved((s) => [link, ...s]);
  };

  const remove = (id: string) => setSaved((s) => s.filter((l) => l.id !== id));
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Form */}
      <Card className="lg:col-span-3">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Link2 className="h-4 w-4 text-primary" />
          <CardTitle>UTM link builder</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Base URL
            </span>
            <Input
              value={form.base}
              onChange={(e) => set("base", e.target.value)}
              placeholder="https://dsm.example/pricing"
              spellCheck={false}
            />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {UTM_FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {f.param}
                  {(f.key === "source" || f.key === "medium" || f.key === "campaign") && (
                    <span className="text-primary">*</span>
                  )}
                </span>
                <Input
                  value={form[f.key]}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.hint}
                  spellCheck={false}
                />
                {f.key === "medium" && (
                  <div className="flex flex-wrap gap-1 pt-0.5">
                    {MEDIUM_PRESETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => set("medium", m)}
                        className={cn(
                          "rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                          form.medium === m && "border-primary/50 bg-primary/10 text-primary",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </label>
            ))}
          </div>

          {/* Generated link */}
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-secondary/50 p-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Generated link
            </span>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-background/60 px-2 py-1.5 text-xs text-foreground">
                {generated || <span className="text-muted-foreground">Fill the base URL + at least one tag…</span>}
              </code>
              <Button
                size="sm"
                variant="outline"
                disabled={!generated}
                onClick={() => flashCopy("generated", generated)}
                className="shrink-0"
              >
                {copied === "generated" ? <Check className="text-ok" /> : <Copy />}
                {copied === "generated" ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {ready ? "Ready to save & share" : "Needs a base URL and at least one tag"}
              </span>
              <Button size="sm" disabled={!ready} onClick={save}>
                <Plus /> Save link
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Saved links */}
      <Card className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-warn" /> Saved links
          </CardTitle>
          <Badge variant="muted">{saved.length}</Badge>
        </CardHeader>
        <CardContent>
          {saved.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No saved links yet. Build one and hit <span className="text-foreground">Save link</span> — it
              persists on this machine.
            </div>
          ) : (
            <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
              {saved.map((l) => (
                <li key={l.id} className="rounded-lg border border-border bg-card/60 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium" title={l.campaign}>
                      {l.campaign}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => flashCopy(l.id, l.url)}
                        title="Copy link"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {copied === l.id ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(l.id)}
                        title="Delete"
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-down/10 hover:text-down"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {l.source && <Badge variant="muted">{l.source}</Badge>}
                    {l.medium && <Badge variant="muted">{l.medium}</Badge>}
                  </div>
                  <code className="mt-1.5 block break-all text-[11px] text-muted-foreground">{l.url}</code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── (B) CAMPAIGN TRACKING ────────────────────────────────────────────────────

type SortKey = "sessions" | "clicks" | "conversions" | "conversionRate" | "revenue";
const SORTABLE: { key: SortKey; label: string; numeric: true }[] = [
  { key: "sessions", label: "Sessions", numeric: true },
  { key: "clicks", label: "Clicks", numeric: true },
  { key: "conversions", label: "Orders", numeric: true },
  { key: "conversionRate", label: "Conv. rate", numeric: true },
  { key: "revenue", label: "Revenue", numeric: true },
];

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <TH className="text-right">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "ml-auto inline-flex items-center gap-1 transition-colors hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? (
          dir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TH>
  );
}

function CampaignTracking({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const data = useMemo(() => buildCampaigns(events, orders), [events, orders]);
  const [sort, setSort] = useState<SortKey>("sessions");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sortedCampaigns = useMemo(() => {
    const rows = [...data.campaigns];
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      return dir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [data.campaigns, sort, dir]);

  const toggleSort = (k: SortKey) => {
    if (k === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(k);
      setDir("desc");
    }
  };

  const overallConv = data.sessions ? data.conversions / data.sessions : 0;

  // Chart datasets.
  const topBySessions = data.campaigns.slice(0, 8).map((c) => ({
    name: c.campaign,
    sessions: c.sessions,
    orders: c.conversions,
  }));
  const convRate = [...data.campaigns]
    .filter((c) => c.sessions >= 2)
    .sort((a, b) => b.conversionRate - a.conversionRate)
    .slice(0, 8)
    .map((c) => ({ name: c.campaign, rate: +(c.conversionRate * 100).toFixed(1) }));
  const sourcePie = data.sources.slice(0, 7).map((s) => ({ name: s.source, value: s.sessions }));
  const trend = data.daily.map((d) => ({ label: d.label, sessions: d.sessions, orders: d.conversions }));

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsHeader
        icon={<Megaphone className="h-4 w-4 text-primary" />}
        title="Campaign tracking"
        subtitle="First-touch UTM attribution — utm_* parsed from the landing page_url query and event metadata, joined to the Orders sheet by session & email. Which campaigns bring traffic AND revenue, not just clicks."
        loading={loading}
        liveCount={liveCount}
        onRefresh={refresh}
      />

      {isEmpty ? (
        <AnalyticsEmpty icon={<Megaphone className="h-7 w-7" />} />
      ) : (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Sessions" value={data.sessions.toLocaleString("en-US")} />
        <StatTile
          label="UTM-tagged"
          value={pct(data.sessions ? data.taggedSessions / data.sessions : 0)}
          sub={`${data.taggedSessions.toLocaleString("en-US")} sessions`}
        />
        <StatTile label="Campaigns" value={data.campaigns.length.toLocaleString("en-US")} />
        <StatTile
          label="Conversions"
          value={data.conversions.toLocaleString("en-US")}
          tone="ok"
          sub={`${pct(overallConv)} rate`}
        />
        <StatTile label="Revenue" value={fmtMoney(data.revenue)} tone="primary" />
      </div>

      {data.sessions === 0 ? (
        <Empty
          icon={<Megaphone className="h-8 w-8" />}
          title="No campaign telemetry yet"
          hint="Campaigns appear once sessions land with utm_* params in the page_url query or event metadata."
        />
      ) : (
        <>
          {/* Charts row 1 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <Megaphone className="h-4 w-4 text-primary" />
                <CardTitle>Top campaigns — sessions vs orders</CardTitle>
              </CardHeader>
              <CardContent>
                {topBySessions.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">No campaign-tagged traffic.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={topBySessions} margin={{ top: 8, right: 8, left: -12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: AXIS, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        interval={0}
                        angle={-18}
                        textAnchor="end"
                        height={54}
                      />
                      <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip cursor={{ fill: "hsl(220 8% 12% / 0.5)" }} content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
                      <Bar dataKey="sessions" name="Sessions" fill={PALETTE[3]} radius={[3, 3, 0, 0]} maxBarSize={38} />
                      <Bar dataKey="orders" name="Orders" fill={PALETTE[2]} radius={[3, 3, 0, 0]} maxBarSize={38} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <PieIcon className="h-4 w-4 text-primary" />
                <CardTitle>Source breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={sourcePie}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={92}
                      paddingAngle={2}
                      stroke="hsl(220 8% 7%)"
                    >
                      {sourcePie.map((_, i) => (
                        <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<ChartTooltip fmt={(_, v) => `${v.toLocaleString("en-US")} sessions`} />}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <TrendingUp className="h-4 w-4 text-ok" />
                <CardTitle>Conversion rate per campaign</CardTitle>
              </CardHeader>
              <CardContent>
                {convRate.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    Need ≥2 sessions per campaign to rank conversion rate.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={convRate}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: AXIS, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        unit="%"
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fill: AXIS, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        width={104}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(220 8% 12% / 0.5)" }}
                        content={<ChartTooltip fmt={(_, v) => `${v}%`} />}
                      />
                      <Bar dataKey="rate" name="Conv. rate" radius={[0, 3, 3, 0]} maxBarSize={22}>
                        {convRate.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center gap-2 space-y-0">
                <TrendingUp className="h-4 w-4 text-primary" />
                <CardTitle>Sessions &amp; orders trend</CardTitle>
              </CardHeader>
              <CardContent>
                {trend.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground">No dated sessions.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
                      <defs>
                        <linearGradient id="utmSess" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PALETTE[3]} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={PALETTE[3]} stopOpacity={0.04} />
                        </linearGradient>
                        <linearGradient id="utmOrd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={PALETTE[2]} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={PALETTE[2]} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: AXIS, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        minTickGap={16}
                      />
                      <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
                      <Area
                        type="monotone"
                        dataKey="sessions"
                        name="Sessions"
                        stroke={PALETTE[3]}
                        strokeWidth={2}
                        fill="url(#utmSess)"
                      />
                      <Area
                        type="monotone"
                        dataKey="orders"
                        name="Orders"
                        stroke={PALETTE[2]}
                        strokeWidth={2}
                        fill="url(#utmOrd)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Campaign table (sortable) */}
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Campaign performance</CardTitle>
              <Badge variant="muted">{data.campaigns.length} campaigns</Badge>
            </CardHeader>
            <CardContent>
              {sortedCampaigns.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No campaign-tagged traffic (no utm_campaign present).
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Campaign</TH>
                      <TH>Source / medium</TH>
                      {SORTABLE.map((s) => (
                        <SortHeader
                          key={s.key}
                          label={s.label}
                          active={sort === s.key}
                          dir={dir}
                          onClick={() => toggleSort(s.key)}
                        />
                      ))}
                    </TR>
                  </THead>
                  <TBody>
                    {sortedCampaigns.map((c: CampaignRow) => (
                      <TR key={c.key}>
                        <TD className="max-w-[180px] truncate font-medium" title={c.campaign}>
                          {c.campaign}
                        </TD>
                        <TD>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{c.source}</span>
                            <Badge variant="muted">{c.medium}</Badge>
                          </div>
                        </TD>
                        <TD className="text-right tabular-nums">{c.sessions.toLocaleString("en-US")}</TD>
                        <TD className="text-right tabular-nums text-muted-foreground">
                          {c.clicks.toLocaleString("en-US")}
                        </TD>
                        <TD className="text-right tabular-nums">{c.conversions.toLocaleString("en-US")}</TD>
                        <TD className="text-right">
                          <Badge variant={c.conversionRate >= 0.05 ? "ok" : c.conversionRate > 0 ? "warn" : "muted"}>
                            {pct(c.conversionRate)}
                          </Badge>
                        </TD>
                        <TD className="text-right tabular-nums font-medium">
                          {c.revenue ? fmtMoney(c.revenue) : "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Source table */}
          <Card>
            <CardHeader>
              <CardTitle>Traffic sources</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <THead>
                  <TR>
                    <TH>Source</TH>
                    <TH className="text-right">Sessions</TH>
                    <TH className="text-right">Clicks</TH>
                    <TH className="text-right">Orders</TH>
                    <TH className="text-right">Conv. rate</TH>
                    <TH className="text-right">Revenue</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.sources.slice(0, 14).map((s, i) => (
                    <TR key={s.source}>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: PALETTE[i % PALETTE.length] }}
                          />
                          <span className="font-medium">{s.source}</span>
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">{s.sessions.toLocaleString("en-US")}</TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {s.clicks.toLocaleString("en-US")}
                      </TD>
                      <TD className="text-right tabular-nums">{s.conversions.toLocaleString("en-US")}</TD>
                      <TD className="text-right">
                        <Badge variant={s.conversionRate >= 0.05 ? "ok" : s.conversionRate > 0 ? "warn" : "muted"}>
                          {pct(s.conversionRate)}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums text-muted-foreground">
                        {s.revenue ? fmtMoney(s.revenue) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
        </>
      )}
    </div>
  );
}

// ── page: builder + tracking ─────────────────────────────────────────────────

export function UtmCampaigns({ config }: { config: AppConfig }) {
  return (
    <div className="flex flex-col gap-6">
      <UtmBuilder />
      <CampaignTracking config={config} />
    </div>
  );
}

export default UtmCampaigns;
