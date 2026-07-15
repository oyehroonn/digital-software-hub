/**
 * DrillDownProvider + slide-over host.
 *
 * Wrap the analytics reports area in this once; it fetches the shared Telemetry
 * + Orders dataset (deterministic-seed fallback) and exposes the drill-down API
 * through context. Any <DrillLink> then opens a right-hand slide-over rendering
 * the matching detail lens (ProductAnalytics / PageAnalytics / CustomerAnalytics
 * / CampaignAnalytics). Detail views can themselves contain <DrillLink>s, which
 * push onto a history stack so you can drill product → buyer → their campaign
 * and step back out. Esc / backdrop / close button all dismiss it.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X, Package, FileText, User, Megaphone, RefreshCw, Database } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAnalyticsData } from "../useAnalyticsData";
import {
  DrillDownContext,
  targetKey,
  targetTitle,
  type DrillDownApi,
  type DrillTarget,
} from "./drillContext";
import { ProductAnalytics } from "./ProductDetail";
import { PageAnalytics } from "./PageDetail";
import { CustomerAnalytics } from "./CustomerDetail";
import { CampaignAnalytics } from "./CampaignDetail";

const KIND_META: Record<DrillTarget["kind"], { icon: typeof Package; label: string }> = {
  product: { icon: Package, label: "Product" },
  page: { icon: FileText, label: "Page" },
  customer: { icon: User, label: "Customer" },
  campaign: { icon: Megaphone, label: "Campaign" },
};

export function DrillDownProvider({ config, children }: { config: AppConfig; children: ReactNode }) {
  const { events, orders, seeded, loading, refresh } = useAnalyticsData(config);
  const [stack, setStack] = useState<DrillTarget[]>([]);

  const open = useCallback((t: DrillTarget) => {
    setStack((prev) => {
      // Avoid pushing an identical consecutive target.
      if (prev.length && targetKey(prev[prev.length - 1]) === targetKey(t)) return prev;
      return [...prev, t];
    });
  }, []);
  const replace = useCallback((t: DrillTarget) => {
    setStack((prev) => (prev.length ? [...prev.slice(0, -1), t] : [t]));
  }, []);
  const back = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);

  const isOpen = stack.length > 0;

  const api = useMemo<DrillDownApi>(
    () => ({
      enabled: true,
      open,
      replace,
      back,
      close,
      stack,
      isOpen,
      events,
      orders,
      config,
      seeded,
      loading,
      refresh,
    }),
    [open, replace, back, close, stack, isOpen, events, orders, config, seeded, loading, refresh],
  );

  return (
    <DrillDownContext.Provider value={api}>
      {children}
      <SlideOver api={api} />
    </DrillDownContext.Provider>
  );
}

function renderTarget(t: DrillTarget, api: DrillDownApi): ReactNode {
  const shared = { events: api.events, orders: api.orders, config: api.config as AppConfig, seeded: api.seeded };
  switch (t.kind) {
    case "product":
      return <ProductAnalytics productId={t.id} name={t.name} {...shared} />;
    case "page":
      return <PageAnalytics url={t.url} title={t.title} {...shared} />;
    case "customer":
      return <CustomerAnalytics email={t.email} name={t.name} {...shared} />;
    case "campaign":
      return <CampaignAnalytics source={t.source} medium={t.medium} campaign={t.campaign} label={t.label} {...shared} />;
  }
}

function SlideOver({ api }: { api: DrillDownApi }) {
  const { stack, isOpen, back, close, seeded, loading, refresh } = api;
  const top = stack[stack.length - 1];

  // Slide-in animation: mount, then flip `shown` on the next frame.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (isOpen) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
  }, [isOpen]);

  // Esc closes; lock body scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (stack.length > 1 ? back : close)();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, stack.length, back, close]);

  if (!isOpen || !top) return null;

  const meta = KIND_META[top.kind];
  const Icon = meta.icon;

  const panel = (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`${meta.label} details`}>
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-opacity duration-200",
          shown ? "opacity-100" : "opacity-0",
        )}
        onClick={close}
      />
      {/* Panel */}
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-[880px] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300 ease-out",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur">
          {stack.length > 1 && (
            <button
              onClick={back}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</span>
              {seeded && (
                <Badge variant="warn" className="gap-1 text-[10px]">
                  <Database className="h-3 w-3" /> seed
                </Badge>
              )}
            </div>
            <h2 className="truncate text-base font-semibold text-foreground" title={targetTitle(top)}>
              {targetTitle(top)}
            </h2>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Breadcrumb (when nested) */}
        {stack.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border/60 bg-card/40 px-4 py-1.5 text-[11px] text-muted-foreground">
            {stack.map((t, i) => {
              const M = KIND_META[t.kind];
              const isLast = i === stack.length - 1;
              return (
                <span key={targetKey(t) + i} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground/50">/</span>}
                  <M.icon className="h-3 w-3" />
                  <span className={cn("max-w-[180px] truncate", isLast && "font-semibold text-foreground")}>{targetTitle(t)}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* Body — remount per target so hooks/derivations reset cleanly */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div key={targetKey(top)}>{renderTarget(top, api)}</div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
