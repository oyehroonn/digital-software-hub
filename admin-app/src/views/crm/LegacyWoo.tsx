import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database, Search, Users, ShoppingBag, Package,
  RefreshCw, DownloadCloud, Mail, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/Empty";

/**
 * Legacy (WooCommerce) — customers & orders migrated from the old
 * digitalsoftwaremarkett.com store (WooCommerce REST export). Read-only snapshot
 * bundled under /public/legacy so the admin surfaces the historical book of
 * business alongside the live Orders/Telemetry data. Does NOT touch live sheets.
 */

interface WooCustomer {
  id: number; email: string; name?: string; username?: string; created?: string;
  role?: string; orders_count?: number; total_spent?: string; city?: string;
  country?: string; phone?: string;
}
interface WooOrder {
  id: number; number?: string; status?: string; email?: string; name?: string;
  total?: string; currency?: string; created?: string; paid?: string;
  items?: { name: string; qty: number; total: string }[]; payment?: string; customer_id?: number;
}
interface ACContact {
  id?: string; email?: string; name?: string; phone?: string; created?: string; updated?: string; status?: string;
}

const PAGE = 50;
const money = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fdate = (s?: string) => (s ? s.slice(0, 10) : "—");

const statusTone: Record<string, "ok" | "warn" | "down" | "muted" | "default"> = {
  completed: "ok", processing: "default", "on-hold": "warn",
  cancelled: "down", refunded: "down", failed: "down",
};

export function LegacyWoo() {
  const [customers, setCustomers] = useState<WooCustomer[] | null>(null);
  const [orders, setOrders] = useState<WooOrder[] | null>(null);
  const [acContacts, setAcContacts] = useState<ACContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"customers" | "orders" | "ac">("customers");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    // AC contacts are optional (only present once pulled) — don't fail the view.
    fetch(`${base}legacy/ac-contacts.json`).then((r) => (r.ok ? r.json() : [])).then(setAcContacts).catch(() => setAcContacts([]));
    Promise.all([
      fetch(`${base}legacy/woo-customers.json`).then((r) => r.json()),
      fetch(`${base}legacy/woo-orders.json`).then((r) => r.json()),
    ])
      .then(([c, o]) => { setCustomers(c); setOrders(o); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const stats = useMemo(() => {
    if (!customers || !orders) return null;
    const rev: Record<string, number> = {};
    const prod: Record<string, number> = {};
    for (const o of orders) {
      if (["completed", "processing", "on-hold"].includes(o.status || "")) {
        rev[o.currency || "?"] = (rev[o.currency || "?"] || 0) + Number(o.total || 0);
      }
      for (const it of o.items || []) prod[it.name] = (prod[it.name] || 0) + Number(it.qty || 1);
    }
    const topProd = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { rev, topProd };
  }, [customers, orders]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (tab === "customers") {
      const rows = customers || [];
      return t ? rows.filter((c) => `${c.email} ${c.name} ${c.username} ${c.country}`.toLowerCase().includes(t)) : rows;
    }
    if (tab === "ac") {
      return t ? acContacts.filter((c) => `${c.email} ${c.name} ${c.phone}`.toLowerCase().includes(t)) : acContacts;
    }
    const rows = orders || [];
    return t ? rows.filter((o) => `${o.email} ${o.name} ${o.number} ${o.status}`.toLowerCase().includes(t)) : rows;
  }, [tab, q, customers, orders, acContacts]);

  useEffect(() => setPage(0), [tab, q]);

  if (error) return <Empty icon={<Database className="size-5" />} title="Couldn't load legacy export" hint={error} />;
  if (!customers || !orders || !stats) return <Empty icon={<Database className="size-5" />} title="Loading legacy WooCommerce data…" />;

  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.ceil(filtered.length / PAGE);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" /> Legacy · WooCommerce
        </h1>
        <p className="text-xs text-muted-foreground">
          Read-only snapshot migrated from the old digitalsoftwaremarkett.com store. Historical customers &amp; orders — separate from live data.
        </p>
      </div>

      {/* Live sync panels — WooCommerce + ActiveCampaign */}
      <div className="grid gap-3 lg:grid-cols-2">
        <SyncPanel base="woo" sourceLabel="WooCommerce" onPulled={() => window.location.reload()} />
        <SyncPanel base="ac" sourceLabel="ActiveCampaign" onPulled={() => window.location.reload()} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={<Users className="size-4" />} label="Customers" value={customers.length.toLocaleString()} />
        <Kpi icon={<ShoppingBag className="size-4" />} label="Orders" value={orders.length.toLocaleString()} />
        {Object.entries(stats.rev).map(([cur, v]) => (
          <Kpi key={cur} icon={<Package className="size-4" />} label={`Revenue (${cur})`} value={`${cur} ${money(v)}`} />
        ))}
      </div>

      {/* top products */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Top products (by units sold)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {stats.topProd.map(([name, n]) => (
            <Badge key={name} variant="muted" className="font-normal">{name} · {n}</Badge>
          ))}
        </CardContent>
      </Card>

      {/* controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button size="sm" variant={tab === "customers" ? "default" : "ghost"} onClick={() => setTab("customers")}>
            Customers <span className="ml-1 opacity-60">{customers.length}</span>
          </Button>
          <Button size="sm" variant={tab === "orders" ? "default" : "ghost"} onClick={() => setTab("orders")}>
            Orders <span className="ml-1 opacity-60">{orders.length}</span>
          </Button>
          <Button size="sm" variant={tab === "ac" ? "default" : "ghost"} onClick={() => setTab("ac")}>
            AC Contacts <span className="ml-1 opacity-60">{acContacts.length}</span>
          </Button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${tab}…`} className="pl-8" />
        </div>
      </div>

      {/* table */}
      {tab === "customers" ? (
        <Table>
          <THead><TR><TH>Email</TH><TH>Name</TH><TH>Country</TH><TH>Registered</TH></TR></THead>
          <TBody>
            {(pageRows as WooCustomer[]).map((c) => (
              <TR key={c.id}>
                <TD className="font-medium">{c.email}</TD>
                <TD className="text-muted-foreground">{c.name || "—"}</TD>
                <TD>{c.country || "—"}</TD>
                <TD className="text-muted-foreground">{fdate(c.created)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : tab === "ac" ? (
        acContacts.length === 0 ? (
          <Empty icon={<Database className="size-5" />} title="No ActiveCampaign contacts pulled yet" hint="Use the ActiveCampaign 'Pull now' button above (local admin) to import contacts." />
        ) : (
          <Table>
            <THead><TR><TH>Email</TH><TH>Name</TH><TH>Phone</TH><TH>Status</TH><TH>Created</TH></TR></THead>
            <TBody>
              {(pageRows as ACContact[]).map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.email}</TD>
                  <TD className="text-muted-foreground">{c.name || "—"}</TD>
                  <TD className="text-muted-foreground">{c.phone || "—"}</TD>
                  <TD>{c.status === "1" ? <Badge variant="ok" className="font-normal">active</Badge> : <Badge variant="muted" className="font-normal">{String(c.status ?? "—")}</Badge>}</TD>
                  <TD className="text-muted-foreground">{fdate(c.created)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )
      ) : (
        <Table>
          <THead><TR><TH>Order</TH><TH>Customer</TH><TH>Status</TH><TH>Total</TH><TH>Items</TH><TH>Date</TH></TR></THead>
          <TBody>
            {(pageRows as WooOrder[]).map((o) => (
              <TR key={o.id}>
                <TD className="font-medium">#{o.number || o.id}</TD>
                <TD className="text-muted-foreground">{o.email || o.name || "—"}</TD>
                <TD><Badge variant={statusTone[o.status || ""] || "muted"} className="font-normal">{o.status}</Badge></TD>
                <TD className="tabular-nums">{o.currency} {Number(o.total || 0).toLocaleString()}</TD>
                <TD className="max-w-[22ch] truncate text-muted-foreground" title={(o.items || []).map((i) => `${i.name} x${i.qty}`).join(", ")}>
                  {(o.items || []).map((i) => i.name).join(", ") || "—"}
                </TD>
                <TD className="text-muted-foreground">{fdate(o.created)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* pager */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length.toLocaleString()} {tab}{q ? " (filtered)" : ""}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span>{page + 1} / {Math.max(1, pages)}</span>
          <Button size="sm" variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

interface SyncStatus {
  state?: "idle" | "running" | "done" | "error";
  phase?: string; progress?: number; message?: string;
  lastPull?: string | null;
  counts?: { customers: number; orders: number }; // woo
  count?: number;                                  // ac (contacts)
  drift?: (Record<string, number> & { error?: string; checkedAt?: string }) | null;
  emailed?: boolean; emailError?: string;
}

const rel = (iso?: string | null) => {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

/**
 * Live-sync control. Talks to the dev-only /api/woo/* endpoints (keys stay
 * server-side). Detects drift vs the live WooCommerce store, runs a pull job
 * with progress, and the job emails the result. Absent on the deployed admin →
 * shows a "run locally to sync" hint.
 */
function SyncPanel({ base, sourceLabel, onPulled }: { base: "woo" | "ac"; sourceLabel: string; onPulled: () => void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [drift, setDrift] = useState<SyncStatus["drift"] | null>(null);
  const poll = useRef<number | null>(null);
  const wasRunning = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await fetch(`/api/${base}/status`);
      if (!r.ok) throw new Error();
      const s: SyncStatus = await r.json();
      setStatus(s); setAvailable(true);
      if (s.drift && !s.drift.error) setDrift(s.drift);
      if (s.state === "running") { wasRunning.current = true; }
      else if (wasRunning.current && s.state === "done") {
        wasRunning.current = false;
        if (poll.current) { clearInterval(poll.current); poll.current = null; }
        onPulled();
      }
      return s;
    } catch { setAvailable(false); return null; }
  }, [base, onPulled]);

  useEffect(() => { loadStatus(); return () => { if (poll.current) clearInterval(poll.current); }; }, [loadStatus]);

  const checkDrift = async () => {
    setChecking(true);
    try { const r = await fetch(`/api/${base}/drift`); setDrift(await r.json()); } catch { /* ignore */ }
    setChecking(false);
  };

  const startPull = async () => {
    await fetch(`/api/${base}/pull`, { method: "POST" });
    wasRunning.current = true;
    setStatus((s) => ({ ...(s || {}), state: "running", progress: 1, message: "Starting…" }));
    if (poll.current) clearInterval(poll.current);
    poll.current = window.setInterval(loadStatus, 1500);
  };

  if (available === false) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Database className="size-3.5" /> Live {sourceLabel} sync runs in the <b>local admin</b> (<code>npm run dev</code>) — this is a deployed snapshot.
        </CardContent>
      </Card>
    );
  }

  const running = status?.state === "running";
  const DRIFT_META = new Set(["error", "checkedAt", "live", "snapshot"]);
  const driftItems = drift && !drift.error
    ? Object.entries(drift).filter(([k, v]) => !DRIFT_META.has(k) && typeof v === "number" && (v as number) > 0) as [string, number][]
    : [];
  const hasNew = driftItems.length > 0;
  const countLabel = status?.counts
    ? `${status.counts.customers.toLocaleString()} customers · ${status.counts.orders} orders`
    : status?.count != null ? `${status.count.toLocaleString()} contacts` : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            <span><b>{sourceLabel}</b> · last pull <b>{rel(status?.lastPull)}</b></span>
            {countLabel && <span className="text-muted-foreground">· {countLabel}</span>}
            {status?.emailed && <Badge variant="ok" className="font-normal"><Mail className="mr-1 size-3" />emailed</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={checkDrift} disabled={checking || running}>
              <RefreshCw className={checking ? "animate-spin" : ""} /> Check for changes
            </Button>
            <Button size="sm" onClick={startPull} disabled={running}>
              <DownloadCloud className={running ? "animate-pulse" : ""} /> {running ? "Pulling…" : "Pull now"}
            </Button>
          </div>
        </div>

        {drift && !running && (
          drift.error ? (
            <div className="flex items-center gap-2 text-xs text-amber-500"><AlertCircle className="size-3.5" /> Couldn't reach {sourceLabel}: {drift.error}</div>
          ) : hasNew ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <AlertCircle className="size-3.5 text-amber-500" />
              <span><b>{driftItems.map(([k, v]) => `+${v} ${k}`).join(", ")}</b> since the last pull. Run <b>Pull now</b> to refresh.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-emerald-500"><CheckCircle2 className="size-3.5" /> Up to date — no changes since the last pull.</div>
          )
        )}

        {running && (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${status?.progress ?? 5}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">{status?.message || "Working…"} · you'll get an email when it's done</div>
          </div>
        )}
        {status?.state === "error" && !running && (
          <div className="flex items-center gap-2 text-xs text-red-500"><AlertCircle className="size-3.5" /> Sync failed: {status.message}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default LegacyWoo;
