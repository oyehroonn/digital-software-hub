/**
 * REFUND / issue log. A lightweight case tracker for refund requests and order
 * problems, stored locally and keyed to an order. Log an issue against any order,
 * track status (open → refunded / resolved / rejected), and notify the customer.
 */
import { useMemo, useState } from "react";
import { LifeBuoy, Plus, Trash2, Send } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { fmtMoney } from "@/lib/utils";
import { SectionHeader, Stat, Modal, ToastHost, useToasts, fmtDate } from "./parts";
import {
  useOrdersData,
  useRefunds,
  addRefund,
  updateRefund,
  removeRefund,
  orderKey,
  orderValue,
  orderCurrency,
  customerLabel,
  type RefundStatus,
} from "./ordersData";
import { sendDraft } from "./orderEmail";

const STATUS_TONE: Record<RefundStatus, "muted" | "warn" | "ok" | "down"> = {
  open: "warn",
  refunded: "ok",
  resolved: "ok",
  rejected: "down",
};
const STATUSES: RefundStatus[] = ["open", "refunded", "resolved", "rejected"];

export function RefundLog({ config }: { config: AppConfig }) {
  const { orders } = useOrdersData(config);
  const refunds = useRefunds();
  const { toasts, push } = useToasts();
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<string>("");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  const open = refunds.filter((r) => r.status === "open");
  const refundedTotal = refunds
    .filter((r) => r.status === "refunded")
    .reduce((s, r) => s + (r.amount ?? 0), 0);

  const orderOptions = useMemo(
    () =>
      orders.map((o) => ({
        key: orderKey(o),
        label: `${customerLabel(o)} · ${o.productName ?? o.sku ?? "—"} · ${fmtMoney(
          orderValue(o),
          orderCurrency(o),
        )}`,
        order: o,
      })),
    [orders],
  );

  const submit = () => {
    const opt = orderOptions.find((o) => o.key === sel);
    if (!opt || !reason.trim()) {
      push("Pick an order and enter a reason.", "down");
      return;
    }
    const o = opt.order;
    addRefund({
      orderKey: opt.key,
      customer: customerLabel(o),
      email: o.email,
      product: o.productName ?? o.sku,
      amount: amount ? parseFloat(amount) : orderValue(o),
      currency: orderCurrency(o),
      reason: reason.trim(),
      status: "open",
    });
    push("Issue logged.", "ok");
    setAdding(false);
    setReason("");
    setAmount("");
    setSel("");
  };

  const notify = async (r: (typeof refunds)[number]) => {
    if (!r.email) {
      push("No email on this case.", "down");
      return;
    }
    const body = [
      `Hi ${r.customer.split(" ")[0]},`,
      "",
      `Thanks for reaching out about your ${r.product ?? "order"}. We've logged your request:`,
      "",
      `  Issue : ${r.reason}`,
      r.status === "refunded" && r.amount
        ? `  Refund: ${fmtMoney(r.amount, r.currency || "AUD")} is on its way (3–5 business days).`
        : "  Status: our team is on it and will follow up shortly.",
      "",
      "We're sorry for the trouble and appreciate your patience.",
      "",
      "Warm regards,\nThe DSM Solutions Team",
    ]
      .filter(Boolean)
      .join("\n");
    const res = await sendDraft(config, {
      to: r.email,
      subject: `Update on your ${r.product ?? "DSM"} request`,
      body,
    });
    push(res.detail, res.ok ? "ok" : "down");
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Refunds & issues"
        subtitle="Track refund requests and order problems to resolution, and keep customers updated."
        right={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Log issue
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat label="Open cases" value={String(open.length)} />
        <Stat label="Total cases" value={String(refunds.length)} />
        <Stat label="Refunded" value={fmtMoney(refundedTotal, refunds[0]?.currency || "AUD")} />
      </div>

      {refunds.length === 0 ? (
        <Empty icon={<LifeBuoy className="h-8 w-8" />} title="No refunds or issues logged" hint="Log one against any order to start tracking." />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <THead>
              <TR>
                <TH>Logged</TH>
                <TH>Customer</TH>
                <TH>Product</TH>
                <TH>Reason</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {refunds.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-muted-foreground">{fmtDate(r.createdAt)}</TD>
                  <TD>
                    <div className="font-medium">{r.customer}</div>
                    <div className="text-[11px] text-muted-foreground">{r.email ?? ""}</div>
                  </TD>
                  <TD className="max-w-[160px] truncate">{r.product ?? "—"}</TD>
                  <TD className="max-w-[240px]">
                    <div className="truncate" title={r.reason}>
                      {r.reason}
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {r.amount != null ? fmtMoney(r.amount, r.currency || "AUD") : "—"}
                  </TD>
                  <TD>
                    <select
                      value={r.status}
                      onChange={(e) => updateRefund(r.id, { status: e.target.value as RefundStatus })}
                      className="rounded border border-border bg-background px-1.5 py-1 text-xs"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <span className="ml-2 align-middle">
                      <Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </span>
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => notify(r)} disabled={!r.email}>
                        <Send /> Notify
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Delete case"
                        onClick={() => removeRefund(r.id)}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Log a refund / issue">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Order</span>
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select an order…</option>
              {orderOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Reason / issue</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate charge, wrong edition…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Amount (optional)</span>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Defaults to order value" inputMode="decimal" />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit}>
              Log issue
            </Button>
          </div>
        </div>
      </Modal>
      <ToastHost toasts={toasts} />
    </div>
  );
}
