import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  ClipboardList,
  BarChart3,
  MoveVertical,
  HeartPulse,
  Settings2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadConfig, type AppConfig } from "@/lib/config";
import { checkAll, type ServiceStatus } from "@/lib/health";
import { pushQueue, subscribe } from "@/lib/offlineQueue";
import { StatusDot } from "@/components/StatusDot";
import { ProductsView } from "@/views/ProductsView";
import { OrdersView } from "@/views/OrdersView";
import { AnalyticsView } from "@/views/AnalyticsView";
import { ScrollMap } from "@/views/ScrollMap";
import { HealthBoard } from "@/views/HealthBoard";
import { SettingsView } from "@/views/SettingsView";

type TabKey = "products" | "orders" | "analytics" | "scroll" | "health" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof Boxes }[] = [
  { key: "products", label: "Products", icon: Boxes },
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "scroll", label: "Scroll map", icon: MoveVertical },
  { key: "health", label: "Health", icon: HeartPulse },
  { key: "settings", label: "Settings", icon: Settings2 },
];

const HEALTH_INTERVAL_MS = 20000;

export default function App() {
  const [tab, setTab] = useState<TabKey>("products");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  useEffect(() => subscribe((items) => setQueueCount(items.length)), []);

  const refreshHealth = useCallback(async () => {
    if (!config) return;
    const s = await checkAll(config);
    setStatuses(s);
    // Auto-push queued edits the moment the VPS is reachable.
    const vps = s.find((x) => x.key === "vps");
    if (vps?.health === "up" && queueCount > 0) {
      await pushQueue(config);
    }
  }, [config, queueCount]);

  useEffect(() => {
    if (!config) return;
    refreshHealth();
    const id = setInterval(refreshHealth, HEALTH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [config, refreshHealth]);

  const vps = statuses.find((s) => s.key === "vps");
  const ecom = statuses.find((s) => s.key === "ecommerce");

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
            D
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">DSM Admin</div>
            <div className="text-[11px] text-muted-foreground">Catalog · Orders · Telemetry</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusDot health={ecom?.health ?? "unknown"} /> Ecommerce
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot health={vps?.health ?? "unknown"} pulse /> VPS
          </span>
          {queueCount > 0 && (
            <span className="rounded bg-warn/15 px-2 py-0.5 text-warn">{queueCount} queued</span>
          )}
          <button
            onClick={refreshHealth}
            className="flex items-center gap-1 rounded px-2 py-1 hover:bg-accent"
            title="Refresh health"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border p-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  tab === t.key
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {t.key === "health" && queueCount > 0 && (
                  <span className="ml-auto rounded bg-warn/20 px-1.5 text-[10px] text-warn">
                    {queueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {!config ? (
            <div className="text-sm text-muted-foreground">Loading config…</div>
          ) : tab === "products" ? (
            <ProductsView config={config} vpsUp={vps?.health === "up"} />
          ) : tab === "orders" ? (
            <OrdersView config={config} />
          ) : tab === "analytics" ? (
            <AnalyticsView config={config} />
          ) : tab === "scroll" ? (
            <ScrollMap config={config} />
          ) : tab === "health" ? (
            <HealthBoard config={config} />
          ) : (
            <SettingsView config={config} onSaved={setConfig} />
          )}
        </main>
      </div>
    </div>
  );
}
