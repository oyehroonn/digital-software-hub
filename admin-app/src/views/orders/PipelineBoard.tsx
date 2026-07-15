/**
 * Sales PIPELINE board — new → contacted → quoted → won / lost.
 * Cards are dragged between columns (native HTML5 DnD); the stage is persisted
 * to the local overlay (the Orders sheet stays read-only). Each card exposes a
 * one-click quote and OLD-WEB deep links.
 */
import { useMemo, useState } from "react";
import { RefreshCw, ExternalLink, Copy, Mail, GripVertical } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { Order } from "@/lib/ecommerce";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/utils";
import { SectionHeader, SeedBadge, ToastHost, useToasts } from "./parts";
import { QuoteComposer } from "./QuoteComposer";
import { copyToClipboard } from "./orderEmail";
import {
  STAGES,
  type Stage,
  orderKey,
  orderValue,
  orderCurrency,
  customerLabel,
  stageOf,
  patchOverlay,
  useOverlay,
  useOrdersData,
  orderDeepLink,
  productDeepLink,
} from "./ordersData";

const TONE: Record<string, string> = {
  sky: "border-sky-500/40",
  violet: "border-violet-500/40",
  amber: "border-amber-500/40",
  emerald: "border-emerald-500/40",
  rose: "border-rose-500/40",
};

export function PipelineBoard({ config }: { config: AppConfig }) {
  const { orders, loading, seed, reload } = useOrdersData(config);
  const overlay = useOverlay();
  const { toasts, push } = useToasts();
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [quoteFor, setQuoteFor] = useState<Order | null>(null);

  const columns = useMemo(() => {
    const map: Record<Stage, Order[]> = { new: [], contacted: [], quoted: [], won: [], lost: [] };
    for (const o of orders) map[stageOf(o, overlay)].push(o);
    return map;
  }, [orders, overlay]);

  const moveTo = (o: Order, stage: Stage) => {
    const patch: Record<string, number | Stage> = { stage };
    if (stage === "contacted") patch.contactedAt = Date.now();
    if (stage === "quoted") patch.quotedAt = Date.now();
    patchOverlay(orderKey(o), patch);
    push(`Moved ${customerLabel(o)} → ${STAGES.find((s) => s.key === stage)?.label}`, "ok");
  };

  const findByKey = (k: string) => orders.find((o) => orderKey(o) === k) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Sales pipeline"
        subtitle="Drag deals across stages. Stage changes are saved locally; the Orders sheet stays the source of truth."
        right={
          <>
            <SeedBadge show={seed} />
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {STAGES.map((col) => {
          const items = columns[col.key];
          const total = items.reduce((s, o) => s + orderValue(o), 0);
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(col.key);
              }}
              onDragLeave={() => setOverStage((s) => (s === col.key ? null : s))}
              onDrop={() => {
                if (dragKey) {
                  const o = findByKey(dragKey);
                  if (o) moveTo(o, col.key);
                }
                setDragKey(null);
                setOverStage(null);
              }}
              className={cn(
                "flex min-h-[140px] flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
                TONE[col.tone],
                overStage === col.key && "bg-accent/60 ring-1 ring-ring",
              )}
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-xs font-semibold">{col.label}</div>
                <div className="text-[11px] tabular-nums text-muted-foreground">
                  {items.length} · {fmtMoney(total, items[0] ? orderCurrency(items[0]) : "USD")}
                </div>
              </div>
              {items.map((o) => (
                <DealCard
                  key={orderKey(o)}
                  order={o}
                  dragging={dragKey === orderKey(o)}
                  onDragStart={() => setDragKey(orderKey(o))}
                  onDragEnd={() => setDragKey(null)}
                  onQuote={() => setQuoteFor(o)}
                  onCopyLink={async () => {
                    const ok = await copyToClipboard(orderDeepLink(o));
                    push(ok ? "Old-web order link copied." : "Copy failed.", ok ? "ok" : "down");
                  }}
                  onMoveNext={(next) => moveTo(o, next)}
                />
              ))}
              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-border/60 px-2 py-6 text-center text-[11px] text-muted-foreground">
                  Drop deals here
                </div>
              )}
            </div>
          );
        })}
      </div>

      <QuoteComposer
        config={config}
        order={quoteFor}
        open={quoteFor != null}
        onClose={() => setQuoteFor(null)}
        onSent={(msg, ok) => push(msg, ok ? "ok" : "down")}
      />
      <ToastHost toasts={toasts} />
    </div>
  );
}

function DealCard({
  order,
  dragging,
  onDragStart,
  onDragEnd,
  onQuote,
  onCopyLink,
  onMoveNext,
}: {
  order: Order;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onQuote: () => void;
  onCopyLink: () => void;
  onMoveNext: (s: Stage) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group cursor-grab rounded-md border border-border bg-card p-2 shadow-sm active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{customerLabel(order)}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {order.productName ?? order.sku ?? "—"}
          </div>
          <div className="mt-1 text-xs font-semibold tabular-nums">
            {fmtMoney(orderValue(order), orderCurrency(order))}
            <span className="ml-1 font-normal text-muted-foreground">×{order.quantity ?? 1}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <IconBtn title="Send quote" onClick={onQuote}>
          <Mail className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          title="Open order in old web"
          onClick={() => window.open(orderDeepLink(order), "_blank")}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn title="Copy old-web link" onClick={onCopyLink}>
          <Copy className="h-3.5 w-3.5" />
        </IconBtn>
        <IconBtn
          title="Open product page"
          onClick={() => window.open(productDeepLink(order), "_blank")}
        >
          <span className="text-[10px] font-semibold">P</span>
        </IconBtn>
        <select
          className="ml-auto rounded border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground"
          value=""
          onChange={(e) => e.target.value && onMoveNext(e.target.value as Stage)}
          title="Move to stage"
        >
          <option value="">Move…</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="inline-flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}
