/**
 * Ops & roles hub. Hosts the health board and role/access management behind one
 * section. Controlled mode: the shell passes `page` + `onPageChange` and owns the
 * secondary nav (page visibility is role-gated at the shell). Standalone it
 * renders its own tab bar.
 */
import { useState } from "react";
import { HeartPulse, ShieldCheck } from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { OpsHealthBoard } from "./OpsHealthBoard";
import { RolesView } from "./RolesView";

type OpsTab = "health" | "roles";

const TABS: { key: OpsTab; label: string; icon: typeof HeartPulse }[] = [
  { key: "health", label: "Health board", icon: HeartPulse },
  { key: "roles", label: "Roles & access", icon: ShieldCheck },
];

export function OpsView({
  config,
  page,
  onPageChange,
}: {
  config: AppConfig;
  page?: string;
  onPageChange?: (k: string) => void;
}) {
  const [internal, setInternal] = useState<OpsTab>("health");
  const controlled = page !== undefined;
  const tab = (controlled ? page : internal) as OpsTab;
  const setTab = (k: OpsTab) => (onPageChange ? onPageChange(k) : setInternal(k));

  return (
    <div className="flex flex-col gap-4">
      {!controlled && (
        <nav className="flex flex-wrap gap-1 border-b border-border pb-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            );
          })}
        </nav>
      )}

      {tab === "health" && <OpsHealthBoard config={config} />}
      {tab === "roles" && <RolesView config={config} />}
    </div>
  );
}

export default OpsView;
