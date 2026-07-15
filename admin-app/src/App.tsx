import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ClipboardList,
  BarChart3,
  Users,
  Megaphone,
  Sparkles,
  HeartPulse,
  ShieldCheck,
  Settings2,
  RefreshCw,
  Newspaper,
  FileText,
  Search,
  UserMinus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadConfig, type AppConfig } from "@/lib/config";
import { checkAll, type ServiceStatus } from "@/lib/health";
import { pushQueue, subscribe } from "@/lib/offlineQueue";
import { filterTabsByRole, useSession } from "@/lib/roles";
import { StatusDot } from "@/components/StatusDot";

// New feature-area hubs.
import { AnalyticsHub } from "@/views/analytics";
import { CatalogView } from "@/views/catalog/CatalogView";
import OrdersFulfillment from "@/views/orders";
import { CrmView } from "@/views/crm/CrmView";
import { MarketingView } from "@/views/marketing/MarketingView";
import {
  DailySalesBriefing,
  LeadSummaries,
  BulkSeoGenerator,
  ChurnPredictor,
} from "@/views/ai";
import { OpsHealthBoard, RolesView, RoleSwitcher } from "@/views/ops";
import { SettingsView } from "@/views/SettingsView";

type ViewProps = { config: AppConfig; vpsUp: boolean; onSavedConfig: (c: AppConfig) => void };

interface NavTab {
  key: string;
  label: string;
  icon: typeof Boxes;
  render: (p: ViewProps) => JSX.Element;
}

interface NavGroup {
  label: string;
  tabs: NavTab[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analytics",
    tabs: [
      {
        key: "analytics",
        label: "Heatmaps & Funnels",
        icon: BarChart3,
        render: ({ config }) => <AnalyticsHub config={config} />,
      },
    ],
  },
  {
    label: "Catalog",
    tabs: [
      {
        key: "products",
        label: "Products & Pricing",
        icon: Boxes,
        render: ({ config, vpsUp }) => <CatalogView config={config} vpsUp={vpsUp} />,
      },
    ],
  },
  {
    label: "Orders",
    tabs: [
      {
        key: "orders",
        label: "Orders & Fulfillment",
        icon: ClipboardList,
        render: ({ config }) => <OrdersFulfillment config={config} />,
      },
    ],
  },
  {
    label: "CRM",
    tabs: [
      {
        key: "customers",
        label: "Leads & Customers",
        icon: Users,
        render: ({ config }) => <CrmView config={config} />,
      },
    ],
  },
  {
    label: "Marketing",
    tabs: [
      {
        key: "marketing",
        label: "Campaigns & Blasts",
        icon: Megaphone,
        render: ({ config }) => <MarketingView config={config} />,
      },
    ],
  },
  {
    label: "AI",
    tabs: [
      {
        key: "ai-briefing",
        label: "Daily Briefing",
        icon: Newspaper,
        render: ({ config }) => <DailySalesBriefing config={config} />,
      },
      {
        key: "ai-leads",
        label: "Lead Summaries",
        icon: FileText,
        render: ({ config }) => <LeadSummaries config={config} />,
      },
      {
        key: "ai-seo",
        label: "SEO Generator",
        icon: Search,
        render: ({ config }) => <BulkSeoGenerator config={config} />,
      },
      {
        key: "ai-churn",
        label: "Churn Predictor",
        icon: UserMinus,
        render: ({ config }) => <ChurnPredictor config={config} />,
      },
    ],
  },
  {
    label: "Ops",
    tabs: [
      {
        key: "health",
        label: "Health Board",
        icon: HeartPulse,
        render: ({ config }) => <OpsHealthBoard config={config} />,
      },
      {
        key: "roles",
        label: "Roles & Access",
        icon: ShieldCheck,
        render: ({ config }) => <RolesView config={config} />,
      },
      {
        key: "settings",
        label: "Settings",
        icon: Settings2,
        render: ({ config, onSavedConfig }) => (
          <SettingsView config={config} onSaved={onSavedConfig} />
        ),
      },
    ],
  },
];

const HEALTH_INTERVAL_MS = 20000;

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const { role } = useSession();

  // Role-gated, flattened nav. Groups drop out entirely when they have no
  // visible tabs for the active role.
  const groups = useMemo<NavGroup[]>(
    () =>
      NAV_GROUPS.map((g) => ({ ...g, tabs: filterTabsByRole(g.tabs, role) })).filter(
        (g) => g.tabs.length > 0,
      ),
    [role],
  );

  const allTabs = useMemo(() => groups.flatMap((g) => g.tabs), [groups]);
  const [tabKey, setTabKey] = useState<string>("analytics");

  // Keep the active tab valid when the role change hides it.
  useEffect(() => {
    if (allTabs.length && !allTabs.some((t) => t.key === tabKey)) {
      setTabKey(allTabs[0].key);
    }
  }, [allTabs, tabKey]);

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
  const vpsUp = vps?.health === "up";

  const active = allTabs.find((t) => t.key === tabKey);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
            D
          </div>
          <div>
            <div className="text-sm font-semibold leading-none">DSM Admin</div>
            <div className="text-[11px] text-muted-foreground">
              Analytics · Catalog · Orders · CRM · Marketing · AI
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <RoleSwitcher />
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
        <nav className="flex w-48 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border p-2">
          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
              {group.tabs.map((t) => {
                const Icon = t.icon;
                const isActive = tabKey === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTabKey(t.key)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{t.label}</span>
                    {t.key === "health" && queueCount > 0 && (
                      <span className="ml-auto rounded bg-warn/20 px-1.5 text-[10px] text-warn">
                        {queueCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          {!config ? (
            <div className="text-sm text-muted-foreground">Loading config…</div>
          ) : active ? (
            active.render({ config, vpsUp, onSavedConfig: setConfig })
          ) : (
            <div className="text-sm text-muted-foreground">No view available for this role.</div>
          )}
        </main>
      </div>
    </div>
  );
}
