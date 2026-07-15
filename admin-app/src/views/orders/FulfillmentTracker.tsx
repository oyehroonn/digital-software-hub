/**
 * FULFILLMENT / license-delivered tracker.
 *
 * Every won/paid order needs a license delivered. This tracks delivery state
 * (delivered flag + license key + timestamp) in the local overlay and can email
 * the license to the customer via the Email API. Undelivered paid orders are
 * surfaced first so nothing slips.
 */
import { useMemo, useState } from "react";
import { RefreshCw, KeyRound, Send, CheckCircle2, Clock } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Empty } from "@/components/Empty";
import { SectionHeader, SeedBadge, Stat, ToastHost, useToasts, fmtDate } from "./parts";
import {
  useOrdersData,
  useOverlay,
  orderKey,
  patchOverlay,
  stageOf,
  customerLabel,
} from "./ordersData";
import { sendDraft } from "./orderEmail";

function isDeliverable(o: Order, stage: string): boolean {
  const s = `${o.status ?? ""}`.toLowerCase();
  return stage === "won" || /paid|complete|fulfilled|won|delivered/.test(s);
}

export function FulfillmentTracker({ config }: { config: AppConfig }) {
  const { orders, loading, seed, reload } = useOrdersData(config);
  const overlay = useOverlay();
  const { toasts, push } = useToasts();
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const rows = useMemo(
    () => orders.filter((o) => isDeliverable(o, stageOf(o, overlay))),
    [orders, overlay],
  );
  const delivered = rows.filter((o) => overlay[orderKey(o)]?.delivered);
  const pending = rows.filter((o) => !overlay[orderKey(o)]?.delivered);

  const markDelivered = (o: Order) => {
    const k = orderKey(o);
    patchOverlay(k, {
      delivered: true,
      deliveredAt: Date.now(),
      licenseKey: keyDraft[k] || overlay[k]?.licenseKey || "",
    });
    push(`Marked delivered for ${customerLabel(o)}.`, "ok");
  };

  const sendLicense = async (o: Order) => {
    const k = orderKey(o);
    const license = keyDraft[k] || overlay[k]?.licenseKey || "";
    if (!o.email) {
      push("No email on this order.", "down");
      return;
    }
    setSending(k);
    try {
      const first = (o.customerName || "there").split(" ")[0];
      const body = [
        `Hi ${first},`,
        "",
        `Your ${o.productName ?? "DSM"} license is ready. Here are your activation details:`,
        "",
        `  Product : ${o.productName ?? o.sku ?? "—"}`,
        `  License : ${license || "(see attached / contact support)"}`,
        "",
        "Activate inside the app under Help → Activate License. Reply here if you need a hand — we're happy to jump on a quick call.",
        "",
        "Warm regards,\nThe DSM Solutions Team",
      ].join("\n");
      const res = await sendDraft(config, {
        to: o.email,
        subject: `Your ${o.productName ?? "DSM"} license & activation details`,
        body,
      });
      if (res.ok) patchOverlay(k, { delivered: true, deliveredAt: Date.now(), licenseKey: license });
      push(res.detail, res.ok ? "ok" : "down");
    } finally {
      setSending(null);
    }
  };

  const render = (list: Order[], done: boolean) => (
    <div className="rounded-lg border border-border">
      <Table>
        <THead>
          <TR>
            <TH>Customer</TH>
            <TH>Product</TH>
            <TH>License key</TH>
            <TH>Status</TH>
            <TH className="text-right">Action</TH>
          </TR>
        </THead>
        <TBody>
          {list.map((o) => {
            const k = orderKey(o);
            const ov = overlay[k] ?? {};
            return (
              <TR key={k}>
                <TD>
                  <div className="font-medium">{customerLabel(o)}</div>
                  <div className="text-[11px] text-muted-foreground">{o.email ?? ""}</div>
                </TD>
                <TD className="max-w-[200px] truncate">{o.productName ?? o.sku ?? "—"}</TD>
                <TD>
                  {done ? (
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                      {ov.licenseKey || "—"}
                    </code>
                  ) : (
                    <Input
                      value={keyDraft[k] ?? ov.licenseKey ?? ""}
                      onChange={(e) => setKeyDraft((d) => ({ ...d, [k]: e.target.value }))}
                      placeholder="License / activation key"
                      className="h-8 w-44 text-xs"
                    />
                  )}
                </TD>
                <TD>
                  {done ? (
                    <Badge variant="ok" title={ov.deliveredAt ? fmtDate(ov.deliveredAt) : undefined}>
                      Delivered {ov.deliveredAt ? `· ${fmtDate(ov.deliveredAt)}` : ""}
                    </Badge>
                  ) : (
                    <Badge variant="warn">Awaiting delivery</Badge>
                  )}
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {!done && (
                      <Button size="sm" variant="outline" onClick={() => markDelivered(o)}>
                        <CheckCircle2 /> Mark done
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => sendLicense(o)}
                      disabled={!o.email || sending === k}
                    >
                      <Send /> {sending === k ? "Sending…" : done ? "Resend" : "Deliver"}
                    </Button>
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Fulfillment & license delivery"
        subtitle="Track which paid orders have had their license delivered — and deliver them in one click."
        right={
          <>
            <SeedBadge show={seed} />
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Stat label="Paid / won" value={String(rows.length)} />
        <Stat label="Awaiting delivery" value={String(pending.length)} />
        <Stat label="Delivered" value={String(delivered.length)} />
      </div>

      <div className="flex items-center gap-2 text-sm font-medium">
        <Clock className="h-4 w-4 text-warn" /> Awaiting delivery
      </div>
      {pending.length === 0 ? (
        <Empty icon={<KeyRound className="h-8 w-8" />} title="Nothing awaiting delivery" hint="Every paid order has its license out." />
      ) : (
        render(pending, false)
      )}

      {delivered.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4 text-ok" /> Delivered
          </div>
          {render(delivered, true)}
        </>
      )}
      <ToastHost toasts={toasts} />
    </div>
  );
}
