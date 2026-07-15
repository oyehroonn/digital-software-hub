import { useMemo, useState } from "react";
import { CalendarClock, Send, Copy, Sparkles, MailWarning, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { timeAgo, fmtMoney } from "@/lib/utils";
import type { AppConfig } from "@/lib/config";
import type { Customer, License } from "@/lib/crm";
import {
  buildRenewalCampaign,
  aiPolish,
  canSend,
  sendCampaign,
  mailtoLink,
  type EmailDraft,
  type SendResult,
} from "@/lib/crmMail";
import { StatCard } from "./components";
import { LicenseStatusBadge } from "./Customer360";
import { Select } from "./LeadInbox";

const WINDOWS = [7, 30, 45, 90, 365];

export function LicenseTracker({
  config,
  renewals,
  customers,
}: {
  config: AppConfig;
  renewals: License[];
  customers: Customer[];
}) {
  const [windowDays, setWindowDays] = useState(45);
  const [includeExpired, setIncludeExpired] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [polish, setPolish] = useState(true);

  const shown = useMemo(
    () =>
      renewals.filter((l) => {
        if (l.status === "expired") return includeExpired;
        return (l.daysToExpiry ?? Infinity) <= windowDays;
      }),
    [renewals, windowDays, includeExpired],
  );

  const atRisk = useMemo(() => shown.reduce((s, l) => s + l.price, 0), [shown]);
  const expiringCount = shown.filter((l) => l.status === "expiring").length;
  const expiredCount = shown.filter((l) => l.status === "expired").length;

  const selectedLicenses = useMemo(() => shown.filter((l) => selected[l.id] && l.customerEmail), [shown, selected]);
  const targetLicenses = selectedLicenses.length > 0 ? selectedLicenses : shown.filter((l) => l.customerEmail);

  const allChecked = shown.length > 0 && shown.every((l) => selected[l.id]);
  const toggleAll = () => {
    if (allChecked) setSelected({});
    else setSelected(Object.fromEntries(shown.map((l) => [l.id, true])));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Expiring soon" value={expiringCount} tone="warn" hint={`≤ ${windowDays} days`} />
        <StatCard label="Expired" value={expiredCount} tone="down" />
        <StatCard label="Revenue at risk" value={fmtMoney(atRisk)} tone="warn" />
        <StatCard label="In pipeline" value={renewals.length} hint="all expiring + expired" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarClock className="h-4 w-4" /> Window
          <Select value={String(windowDays)} onChange={(v) => setWindowDays(Number(v))}>
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                next {w} days
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeExpired}
            onChange={(e) => setIncludeExpired(e.target.checked)}
            className="accent-[hsl(var(--primary))]"
          />
          Include already-expired
        </label>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={polish}
            onChange={(e) => setPolish(e.target.checked)}
            className="accent-[hsl(var(--primary))]"
          />
          <Sparkles className="h-3.5 w-3.5" /> AI-polish copy
        </label>
      </div>

      {shown.length === 0 ? (
        <Empty
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="No renewals due"
          hint="Nothing is expiring in this window. Widen it or include expired licences."
        />
      ) : (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH className="w-8">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll} className="accent-[hsl(var(--primary))]" />
                  </TH>
                  <TH>Customer</TH>
                  <TH>Product</TH>
                  <TH className="text-right">Seats</TH>
                  <TH>Purchased</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Value</TH>
                </TR>
              </THead>
              <TBody>
                {shown.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={!!selected[l.id]}
                        onChange={(e) => setSelected((s) => ({ ...s, [l.id]: e.target.checked }))}
                        className="accent-[hsl(var(--primary))]"
                      />
                    </TD>
                    <TD>
                      <div className="font-medium">{l.customerName || l.customerEmail || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{l.customerEmail || "no email"}</div>
                    </TD>
                    <TD>
                      {l.productName}
                      {l.edition && <span className="ml-1 text-[11px] text-muted-foreground">{l.edition}</span>}
                    </TD>
                    <TD className="text-right tabular-nums">{l.seats}</TD>
                    <TD className="whitespace-nowrap text-muted-foreground">{l.ts ? timeAgo(l.ts) : "—"}</TD>
                    <TD>
                      <LicenseStatusBadge license={l} />
                    </TD>
                    <TD className="text-right tabular-nums">{fmtMoney(l.price, l.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <CampaignPanel
            config={config}
            licenses={targetLicenses}
            customers={customers}
            polish={polish}
            usingSelection={selectedLicenses.length > 0}
          />
        </>
      )}
    </div>
  );
}

function CampaignPanel({
  config,
  licenses,
  customers,
  polish,
  usingSelection,
}: {
  config: AppConfig;
  licenses: License[];
  customers: Customer[];
  polish: boolean;
  usingSelection: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [preview, setPreview] = useState<EmailDraft | null>(null);

  const drafts = useMemo(() => buildRenewalCampaign(licenses, customers), [licenses, customers]);
  const withEmail = drafts.length;

  const run = async () => {
    setBusy(true);
    setResults(null);
    try {
      const prepared: EmailDraft[] = [];
      for (const d of drafts) prepared.push({ ...d, body: polish ? await aiPolish(config, d) : d.body });
      if (canSend()) {
        setResults(await sendCampaign(config, prepared));
      } else {
        // Browser: no Email API — open the first draft and report the rest.
        if (prepared[0]) window.open(mailtoLink(prepared[0]), "_blank");
        setResults(
          prepared.map((d, i) => ({
            to: d.to,
            ok: i === 0,
            detail: i === 0 ? "opened draft (desktop app sends the full batch)" : "queued — send from desktop app",
          })),
        );
      }
    } catch (e) {
      setResults([{ to: "—", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MailWarning className="h-4 w-4 text-warn" /> Renewal campaign
          </div>
          <div className="text-xs text-muted-foreground">
            {withEmail} recipient{withEmail === 1 ? "" : "s"} ({usingSelection ? "selected" : "all in window"})
            {drafts.length !== licenses.length && ` · ${licenses.length - drafts.length} skipped (no email)`}
            {!canSend() && " · desktop app required to send the batch"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {drafts[0] && (
            <Button variant="outline" size="sm" onClick={() => setPreview(preview ? null : drafts[0])}>
              {preview ? "Hide" : "Preview"}
            </Button>
          )}
          <Button size="sm" disabled={busy || withEmail === 0} onClick={run}>
            {canSend() ? <Send /> : <Copy />} {busy ? "Sending…" : `Trigger (${withEmail})`}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="mt-3 rounded-md border border-border bg-card p-3 text-sm">
          <div className="text-[11px] text-muted-foreground">To: {preview.to}</div>
          <div className="font-medium">{preview.subject}</div>
          <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{preview.body}</div>
        </div>
      )}

      {results && (
        <div className="mt-3 flex flex-col gap-1">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-ok" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-down" />
              )}
              <span className="font-medium">{r.to}</span>
              <span className="text-muted-foreground">{r.detail}</span>
            </div>
          ))}
          <div className="mt-1">
            <Badge variant="ok">{results.filter((r) => r.ok).length} ok</Badge>{" "}
            <Badge variant="down">{results.filter((r) => !r.ok).length} failed</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
