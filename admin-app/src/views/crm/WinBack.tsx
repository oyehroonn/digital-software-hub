import { useMemo, useState } from "react";
import { HeartHandshake, Send, Copy, Sparkles, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import type { AppConfig } from "@/lib/config";
import type { WinBackEntry } from "@/lib/crm";
import {
  buildWinBackCampaign,
  composeWinBackEmail,
  aiPolish,
  canSend,
  sendCampaign,
  mailtoLink,
  type EmailDraft,
  type SendResult,
} from "@/lib/crmMail";
import { StatCard } from "./components";

export function WinBack({ config, winBack }: { config: AppConfig; winBack: WinBackEntry[] }) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [polish, setPolish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [preview, setPreview] = useState<EmailDraft | null>(null);

  const withEmail = winBack.filter((w) => w.customer.email);
  const recoverable = winBack.reduce((s, w) => s + w.customer.totalSpend, 0);
  const selectedEntries = winBack.filter((w) => selected[w.customer.email] && w.customer.email);
  const targets = selectedEntries.length > 0 ? selectedEntries : withEmail;
  const allChecked = withEmail.length > 0 && withEmail.every((w) => selected[w.customer.email]);

  const drafts = useMemo(() => buildWinBackCampaign(targets), [targets]);

  const run = async () => {
    setBusy(true);
    setResults(null);
    try {
      const prepared: EmailDraft[] = [];
      for (const d of drafts) prepared.push({ ...d, body: polish ? await aiPolish(config, d) : d.body });
      if (canSend()) {
        setResults(await sendCampaign(config, prepared));
      } else {
        if (prepared[0]) window.open(mailtoLink(prepared[0]), "_blank");
        setResults(
          prepared.map((d, i) => ({
            to: d.to,
            ok: i === 0,
            detail: i === 0 ? "opened draft (desktop app sends the batch)" : "queued — send from desktop app",
          })),
        );
      }
    } catch (e) {
      setResults([{ to: "—", ok: false, detail: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setBusy(false);
    }
  };

  if (winBack.length === 0) {
    return (
      <Empty
        icon={<HeartHandshake className="h-8 w-8" />}
        title="No one to win back"
        hint="Every customer holds an active licence or ordered recently. Nice."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Lapsed customers" value={winBack.length} tone="warn" />
        <StatCard label="With email" value={withEmail.length} />
        <StatCard label="Recoverable value" value={fmtMoney(recoverable)} tone="ok" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/[0.04] p-3">
        <div className="text-sm">
          <span className="font-semibold">Win-back campaign</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {drafts.length} recipient{drafts.length === 1 ? "" : "s"} ({selectedEntries.length > 0 ? "selected" : "all"})
            {!canSend() && " · desktop app required to send the batch"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={polish}
              onChange={(e) => setPolish(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />
            <Sparkles className="h-3.5 w-3.5" /> AI-polish
          </label>
          {targets[0] && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreview(preview ? null : composeWinBackEmail(targets[0]))}
            >
              {preview ? "Hide" : "Preview"}
            </Button>
          )}
          <Button size="sm" disabled={busy || drafts.length === 0} onClick={run}>
            {canSend() ? <Send /> : <Copy />} {busy ? "Sending…" : `Launch (${drafts.length})`}
          </Button>
        </div>
      </div>

      {preview && (
        <div className="rounded-md border border-border bg-card p-3 text-sm">
          <div className="text-[11px] text-muted-foreground">To: {preview.to}</div>
          <div className="font-medium">{preview.subject}</div>
          <div className="mt-2 whitespace-pre-wrap text-muted-foreground">{preview.body}</div>
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-3">
          {results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {r.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-ok" /> : <XCircle className="h-3.5 w-3.5 text-down" />}
              <span className="font-medium">{r.to}</span>
              <span className="text-muted-foreground">{r.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border">
        <Table>
          <THead>
            <TR>
              <TH className="w-8">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() =>
                    setSelected(allChecked ? {} : Object.fromEntries(withEmail.map((w) => [w.customer.email, true])))
                  }
                  className="accent-[hsl(var(--primary))]"
                />
              </TH>
              <TH>Customer</TH>
              <TH>Why</TH>
              <TH className="text-right">Dormant</TH>
              <TH className="text-right">Lifetime value</TH>
              <TH className="text-right">Priority</TH>
            </TR>
          </THead>
          <TBody>
            {winBack.map((w) => (
              <TR key={w.customer.email || w.customer.name}>
                <TD>
                  <input
                    type="checkbox"
                    disabled={!w.customer.email}
                    checked={!!selected[w.customer.email]}
                    onChange={(e) => setSelected((s) => ({ ...s, [w.customer.email]: e.target.checked }))}
                    className="accent-[hsl(var(--primary))]"
                  />
                </TD>
                <TD>
                  <div className="font-medium">{w.customer.name || w.customer.email || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{w.customer.email || "no email"}</div>
                </TD>
                <TD className="text-muted-foreground">{w.reason}</TD>
                <TD className="text-right tabular-nums">
                  {w.dormantDays >= 9999 ? "—" : `${w.dormantDays}d`}
                </TD>
                <TD className="text-right tabular-nums">{fmtMoney(w.customer.totalSpend, w.customer.currency)}</TD>
                <TD className="text-right">
                  <PriorityBadge p={w.priority} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function PriorityBadge({ p }: { p: number }) {
  const variant = p >= 0.6 ? "ok" : p >= 0.35 ? "warn" : "muted";
  const label = p >= 0.6 ? "High" : p >= 0.35 ? "Medium" : "Low";
  return <Badge variant={variant as "ok" | "warn" | "muted"}>{label}</Badge>;
}
