/**
 * Approvals — the admin decision desk for incoming QUOTE / order REQUESTS.
 *
 * Lists the requests the SITE captured into the Orders sheet (tagged quote /
 * reseller / savings / callback / footer / popup / lead), grouped by customer +
 * product. For each, the admin sets/edits a quote PRICE and APPROVES or rejects.
 *
 * On APPROVE the flow (approvalFulfil.runApproval):
 *   1. creates the customer's DSM Exclusive Member account (POST to the
 *      ecommerce Apps Script),
 *   2. emails them the approved quote/price + member login code + welcome copy
 *      (STABLE Email API, degrades to clipboard/mailto in the browser),
 *   3. marks the request approved in the local decision overlay.
 *
 * Pending / approved / rejected states + live counts; a clean empty state when
 * the sheet has no request rows. REAL data only — never a fabricated request.
 */
import { useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Inbox,
  Check,
  X,
  ShieldCheck,
  Copy,
  Mail,
  KeyRound,
  Users,
  Loader2,
  RotateCcw,
  AlertTriangle,
  Building2,
  Phone,
  MapPin,
  Package,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { fmtMoney, timeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/Empty";
import {
  useApprovalsData,
  setDecision,
  resetDecision,
  issueMemberCreds,
  SOURCE_LABEL,
  type ApprovalItem,
  type DecisionState,
  type RequestSource,
} from "./approvalsData";
import { runApproval, sendApprovalEmail, composeApprovalEmail, copyToClipboard } from "./approvalFulfil";

/* ------------------------------------------------------------------ *
 * Tiny toast host (self-contained)
 * ------------------------------------------------------------------ */
type Tone = "ok" | "down" | "info";
interface Toast {
  id: number;
  msg: string;
  tone: Tone;
}
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (msg: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  };
  return { toasts, push };
}
function ToastHost({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto rounded-md border px-3 py-2 text-xs shadow-lg",
            t.tone === "ok" && "border-ok/30 bg-ok/15 text-ok",
            t.tone === "down" && "border-down/30 bg-down/15 text-down",
            t.tone === "info" && "border-border bg-card text-foreground",
          )}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Source badge tone
 * ------------------------------------------------------------------ */
const SOURCE_TONE: Record<RequestSource, string> = {
  reseller: "bg-violet-500/15 text-violet-500",
  quote: "bg-sky-500/15 text-sky-500",
  callback: "bg-amber-500/15 text-amber-500",
  savings: "bg-emerald-500/15 text-emerald-500",
  popup: "bg-pink-500/15 text-pink-500",
  footer: "bg-slate-500/15 text-slate-400",
  lead: "bg-slate-500/15 text-slate-400",
};

/* ------------------------------------------------------------------ *
 * Stat tile
 * ------------------------------------------------------------------ */
function StatTile({
  label,
  value,
  active,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors",
        active ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:bg-accent/50",
      )}
    >
      <span className={cn("text-[11px] font-medium uppercase tracking-wide", tone)}>{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Main view
 * ------------------------------------------------------------------ */
type Filter = "all" | DecisionState;

export function ApprovalsView({ config }: { config: AppConfig }) {
  const data = useApprovalsData(config);
  const { toasts, push } = useToasts();
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.items.filter((it) => {
      if (filter !== "all" && it.decision.state !== filter) return false;
      if (!t) return true;
      return [it.customerName, it.email, it.productName, it.company, it.details, it.decision.memberCode]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t));
    });
  }, [data.items, filter, q]);

  const { stats } = data;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" /> Approvals
          </h1>
          <p className="max-w-2xl text-xs text-muted-foreground">
            Incoming quote &amp; order requests captured by the site. Set a price, approve to create the
            customer&apos;s DSM Exclusive Member account and email their quote + login, or reject.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search requests…"
              className="w-56 pl-8"
            />
          </div>
          <Button variant="outline" size="sm" onClick={data.reload} disabled={data.loading}>
            <RefreshCw className={data.loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stat / filter tiles */}
      <div className="flex flex-wrap gap-2">
        <StatTile label="All" value={stats.total} tone="text-muted-foreground" active={filter === "all"} onClick={() => setFilter("all")} />
        <StatTile label="Pending" value={stats.pending} tone="text-amber-500" active={filter === "pending"} onClick={() => setFilter("pending")} />
        <StatTile label="Auto-approved" value={stats.auto_approved} tone="text-sky-500" active={filter === "auto_approved"} onClick={() => setFilter("auto_approved")} />
        <StatTile label="Approved" value={stats.approved} tone="text-emerald-500" active={filter === "approved"} onClick={() => setFilter("approved")} />
        <StatTile label="Rejected" value={stats.rejected} tone="text-rose-500" active={filter === "rejected"} onClick={() => setFilter("rejected")} />
      </div>

      {/* Body */}
      {data.error ? (
        <Empty
          icon={<AlertTriangle className="h-8 w-8" />}
          title="Couldn't read the Orders sheet"
          hint={`${data.error}. The queue will fill in automatically once the sheet is shared and requests come in.`}
        />
      ) : data.loading && data.items.length === 0 ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
        </div>
      ) : data.isEmpty ? (
        <Empty
          icon={<Inbox className="h-8 w-8" />}
          title="No approval requests yet"
          hint="When visitors submit a quote, reseller, savings or callback request on the site, it lands here for you to price and approve."
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<Inbox className="h-8 w-8" />}
          title={`No ${filter === "all" ? "" : filter} requests match`}
          hint="Try a different filter or clear the search."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((it) => (
            <RequestCard key={it.id} item={it} config={config} push={push} />
          ))}
        </div>
      )}

      <ToastHost toasts={toasts} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One request card — pricing + approve/reject + fulfilment status
 * ------------------------------------------------------------------ */
function RequestCard({
  item,
  config,
  push,
}: {
  item: ApprovalItem;
  config: AppConfig;
  push: (msg: string, tone?: Tone) => void;
}) {
  const d = item.decision;
  const isPending = d.state === "pending";
  const isApproved = d.state === "approved";
  const isRejected = d.state === "rejected";
  const isAuto = d.state === "auto_approved";

  // Default price: admin's set price → the request's carried price → blank.
  const [price, setPrice] = useState<string>(
    d.quotedPrice != null ? String(d.quotedPrice) : item.requestedPrice > 0 ? String(item.requestedPrice) : "",
  );
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState(d.rejectReason ?? "");

  const currency = d.currency ?? item.currency;

  const approve = async () => {
    const p = parseFloat(price.replace(/[^0-9.]/g, ""));
    const quotePrice = Number.isFinite(p) ? p : 0;
    setBusy(true);
    // Preserve any credentials already issued on a prior attempt (idempotent retry).
    const creds =
      d.memberCode && d.memberPassword && d.loginUrl
        ? { memberCode: d.memberCode, memberPassword: d.memberPassword, loginUrl: d.loginUrl }
        : issueMemberCreds(item.email);
    try {
      const outcome = await runApproval(config, item, { price: quotePrice, currency }, creds);
      setDecision(item.id, {
        state: "approved",
        quotedPrice: quotePrice,
        currency,
        memberCode: creds.memberCode,
        memberPassword: creds.memberPassword,
        loginUrl: creds.loginUrl,
        approvedAt: Date.now(),
        accountCreated: outcome.account.ok,
        emailSent: outcome.email.ok,
      });
      if (outcome.ok) {
        push(`Approved — member ${creds.memberCode} created and emailed ${item.email || "the customer"}.`, "ok");
      } else {
        const bits: string[] = [];
        bits.push(outcome.account.ok ? "account created" : `account: ${outcome.account.detail}`);
        bits.push(outcome.email.ok ? `email ${outcome.email.via}` : `email: ${outcome.email.detail}`);
        push(`Approved with issues — ${bits.join("; ")}.`, "down");
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Approve failed.", "down");
    } finally {
      setBusy(false);
    }
  };

  const confirmReject = () => {
    setDecision(item.id, { state: "rejected", rejectedAt: Date.now(), rejectReason: reason.trim() });
    setRejecting(false);
    push("Request rejected.", "info");
  };

  const reopen = () => {
    resetDecision(item.id);
    push("Request reopened.", "info");
  };

  const resendEmail = async () => {
    if (!d.memberCode || !d.memberPassword || !d.loginUrl) return;
    setBusy(true);
    const draft = composeApprovalEmail(
      item,
      { price: d.quotedPrice ?? 0, currency },
      { memberCode: d.memberCode, memberPassword: d.memberPassword, loginUrl: d.loginUrl },
    );
    const res = await sendApprovalEmail(config, draft);
    setDecision(item.id, { emailSent: res.ok });
    push(res.ok ? `Welcome email re-sent (${res.via}).` : `Email failed: ${res.detail}`, res.ok ? "ok" : "down");
    setBusy(false);
  };

  const copyCreds = async () => {
    if (!d.memberCode) return;
    const text = [
      `DSM Exclusive Member credentials for ${item.customerName || item.email}`,
      `Member code : ${d.memberCode}`,
      `Password    : ${d.memberPassword}`,
      `Login       : ${d.loginUrl}`,
      `Approved price: ${d.quotedPrice != null ? fmtMoney(d.quotedPrice, currency) : "—"}`,
    ].join("\n");
    const ok = await copyToClipboard(text);
    push(ok ? "Credentials copied." : "Copy failed.", ok ? "ok" : "down");
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4",
        isApproved && "border-emerald-500/30",
        isAuto && "border-sky-500/30",
        isRejected && "border-rose-500/30 opacity-80",
        isPending && "border-border",
      )}
    >
      {/* Row 1 — identity + state */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.customerName || item.email || "Unknown customer"}</span>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", SOURCE_TONE[item.source])}>
              {SOURCE_LABEL[item.source]}
            </span>
            {item.captures > 1 && (
              <Badge variant="muted" title="Submitted more than once">
                ×{item.captures}
              </Badge>
            )}
            {isApproved && (
              <Badge variant="ok" className="gap-1">
                <Check className="h-3 w-3" /> Approved
              </Badge>
            )}
            {isRejected && (
              <Badge variant="down" className="gap-1">
                <X className="h-3 w-3" /> Rejected
              </Badge>
            )}
            {isAuto && (
              <Badge className="gap-1 border-sky-500/40 bg-sky-500/10 text-sky-500" title="Quote + email sent automatically while the VPS was down">
                <Check className="h-3 w-3" /> Auto-approved
              </Badge>
            )}
            {isPending && (
              <Badge variant="warn" className="gap-1">
                Pending
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {item.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{item.email}</span>}
            {item.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>}
            {item.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{item.company}</span>}
            {item.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right text-[11px] text-muted-foreground" title={item.capturedAt}>
          {item.capturedAt ? timeAgo(item.capturedAt) : "—"}
        </div>
      </div>

      {/* Row 2 — product + requested details */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{item.productName}</span>
            {item.sku && <span className="text-[11px] text-muted-foreground">({item.sku})</span>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            {item.quantity > 1 && <span>Qty: {item.quantity}</span>}
            {item.seats != null && <span>Seats: {item.seats}</span>}
            {item.budget != null && <span>Budget: {fmtMoney(item.budget, currency)}</span>}
            {item.requestedPrice > 0 && <span>List/ask: {fmtMoney(item.requestedPrice, currency)}</span>}
          </div>
          {item.details && (
            <p className="mt-1.5 rounded bg-muted/50 px-2 py-1.5 text-xs text-foreground/80">
              &ldquo;{item.details}&rdquo;
            </p>
          )}
        </div>

        {/* Actions column */}
        {isPending && !rejecting && (
          <div className="flex flex-col items-stretch gap-2 sm:w-56">
            <label className="text-[11px] font-medium text-muted-foreground">Quote price ({currency})</label>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="h-8"
                disabled={busy}
              />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="flex-1" onClick={approve} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
                <X /> Reject
              </Button>
            </div>
          </div>
        )}

        {isPending && rejecting && (
          <div className="flex flex-col items-stretch gap-2 sm:w-56">
            <label className="text-[11px] font-medium text-muted-foreground">Reason (optional)</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why reject?"
              className="h-8"
              autoFocus
            />
            <div className="flex gap-1.5">
              <Button size="sm" variant="destructive" className="flex-1" onClick={confirmReject}>
                <X /> Confirm reject
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Row 3 — outcome panel */}
      {isApproved && (
        <div className="mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
              <Users className="h-3.5 w-3.5" /> DSM Exclusive Member
            </div>
            <div className="text-xs">
              Approved price:{" "}
              <span className="font-semibold tabular-nums">
                {d.quotedPrice != null ? fmtMoney(d.quotedPrice, currency) : "—"}
              </span>
            </div>
          </div>
          <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <KeyRound className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono">{d.memberCode}</span>
              <span className="text-muted-foreground">/ {d.memberPassword}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn("inline-flex items-center gap-1", d.accountCreated ? "text-emerald-500" : "text-amber-500")}>
                {d.accountCreated ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                Account
              </span>
              <span className={cn("inline-flex items-center gap-1", d.emailSent ? "text-emerald-500" : "text-amber-500")}>
                {d.emailSent ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                Welcome email
              </span>
            </div>
          </div>
          {d.loginUrl && (
            <a
              href={d.loginUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 block truncate text-[11px] text-primary hover:underline"
              title={d.loginUrl}
            >
              {d.loginUrl}
            </a>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={copyCreds}>
              <Copy /> Copy credentials
            </Button>
            <Button size="sm" variant="outline" onClick={resendEmail} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Mail />} Re-send email
            </Button>
            <Button size="sm" variant="ghost" onClick={reopen} disabled={busy}>
              <RotateCcw /> Reopen
            </Button>
          </div>
        </div>
      )}

      {isRejected && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-rose-500/25 bg-rose-500/5 px-3 py-2 text-xs">
          <span className="text-rose-400">
            Rejected{d.rejectReason ? ` — ${d.rejectReason}` : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={reopen}>
            <RotateCcw /> Reopen
          </Button>
        </div>
      )}
    </div>
  );
}

export default ApprovalsView;
