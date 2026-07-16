/**
 * Orders & Fulfillment — area hub.
 *
 * A single nav entry that hosts the whole sales/fulfillment workflow as sub-tabs:
 *   Pipeline · Quote desk · Abandoned carts · Trends · Fulfillment · Refunds · Repeat buyers
 *
 * All sub-views read the STABLE Orders/Telemetry sheets (with a deterministic
 * seed fallback) and keep admin-side workflow state in a local overlay, so the
 * sheet stays the read-only source of truth.
 *
 * The integration step can wire either this hub (recommended, one nav entry) or
 * any individual sub-view — all are exported below.
 */
import { useState } from "react";
import {
  KanbanSquare,
  FileText,
  ShoppingCart,
  TrendingUp,
  KeyRound,
  LifeBuoy,
  Repeat,
  Link2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Modal } from "./parts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getOldWebBase, setOldWebBase, DEFAULT_OLD_WEB } from "./ordersData";

import { PipelineBoard } from "./PipelineBoard";
import { QuoteDesk } from "./QuoteDesk";
import { AbandonedCarts } from "./AbandonedCarts";
import { OrderTrends } from "./OrderTrends";
import { FulfillmentTracker } from "./FulfillmentTracker";
import { RefundLog } from "./RefundLog";
import { RepeatBuyers } from "./RepeatBuyers";

type TabKey =
  | "pipeline"
  | "quotes"
  | "abandoned"
  | "trends"
  | "fulfillment"
  | "refunds"
  | "repeat";

const TABS: { key: TabKey; label: string; icon: typeof KanbanSquare }[] = [
  { key: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { key: "quotes", label: "Quote desk", icon: FileText },
  { key: "abandoned", label: "Abandoned carts", icon: ShoppingCart },
  { key: "trends", label: "Trends", icon: TrendingUp },
  { key: "fulfillment", label: "Fulfillment", icon: KeyRound },
  { key: "refunds", label: "Refunds", icon: LifeBuoy },
  { key: "repeat", label: "Repeat buyers", icon: Repeat },
];

export function OrdersFulfillment({
  config,
  page,
  onPageChange,
}: {
  config: AppConfig;
  /** Controlled active tab (shell owns the sub-nav). Omit to run standalone. */
  page?: string;
  onPageChange?: (k: string) => void;
}) {
  const [internal, setInternal] = useState<TabKey>("pipeline");
  const controlled = page !== undefined;
  const tab = (controlled ? page : internal) as TabKey;
  const setTab = (k: TabKey) => (onPageChange ? onPageChange(k) : setInternal(k));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [oldWeb, setOldWeb] = useState(getOldWebBase());

  return (
    <div className="flex flex-col gap-4">
      {controlled ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} title="Old-web deep-link base URL">
            <Link2 /> Old-web link
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">Orders &amp; Fulfillment</h1>
              <p className="text-xs text-muted-foreground">
                Pipeline, quotes, recovery, fulfillment and repeat-buyer growth — all from the Orders sheet.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} title="Old-web deep-link base URL">
              <Link2 /> Old-web link
            </Button>
          </div>

          <div className="flex flex-wrap gap-1 border-b border-border">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div>
        {tab === "pipeline" && <PipelineBoard config={config} />}
        {tab === "quotes" && <QuoteDesk config={config} />}
        {tab === "abandoned" && <AbandonedCarts config={config} />}
        {tab === "trends" && <OrderTrends config={config} />}
        {tab === "fulfillment" && <FulfillmentTracker config={config} />}
        {tab === "refunds" && <RefundLog config={config} />}
        {tab === "repeat" && <RepeatBuyers config={config} />}
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Old-web deep-link base">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Base URL of the legacy store used to build order/product deep links (e.g. {DEFAULT_OLD_WEB}).
          </p>
          <Input value={oldWeb} onChange={(e) => setOldWeb(e.target.value)} placeholder={DEFAULT_OLD_WEB} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setOldWeb(DEFAULT_OLD_WEB); }}>
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setOldWebBase(oldWeb || DEFAULT_OLD_WEB);
                setSettingsOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export {
  PipelineBoard,
  QuoteDesk,
  AbandonedCarts,
  OrderTrends,
  FulfillmentTracker,
  RefundLog,
  RepeatBuyers,
};
export default OrdersFulfillment;
