/**
 * App shell — the DSM admin information architecture.
 *
 * Layout:
 *   • a compact, role-gated SIDEBAR of primary sections, organised under
 *     collapsible groups (Main / Analyze / Commerce / Growth / System),
 *   • a HEADER with the active-view breadcrumb (Section › Page), a ⌘K command
 *     box, the role switcher and live backend health,
 *   • a per-section SECONDARY NAV (Overview + the section's pages) so features
 *     live under their section instead of one flat list,
 *   • the section content — a Dashboard home, a generic section Overview hub, or
 *     the section's active page (rendered by the hubs in controlled mode).
 *
 * The whole IA lives in src/nav/model.tsx; this file just wires state + chrome.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Command, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadConfig, type AppConfig } from "@/lib/config";
import { checkAll, type ServiceStatus } from "@/lib/health";
import { pushQueue, subscribe } from "@/lib/offlineQueue";
import { useSession } from "@/lib/roles";
import { StatusDot } from "@/components/StatusDot";
import { RoleSwitcher } from "@/views/ops";
import {
  SECTION_MAP,
  SIDEBAR_GROUPS,
  displayPages,
  defaultPageOf,
  sectionVisible,
  visibleSections,
  type NavCtx,
} from "@/nav/model";
import { SectionOverview } from "@/nav/SectionOverview";
import { Breadcrumbs } from "@/nav/Breadcrumbs";
import { CommandPalette } from "@/nav/CommandPalette";

const HEALTH_INTERVAL_MS = 20000;

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const { role } = useSession();

  // Navigation state: active section + remembered page per section.
  const [sectionKey, setSectionKey] = useState("dashboard");
  const [pageBySection, setPageBySection] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);

  const sections = useMemo(() => visibleSections(role), [role]);

  // Resolve the active section, falling back if the role hides it.
  const activeSection = useMemo(() => {
    const s = SECTION_MAP[sectionKey];
    if (s && sectionVisible(s, role)) return s;
    return sections[0] ?? SECTION_MAP.dashboard;
  }, [sectionKey, role, sections]);

  const pages = useMemo(() => displayPages(activeSection, role), [activeSection, role]);

  // Resolve the active page within the section, validating against role.
  const activePage = useMemo(() => {
    if (activeSection.singlePage) return "";
    const stored = pageBySection[activeSection.key];
    if (stored && pages.some((p) => p.key === stored)) return stored;
    return defaultPageOf(activeSection, role);
  }, [activeSection, pages, pageBySection, role]);

  const goto = useCallback((secKey: string, pageKey?: string) => {
    setSectionKey(secKey);
    if (pageKey) setPageBySection((prev) => ({ ...prev, [secKey]: pageKey }));
  }, []);

  const setPage = useCallback(
    (key: string) => setPageBySection((prev) => ({ ...prev, [activeSection.key]: key })),
    [activeSection.key],
  );

  // ⌘K / Ctrl-K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  useEffect(() => subscribe((items) => setQueueCount(items.length)), []);

  const refreshHealth = useCallback(async () => {
    if (!config) return;
    const s = await checkAll(config);
    setStatuses(s);
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

  const ctx: NavCtx | null = config
    ? {
        config,
        vpsUp,
        statuses,
        queueCount,
        onSavedConfig: setConfig,
        section: activeSection,
        page: activePage,
        setPage,
        goto,
      }
    : null;

  const pageLabel = activeSection.singlePage
    ? null
    : (pages.find((p) => p.key === activePage)?.label ?? null);

  const renderContent = () => {
    if (!ctx) return <div className="text-sm text-muted-foreground">Loading config…</div>;
    if (activeSection.singlePage) return activeSection.render(ctx);
    if (activePage === "overview" && !activeSection.customOverview) {
      return <SectionOverview ctx={ctx} />;
    }
    return activeSection.render(ctx);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
            D
          </div>
          <Breadcrumbs
            section={activeSection}
            pageLabel={pageLabel}
            onSectionClick={() => goto(activeSection.key)}
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent sm:flex"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="ml-1 inline-flex items-center gap-0.5 rounded border border-border px-1 text-[10px]">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          <RoleSwitcher />
          <span className="hidden items-center gap-1.5 lg:flex">
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
        {/* Sidebar — sections grouped into collapsible buckets */}
        <nav className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2">
          {SIDEBAR_GROUPS.map((group) => {
            const inGroup = sections.filter((s) => s.group === group);
            if (inGroup.length === 0) return null;
            const isCollapsed = collapsed.has(group);
            return (
              <div key={group} className="flex flex-col gap-0.5">
                <button
                  onClick={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      next.has(group) ? next.delete(group) : next.add(group);
                      return next;
                    })
                  }
                  className="flex items-center gap-1 px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground"
                >
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", isCollapsed && "-rotate-90")}
                  />
                  {group}
                </button>
                {!isCollapsed &&
                  inGroup.map((s) => {
                    const Icon = s.icon;
                    const isActive = s.key === activeSection.key;
                    const showQueue = s.key === "ops" && queueCount > 0;
                    return (
                      <button
                        key={s.key}
                        onClick={() => goto(s.key)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{s.label}</span>
                        {showQueue && (
                          <span className="ml-auto rounded bg-warn/20 px-1.5 text-[10px] text-warn">
                            {queueCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        {/* Main column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Secondary nav — the section's pages (Overview first) */}
          {pages.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 overflow-x-auto border-b border-border px-4 py-2">
              {pages.map((p) => {
                const Icon = p.icon;
                const isActive = p.key === activePage;
                const showQueue = activeSection.key === "ops" && p.key === "health" && queueCount > 0;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPage(p.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {p.label}
                    {showQueue && (
                      <span className="rounded bg-warn/20 px-1.5 text-[10px] text-warn">{queueCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto p-5">{renderContent()}</main>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onGo={goto} />
    </div>
  );
}
