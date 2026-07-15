import { useEffect, useMemo, useState } from "react";
import { Search, Mail, Phone, MapPin, Users, Send, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { timeAgo, fmtMoney } from "@/lib/utils";
import type { AppConfig } from "@/lib/config";
import { contactKey, type Customer, type License, type LicenseStatus, type ScoredLead } from "@/lib/crm";
import { composeRenewalEmail, aiPolish, canSend, sendCampaign, mailtoLink } from "@/lib/crmMail";
import { SourceBadge, StatCard, StatusControl, TagsEditor, NotesPanel, AddTaskInline } from "./components";

const LIC_VARIANT: Record<LicenseStatus, "ok" | "warn" | "down" | "muted"> = {
  active: "ok",
  perpetual: "ok",
  expiring: "warn",
  expired: "down",
};

export function LicenseStatusBadge({ license }: { license: License }) {
  const label =
    license.status === "perpetual"
      ? "Perpetual"
      : license.status === "expired"
        ? `Expired ${Math.abs(license.daysToExpiry ?? 0)}d ago`
        : license.status === "expiring"
          ? `Renews in ${license.daysToExpiry}d`
          : `Active · ${license.daysToExpiry}d left`;
  return <Badge variant={LIC_VARIANT[license.status]}>{label}</Badge>;
}

export function Customer360({
  config,
  customers,
  leads,
  focusEmail,
}: {
  config: AppConfig;
  customers: Customer[];
  leads: ScoredLead[];
  focusEmail?: string | null;
}) {
  const [q, setQ] = useState("");
  const [selectedEmail, setSelectedEmail] = useState<string | null>(focusEmail ?? customers[0]?.email ?? null);

  useEffect(() => {
    if (focusEmail) setSelectedEmail(focusEmail);
  }, [focusEmail]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return customers;
    return customers.filter((c) => `${c.name} ${c.email} ${c.company}`.toLowerCase().includes(t));
  }, [customers, q]);

  const selected = useMemo(
    () => customers.find((c) => c.email === selectedEmail) ?? filtered[0] ?? null,
    [customers, filtered, selectedEmail],
  );

  const relatedLeads = useMemo(
    () => (selected ? leads.filter((l) => l.email && l.email === selected.email) : []),
    [leads, selected],
  );

  if (customers.length === 0) {
    return (
      <Empty
        icon={<Users className="h-8 w-8" />}
        title="No customers yet"
        hint="Customers are built from the Orders sheet, grouped by email. Once orders land they appear here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="pl-8" />
        </div>
        <div className="flex max-h-[calc(100vh-220px)] flex-col gap-1 overflow-y-auto">
          {filtered.map((c) => (
            <button
              key={c.email || c.name}
              onClick={() => setSelectedEmail(c.email)}
              className={
                "flex flex-col rounded-md border px-3 py-2 text-left transition-colors " +
                (selected?.email === c.email
                  ? "border-primary/40 bg-accent"
                  : "border-border hover:bg-accent/50")
              }
            >
              <span className="truncate text-sm font-medium">{c.name || c.email || "Unknown"}</span>
              <span className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate">{c.email}</span>
                <span className="tabular-nums">{fmtMoney(c.totalSpend, c.currency)}</span>
              </span>
              <span className="mt-1 flex gap-1">
                {c.activeLicenses > 0 && <Dot tone="ok" n={c.activeLicenses} />}
                {c.expiringLicenses > 0 && <Dot tone="warn" n={c.expiringLicenses} />}
                {c.expiredLicenses > 0 && <Dot tone="down" n={c.expiredLicenses} />}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && <CustomerDetail config={config} customer={selected} relatedLeads={relatedLeads} />}
    </div>
  );
}

function Dot({ tone, n }: { tone: "ok" | "warn" | "down"; n: number }) {
  const cls = tone === "ok" ? "bg-ok/15 text-ok" : tone === "warn" ? "bg-warn/15 text-warn" : "bg-down/15 text-down";
  return <span className={"rounded px-1 text-[10px] tabular-nums " + cls}>{n}</span>;
}

function CustomerDetail({
  config,
  customer,
  relatedLeads,
}: {
  config: AppConfig;
  customer: Customer;
  relatedLeads: ScoredLead[];
}) {
  const key = contactKey(customer);
  const tenureDays = customer.firstOrderTs ? Math.floor((Date.now() - customer.firstOrderTs) / 86_400_000) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{customer.name || customer.email || "Unknown"}</div>
            <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {customer.email && (
                <a className="flex items-center gap-2 text-primary hover:underline" href={`mailto:${customer.email}`}>
                  <Mail className="h-3.5 w-3.5" /> {customer.email}
                </a>
              )}
              {customer.phone && (
                <span className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5" /> {customer.phone}
                </span>
              )}
              {customer.location && (
                <span className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5" /> {customer.location}
                </span>
              )}
            </div>
          </div>
          <StatusControl contactKey={key} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Lifetime spend" value={fmtMoney(customer.totalSpend, customer.currency)} tone="ok" />
        <StatCard label="Orders" value={customer.ordersCount} />
        <StatCard label="Active licences" value={customer.activeLicenses} tone={customer.activeLicenses ? "ok" : "down"} />
        <StatCard
          label="Expiring"
          value={customer.expiringLicenses}
          tone={customer.expiringLicenses ? "warn" : "default"}
          hint={tenureDays ? `customer ${Math.round(tenureDays / 30)} mo` : undefined}
        />
      </div>

      <Panel title="Licences & expiries">
        {customer.licenses.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No licences on record.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Edition</TH>
                <TH className="text-right">Seats</TH>
                <TH>Purchased</TH>
                <TH>Status</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {customer.licenses.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium">{l.productName}</TD>
                  <TD className="text-muted-foreground">{l.edition || "—"}</TD>
                  <TD className="text-right tabular-nums">{l.seats}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{l.ts ? timeAgo(l.ts) : "—"}</TD>
                  <TD>
                    <LicenseStatusBadge license={l} />
                  </TD>
                  <TD className="text-right">
                    {(l.status === "expiring" || l.status === "expired") && (
                      <RenewButton config={config} license={l} customerName={customer.name} />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Panel>

      <Panel title="Order history">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Product</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Price</TH>
            </TR>
          </THead>
          <TBody>
            {customer.orders.map((o, i) => (
              <TR key={i}>
                <TD className="whitespace-nowrap text-muted-foreground">{o.timestamp ? timeAgo(o.timestamp) : "—"}</TD>
                <TD>
                  <div>{o.productName ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{o.sku ?? ""}</div>
                </TD>
                <TD className="text-right tabular-nums">{o.quantity ?? 1}</TD>
                <TD className="text-right tabular-nums">
                  {o.price != null ? fmtMoney(o.price, o.currency || customer.currency) : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Panel>

      {relatedLeads.length > 0 && (
        <Panel title="Captured leads / touchpoints">
          <div className="flex flex-col gap-2">
            {relatedLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <SourceBadge source={l.source} />
                  <span className="text-sm text-muted-foreground">{l.intent || l.productInterest || "—"}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">{l.ts ? timeAgo(l.ts) : ""}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Tags">
          <TagsEditor contactKey={key} />
        </Panel>
        <Panel title="Follow-up">
          <AddTaskInline contactKey={key} contactLabel={customer.name || customer.email} />
        </Panel>
      </div>
      <Panel title="Notes & communications">
        <NotesPanel contactKey={key} />
      </Panel>
    </div>
  );
}

function RenewButton({
  config,
  license,
  customerName,
}: {
  config: AppConfig;
  license: License;
  customerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const draft = composeRenewalEmail(license, customerName);
      draft.body = await aiPolish(config, draft);
      if (canSend()) {
        const [res] = await sendCampaign(config, [draft]);
        setMsg(res.ok ? "Renewal sent ✓" : `Failed: ${res.detail}`);
      } else {
        window.open(mailtoLink(draft), "_blank");
        setMsg("Opened draft");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        {canSend() ? <Send /> : <Copy />} {busy ? "…" : "Renew"}
      </Button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border/60 px-4 py-2.5 text-sm font-semibold">{title}</div>
      <div className="p-3">{children}</div>
    </div>
  );
}
