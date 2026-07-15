/**
 * RoleSwitcher — compact role + region selector for the app header/nav.
 *
 * Writes straight to the shared session store (lib/roles.ts) so every gated
 * view and the nav update instantly. Region selector only shows for a
 * region-scoped role (or when the operator has narrowed scope manually).
 *
 * Drop it anywhere; the integration step wires it into App.tsx's header.
 */
import { useState } from "react";
import { ChevronDown, Globe, ShieldCheck } from "lucide-react";
import {
  ROLES,
  REGIONS,
  ROLE_MAP,
  REGION_MAP,
  setRole,
  setRegion,
  useSession,
  type RoleKey,
  type RegionKey,
} from "@/lib/roles";
import { cn } from "@/lib/utils";

const ACCENT: Record<string, string> = {
  primary: "bg-primary/15 text-primary",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  down: "bg-down/15 text-down",
  muted: "bg-muted text-muted-foreground",
};

export function RoleSwitcher({ className }: { className?: string }) {
  const { role, region } = useSession();
  const [open, setOpen] = useState<"role" | "region" | null>(null);
  const def = ROLE_MAP[role];
  const showRegion = def.regionScoped || region !== "global";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Role menu */}
      <div className="relative">
        <button
          onClick={() => setOpen(open === "role" ? null : "role")}
          className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
          title="Switch role"
        >
          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
          <span className={cn("rounded px-1.5 py-0.5 font-medium", ACCENT[def.accent])}>
            {def.label}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
        {open === "role" && (
          <Menu onClose={() => setOpen(null)}>
            {ROLES.map((r) => (
              <MenuItem
                key={r.key}
                active={r.key === role}
                onClick={() => {
                  setRole(r.key as RoleKey);
                  setOpen(null);
                }}
              >
                <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", ACCENT[r.accent])} />
                <span className="min-w-0">
                  <span className="block font-medium">{r.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{r.blurb}</span>
                </span>
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      {/* Region menu (scoped roles only) */}
      {showRegion && (
        <div className="relative">
          <button
            onClick={() => setOpen(open === "region" ? null : "region")}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent"
            title="Region scope"
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{REGION_MAP[region].label.replace(/ \(.*\)/, "")}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
          {open === "region" && (
            <Menu onClose={() => setOpen(null)}>
              {REGIONS.map((r) => (
                <MenuItem
                  key={r.key}
                  active={r.key === region}
                  onClick={() => {
                    setRegion(r.key as RegionKey);
                    setOpen(null);
                  }}
                >
                  <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{r.label}</span>
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>
      )}
    </div>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      {/* click-away backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
        {children}
      </div>
    </>
  );
}

function MenuItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        active ? "bg-accent text-foreground" : "hover:bg-accent/60",
      )}
    >
      {children}
    </button>
  );
}
