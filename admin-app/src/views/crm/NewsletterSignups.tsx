/**
 * NewsletterSignups — dedicated admin view listing every newsletter /
 * release-list signup captured on the site: email, signup timestamp and (best
 * effort) the page it was captured from.
 *
 * DATA SOURCE — reuses the site's EXISTING, already-documented capture path
 * rather than inventing a new one:
 *   1. Every signup form on the storefront calls `captureLead({ email,
 *      source: "newsletter", ... })` (see frontend/src/lib/captureLead.ts,
 *      wired up today by the footer's <NewsletterSignup> in Footer.tsx). That
 *      writes a `type:"order"` LEAD row into the shared stable Orders sheet,
 *      tagged with `source`.
 *   2. `lib/siteLeads.ts` (already used by the "Site leads" tab) classifies
 *      any such row as the `footer` ("Newsletter") source — including rows
 *      that carry no explicit tag at all, via its shape-based fallback ("an
 *      email-only row ≈ newsletter"). This view reuses that SAME
 *      classification, so it keeps working unchanged.
 *   3. The Footer signup also fires a `newsletter_signup` TELEMETRY event
 *      alongside the lead capture (same session id), which — unlike the
 *      Orders row — carries a `pageUrl`. This view joins that event by
 *      session id to show the page a signup came from; when no match exists
 *      the page column shows "(unknown)" rather than a guess.
 *
 * ASSUMPTION TO RECONCILE — a parallel content workstream is replacing the
 * old "Research" section with a "Release + Newsletter" email-capture block.
 * If it reuses `captureLead()` with a source tag containing "newsletter" /
 * "footer" / "release" (the pattern every other capture point in this
 * codebase follows — see the doc comment at the top of captureLead.ts), its
 * signups will appear here automatically: the source filter below matches
 * `footer` PLUS any tag containing "release", and the telemetry join matches
 * any event name containing "newsletter" or "release" + "sign". If that new
 * section instead lands its own sheet/table, swap the `orders`/`events`
 * source below for that — the table, search, KPIs and PDF export are
 * unaffected by where the rows come from.
 */
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Mail, RefreshCw, Search, TrendingUp, UserPlus } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { useAnalyticsData } from "@/views/analytics/useAnalyticsData";
import { deriveSiteCaptures, type SiteCapture } from "@/lib/siteLeads";
import { evName, pagePath, sessionOf } from "@/lib/telemetryFields";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Empty } from "@/components/Empty";
import { ExportPdfButton } from "@/components/ExportPdfButton";
import type { PdfReport } from "@/lib/pdfExport";

const RELEASE_RE = /release/i;
const SIGNUP_EVENT_RE = /(newsletter|release).*sign|sign.*up.*(newsletter|release)|newsletter_?signup|release_?signup/i;

interface NewsletterRow {
  key: string;
  email: string;
  name: string;
  ts: number;
  capturedAt: string;
  sourcePage: string;
  notes: string;
}

function fmtDate(ts: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function NewsletterSignups({ config }: { config: AppConfig }) {
  const { events, orders, isEmpty, loading, liveCount, refresh } = useAnalyticsData(config);
  const [q, setQ] = useState("");

  const rows = useMemo<NewsletterRow[]>(() => {
    // Session → first page seen on a newsletter/release signup telemetry event.
    const pageBySession = new Map<string, string>();
    events.forEach((e, i) => {
      if (!SIGNUP_EVENT_RE.test(evName(e))) return;
      const sid = sessionOf(e, i);
      if (!pageBySession.has(sid)) pageBySession.set(sid, pagePath(e));
    });

    const captures: SiteCapture[] = deriveSiteCaptures(orders).filter((c) => {
      if (c.source === "footer") return true;
      const rawTag = String((c.order as unknown as Record<string, unknown>)?.source ?? "");
      return RELEASE_RE.test(rawTag);
    });

    // Dedupe to one row per email (latest capture wins), matching the Site
    // Leads contact model — a visitor who re-subscribes isn't three rows.
    const byEmail = new Map<string, NewsletterRow>();
    for (const c of captures) {
      const key = c.email || `anon:${c.id}`;
      const sid = String((c.order as unknown as Record<string, unknown>)?.sessionId ?? (c.order as unknown as Record<string, unknown>)?.session_id ?? "");
      const sourcePage = (sid && pageBySession.get(sid)) || "(unknown)";
      const existing = byEmail.get(key);
      if (!existing || c.ts > existing.ts) {
        byEmail.set(key, {
          key,
          email: c.email || "(no email)",
          name: c.name,
          ts: c.ts,
          capturedAt: c.capturedAt,
          sourcePage,
          notes: c.notes,
        });
      }
    }
    return [...byEmail.values()].sort((a, b) => b.ts - a.ts);
  }, [events, orders]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) => r.email.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle) || r.sourcePage.toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const weekAgo = Date.now() - 7 * 86_400_000;
  const newThisWeek = rows.filter((r) => r.ts >= weekAgo).length;
  const topPage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.sourcePage, (counts.get(r.sourcePage) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [rows]);

  // Daily signups over the last 30 days — a real net-new trend view (not just a list).
  const trend = useMemo(() => {
    const DAY = 86_400_000;
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (!r.ts) continue;
      const d = new Date(r.ts).toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const out: { date: string; label: string; count: number }[] = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * DAY).toISOString().slice(0, 10);
      out.push({
        date: d,
        label: new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        count: byDay.get(d) ?? 0,
      });
    }
    return out;
  }, [rows]);

  const exportCsv = () => {
    const headers = ["Email", "Name", "Signed up", "Source page"];
    const body = filtered.map((r) => [r.email, r.name, r.capturedAt || fmtDate(r.ts), r.sourcePage]);
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [headers, ...body].map((row) => row.map((v) => esc(String(v ?? ""))).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "newsletter-signups.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const buildPdf = (): PdfReport => ({
    title: "Newsletter Signups Report",
    subtitle:
      "Every email captured through the site's newsletter / release-list signup, with signup date and (where known) the page it came from.",
    meta: `${rows.length} signup(s)${q.trim() ? ` · filtered to "${q.trim()}" (${filtered.length} shown)` : ""}`,
    kpis: [
      { label: "Total signups", value: rows.length.toLocaleString("en-US") },
      { label: "New this week", value: newThisWeek.toLocaleString("en-US") },
      { label: "Top source page", value: topPage ? topPage[0].slice(0, 24) : "—", sub: topPage ? `${topPage[1]} signups` : undefined },
    ],
    tables: [
      {
        heading: "Signups per day — last 30 days",
        columns: ["Day", "Signups"],
        rows: trend.filter((t) => t.count > 0).map((t) => [t.label, t.count]),
        rightAlignCols: [1],
      },
      {
        heading: "All signups",
        columns: ["#", "Email", "Name", "Signed up", "Source page"],
        rows: filtered.map((r, i) => [i + 1, r.email, r.name || "—", r.capturedAt || fmtDate(r.ts), r.sourcePage]),
        rightAlignCols: [0],
      },
    ],
    filename: "newsletter-signups",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="h-5 w-5 text-primary" /> Newsletter signups
            {liveCount > 0 && (
              <Badge variant="ok" title="Reading live telemetry from the sheet.">
                live · {liveCount.toLocaleString("en-US")}
              </Badge>
            )}
          </h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Every email captured via the newsletter / release-list signup, deduped by email. Sourced from the
            same lead-capture pipeline as Site Leads, joined to telemetry for the originating page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportPdfButton build={buildPdf} disabled={filtered.length === 0} />
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="size-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <Empty
          icon={<UserPlus className="h-7 w-7" />}
          title="No signups yet"
          hint="Newsletter / release-list signups appear here once the Orders sheet is connected and visitors start subscribing."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card>
              <CardContent className="p-3.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total signups</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums">{rows.length.toLocaleString("en-US")}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">New this week</div>
                <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ok">{newThisWeek.toLocaleString("en-US")}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top source page</div>
                <div className="mt-0.5 truncate text-lg font-semibold" title={topPage?.[0]}>
                  {topPage ? topPage[0] : "—"}
                </div>
                {topPage && <div className="text-[11px] text-muted-foreground">{topPage[1]} signups</div>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <TrendingUp className="h-4 w-4 text-primary" />
              <CardTitle>Signups — last 30 days</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="newsletterTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(4 65% 54%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(4 65% 54%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#9aa0a6", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(220 6% 16%)" }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fill: "#9aa0a6", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={28}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{ background: "hsl(220 8% 7%)", border: "1px solid hsl(220 6% 16%)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#e8e8e8" }}
                      formatter={(v: number) => [v, "Signups"]}
                    />
                    <Area type="monotone" dataKey="count" stroke="hsl(4 65% 54%)" strokeWidth={2} fill="url(#newsletterTrend)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Signups</CardTitle>
              <div className="relative w-56">
                <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search email, name, page…"
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </CardHeader>
            <CardContent>
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0 ? "No signups captured yet." : "No signups match your search."}
                </div>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>Email</TH>
                      <TH>Name</TH>
                      <TH>Signed up</TH>
                      <TH>Source page</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {filtered.map((r) => (
                      <TR key={r.key}>
                        <TD className="font-medium">{r.email}</TD>
                        <TD className="text-muted-foreground">{r.name || "—"}</TD>
                        <TD className="whitespace-nowrap tabular-nums text-muted-foreground">{r.capturedAt || fmtDate(r.ts)}</TD>
                        <TD className="max-w-[280px] truncate text-muted-foreground" title={r.sourcePage}>
                          {r.sourcePage}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default NewsletterSignups;
