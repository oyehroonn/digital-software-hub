/**
 * PRODUCT & CATALOG area — a single tab that hosts every catalog tool behind an
 * internal sub-nav. The catalog and the telemetry/orders join are each loaded
 * ONCE here and passed down, so switching tools is instant and edits made in one
 * tool (optimistic local state) are visible in the others.
 *
 * Every sub-view is also independently mountable (each self-loads when its data
 * props are omitted), so the app-level integration step can wire any single tool
 * into the nav directly if preferred.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  Boxes,
  Copy,
  FileSpreadsheet,
  Flame,
  Pencil,
  Search,
  Tag,
  Wand2,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import type { ProductEdit } from "@/lib/products";
import type { Order, TelemetryEvent } from "@/lib/ecommerce";
import { loadCatalog, loadPerformance, type CatProduct } from "./catalogData";
import { CatalogEditor } from "./CatalogEditor";
import { BulkUpdate } from "./BulkUpdate";
import { StockAlerts } from "./StockAlerts";
import { PricingAuditor } from "./PricingAuditor";
import { ModelCoverage } from "./ModelCoverage";
import { PerformanceScore } from "./PerformanceScore";
import { Trending } from "./Trending";
import { DuplicateCleanup } from "./DuplicateCleanup";
import { SeoEditor } from "./SeoEditor";
import { BundleBuilder } from "./BundleBuilder";

type ToolKey =
  | "editor"
  | "bulk"
  | "stock"
  | "pricing"
  | "coverage"
  | "performance"
  | "trending"
  | "duplicates"
  | "seo"
  | "bundles";

const TOOLS: { key: ToolKey; label: string; icon: React.ReactNode }[] = [
  { key: "editor", label: "Editor", icon: <Pencil className="h-3.5 w-3.5" /> },
  { key: "bulk", label: "Bulk & import", icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
  { key: "stock", label: "Stock alerts", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: "pricing", label: "Pricing audit", icon: <Tag className="h-3.5 w-3.5" /> },
  { key: "coverage", label: "3D coverage", icon: <Boxes className="h-3.5 w-3.5" /> },
  { key: "performance", label: "Performance", icon: <Award className="h-3.5 w-3.5" /> },
  { key: "trending", label: "Trending", icon: <Flame className="h-3.5 w-3.5" /> },
  { key: "duplicates", label: "Duplicates", icon: <Copy className="h-3.5 w-3.5" /> },
  { key: "seo", label: "SEO", icon: <Search className="h-3.5 w-3.5" /> },
  { key: "bundles", label: "Bundles", icon: <Wand2 className="h-3.5 w-3.5" /> },
];

export function CatalogView({
  config,
  vpsUp = false,
  page,
  onPageChange,
}: {
  config: AppConfig;
  vpsUp?: boolean;
  /** Controlled active tool (shell owns the sub-nav). Omit to run standalone. */
  page?: string;
  onPageChange?: (k: string) => void;
}) {
  const [internal, setInternal] = useState<ToolKey>("editor");
  const controlled = page !== undefined;
  const tool = (controlled ? page : internal) as ToolKey;
  const setTool = (k: ToolKey) => (onPageChange ? onPageChange(k) : setInternal(k));

  // Shared catalog (loaded once).
  const [products, setProducts] = useState<CatProduct[]>([]);
  const [seeded, setSeeded] = useState(false);

  // Shared telemetry+orders (loaded once, for performance/trending/pricing/bundles).
  const [events, setEvents] = useState<TelemetryEvent[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [perfSeeded, setPerfSeeded] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const [cat, perf] = await Promise.all([loadCatalog(config), loadPerformance(config)]);
    setProducts(cat.products);
    setSeeded(cat.seeded);
    setEvents(perf.events);
    setOrders(perf.orders);
    setPerfSeeded(perf.seeded);
    setReady(true);
  }, [config]);

  useEffect(() => {
    load();
  }, [load]);

  // Reflect an optimistic edit from any child into the shared catalog.
  const onLocalEdit = useCallback((id: CatProduct["id"], changes: ProductEdit) => {
    setProducts((ps) => ps.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  const shared = useMemo(
    () => ({ config, vpsUp, products, seeded, onLocalEdit }),
    [config, vpsUp, products, seeded, onLocalEdit],
  );

  return (
    <div className="flex flex-col gap-4">
      {!controlled && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 text-sm">
          {TOOLS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTool(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                tool === t.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!ready ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading catalog…</div>
      ) : (
        <>
          {tool === "editor" && <CatalogEditor {...shared} />}
          {tool === "bulk" && (
            <BulkUpdate config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "stock" && (
            <StockAlerts config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "pricing" && (
            <PricingAuditor config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "coverage" && (
            <ModelCoverage config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "performance" && (
            <PerformanceScore config={config} events={events} orders={orders} seeded={perfSeeded} />
          )}
          {tool === "trending" && (
            <Trending config={config} events={events} orders={orders} seeded={perfSeeded} />
          )}
          {tool === "duplicates" && (
            <DuplicateCleanup config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "seo" && (
            <SeoEditor config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
          {tool === "bundles" && (
            <BundleBuilder config={config} vpsUp={vpsUp} products={products} seeded={seeded} />
          )}
        </>
      )}
    </div>
  );
}
