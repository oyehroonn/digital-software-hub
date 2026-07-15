/**
 * Email SEND LOG — the audit trail of every blast/single/quote send made from
 * the admin app, grouped into batches. Backed by the marketing store; each row
 * records recipient, subject, campaign, status and any transport error.
 */
import { Fragment, useMemo, useState } from "react";
import { Mail, Search, Trash2, CheckCircle2, XCircle, FlaskConical, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { timeAgo } from "@/lib/utils";
import { clearSendLog, type SendLogEntry, type SendStatus } from "./store";
import { useMarketing } from "./useStore";
import { StatTile, ViewHeader, Notice } from "./ui";

const STATUS: Record<SendStatus, { cls: string; icon: typeof CheckCircle2 }> = {
  sent: { cls: "text-ok", icon: CheckCircle2 },
  failed: { cls: "text-down", icon: XCircle },
  simulated: { cls: "text-muted-foreground", icon: FlaskConical },
};

interface Batch {
  batchId: string;
  subject: string;
  at: number;
  campaignName?: string;
  kind: SendLogEntry["kind"];
  entries: SendLogEntry[];
  sent: number; failed: number; simulated: number;
}

export function SendLogView() {
  const { sendLog } = useMarketing();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!q) return sendLog;
    const t = q.toLowerCase();
    return sendLog.filter((e) => [e.to, e.subject, e.campaignName, e.status].filter(Boolean).some((v) => String(v).toLowerCase().includes(t)));
  }, [sendLog, q]);

  const batches = useMemo(() => groupBatches(filtered), [filtered]);

  const totals = useMemo(() => ({
    sent: sendLog.filter((e) => e.status === "sent").length,
    failed: sendLog.filter((e) => e.status === "failed").length,
    simulated: sendLog.filter((e) => e.status === "simulated").length,
  }), [sendLog]);

  function toggle(id: string) {
    setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        title="Send log"
        subtitle="Every email sent from the admin app, grouped by batch."
        actions={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sends…" className="w-56 pl-8" />
            </div>
            <Button variant="outline" size="sm" disabled={sendLog.length === 0}
              onClick={() => { if (confirm("Clear the entire send log?")) { clearSendLog(); setNotice("Log cleared"); setTimeout(() => setNotice(null), 2000); } }}>
              <Trash2 /> Clear
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Mail className="h-4 w-4" />} label="Total sends" value={sendLog.length.toLocaleString()} />
        <StatTile icon={<CheckCircle2 className="h-4 w-4" />} label="Delivered" value={totals.sent.toLocaleString()} />
        <StatTile icon={<XCircle className="h-4 w-4" />} label="Failed" value={totals.failed.toLocaleString()} />
        <StatTile icon={<FlaskConical className="h-4 w-4" />} label="Simulated" value={totals.simulated.toLocaleString()} />
      </div>

      {batches.length === 0 ? (
        <Empty icon={<Mail className="h-8 w-8" />} title="No sends logged yet" hint="Send a blast from the composer to populate the log." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH className="w-8" />
                <TH>When</TH>
                <TH>Subject</TH>
                <TH>Campaign</TH>
                <TH>Kind</TH>
                <TH className="text-right">Recipients</TH>
                <TH>Result</TH>
              </TR>
            </THead>
            <TBody>
              {batches.map((b) => {
                const isOpen = open.has(b.batchId);
                return (
                  <Fragment key={b.batchId}>
                    <TR className="cursor-pointer" onClick={() => toggle(b.batchId)}>
                      <TD><ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} /></TD>
                      <TD className="whitespace-nowrap text-muted-foreground" title={new Date(b.at).toLocaleString()}>{timeAgo(b.at)}</TD>
                      <TD className="max-w-xs"><div className="truncate font-medium">{b.subject}</div></TD>
                      <TD className="text-muted-foreground">{b.campaignName ?? "—"}</TD>
                      <TD><Badge variant="muted" className="capitalize">{b.kind}</Badge></TD>
                      <TD className="text-right tabular-nums">{b.entries.length}</TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {b.sent > 0 && <Badge variant="ok" className="text-[10px]">{b.sent} sent</Badge>}
                          {b.failed > 0 && <Badge variant="down" className="text-[10px]">{b.failed} failed</Badge>}
                          {b.simulated > 0 && <Badge variant="muted" className="text-[10px]">{b.simulated} sim</Badge>}
                        </div>
                      </TD>
                    </TR>
                    {isOpen && b.entries.map((e) => {
                      const S = STATUS[e.status];
                      return (
                        <TR key={e.id} className="bg-muted/30">
                          <TD />
                          <TD className="whitespace-nowrap text-[11px] text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</TD>
                          <TD colSpan={3} className="text-xs">{e.to}{e.error && <span className="ml-2 text-down">· {e.error}</span>}</TD>
                          <TD />
                          <TD><span className={`inline-flex items-center gap-1 text-xs ${S.cls}`}><S.icon className="h-3.5 w-3.5" />{e.status}</span></TD>
                        </TR>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
      <Notice msg={notice} />
    </div>
  );
}

function groupBatches(entries: SendLogEntry[]): Batch[] {
  const map = new Map<string, Batch>();
  for (const e of entries) {
    const key = e.batchId ?? e.id;
    let b = map.get(key);
    if (!b) {
      b = { batchId: key, subject: e.subject, at: e.at, campaignName: e.campaignName, kind: e.kind, entries: [], sent: 0, failed: 0, simulated: 0 };
      map.set(key, b);
    }
    b.entries.push(e);
    b.at = Math.max(b.at, e.at);
    if (e.status === "sent") b.sent++; else if (e.status === "failed") b.failed++; else b.simulated++;
  }
  return [...map.values()].sort((a, b) => b.at - a.at);
}
