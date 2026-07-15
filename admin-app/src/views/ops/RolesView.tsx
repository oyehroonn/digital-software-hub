/**
 * RolesView — role-based access control console.
 *
 * Shows the active session (role + region) with a live switcher, the effective
 * permissions that role grants, the full role×permission matrix, a preview of
 * the gated navigation each role sees, and the per-region data-scoping model
 * (with a live count of how many of the current orders fall inside scope).
 *
 * Purely operator-facing: switching role here re-gates the whole shell via the
 * shared session store. This is convenience access control, not a security
 * boundary — the Apps Script secret still gates the underlying data.
 */
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Check,
  Globe,
  Lock,
  Minus,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { AppConfig } from "@/lib/config";
import { fetchOrders, type Order } from "@/lib/ecommerce";
import {
  ROLES,
  PERMISSIONS,
  REGIONS,
  ROLE_MAP,
  REGION_MAP,
  roleGrants,
  roleHas,
  visibleNav,
  regionForCountry,
  inRegionScope,
  useSession,
  setRole,
  setRegion,
  type Permission,
  type PermissionMeta,
  type RoleKey,
  type RegionKey,
} from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCENT_DOT: Record<string, string> = {
  primary: "bg-primary",
  ok: "bg-ok",
  warn: "bg-warn",
  down: "bg-down",
  muted: "bg-muted-foreground",
};

const GROUP_ORDER: PermissionMeta["group"][] = [
  "Catalog",
  "Sales",
  "Analytics",
  "Growth",
  "Finance",
  "Operations",
];

export function RolesView({ config }: { config: AppConfig }) {
  const { role, region } = useSession();
  const roleDef = ROLE_MAP[role];
  const grants = useMemo(() => roleGrants(role), [role]);

  // Region-scope demonstration against real order data (best-effort, optional).
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    let alive = true;
    fetchOrders(config, 2000)
      .then((r) => alive && setOrders(r))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, [config]);

  const regionCounts = useMemo(() => {
    const map = new Map<RegionKey, number>();
    for (const r of REGIONS) map.set(r.key, 0);
    for (const o of orders) {
      const rk = regionForCountry(o.country);
      map.set(rk, (map.get(rk) ?? 0) + 1);
    }
    return map;
  }, [orders]);

  const inScope = useMemo(
    () => orders.filter((o) => inRegionScope(region, o.country)).length,
    [orders, region],
  );

  const nav = visibleNav(role);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Roles &amp; access</h1>
          <p className="text-xs text-muted-foreground">
            Role-based access &amp; per-region scoping. Switching role re-gates the whole app.
          </p>
        </div>
      </div>

      {/* Active session card + inline switcher */}
      <Card className="border-l-4 border-l-primary">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                Acting as {roleDef.label}
                {roleDef.regionScoped && (
                  <Badge variant="muted" className="gap-1">
                    <Globe className="h-3 w-3" /> {REGION_MAP[region].label.replace(/ \(.*\)/, "")}
                  </Badge>
                )}
              </div>
              <div className="max-w-md text-xs text-muted-foreground">{roleDef.blurb}</div>
            </div>
          </div>
          <div className="flex items-center gap-5 text-center">
            <div>
              <div className="text-lg font-semibold tabular-nums">{grants.size}</div>
              <div className="text-[10px] uppercase text-muted-foreground">permissions</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums">{nav.length}</div>
              <div className="text-[10px] uppercase text-muted-foreground">visible tabs</div>
            </div>
            <div>
              <div className="text-lg font-semibold tabular-nums text-primary">
                {region === "global" ? orders.length : inScope}
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">orders in scope</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Role picker (large, descriptive) + region picker */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="h-4 w-4" /> Switch role
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((r) => {
              const active = r.key === role;
              const count = roleGrants(r.key).size;
              return (
                <button
                  key={r.key}
                  onClick={() => setRole(r.key as RoleKey)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-accent/40",
                  )}
                >
                  <div className="flex w-full items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", ACCENT_DOT[r.accent])} />
                    <span className="text-sm font-semibold">{r.label}</span>
                    {r.all && <Badge variant="default">super</Badge>}
                    {r.regionScoped && <Badge variant="muted">region</Badge>}
                    {active && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </div>
                  <div className="text-[11px] leading-snug text-muted-foreground">{r.blurb}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {count} permission{count === 1 ? "" : "s"}
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {/* Region scope */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-4 w-4" /> Region scope
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <p className="mb-1 text-[11px] text-muted-foreground">
              Scopes orders, customers &amp; analytics to a region. Area managers are locked to
              their region; other roles can narrow scope here.
            </p>
            {REGIONS.map((r) => {
              const active = r.key === region;
              const n = regionCounts.get(r.key) ?? 0;
              return (
                <button
                  key={r.key}
                  onClick={() => setRegion(r.key as RegionKey)}
                  className={cn(
                    "flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:bg-accent/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Globe
                      className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")}
                    />
                    {r.label.replace(/ \(.*\)/, "")}
                  </span>
                  <Badge variant={active ? "default" : "muted"}>{n}</Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Effective permissions for active role */}
      <Card>
        <CardHeader>
          <CardTitle>Effective permissions — {roleDef.label}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUP_ORDER.map((group) => {
            const perms = PERMISSIONS.filter((p) => p.group === group);
            if (perms.length === 0) return null;
            return (
              <div key={group}>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </div>
                <div className="flex flex-col gap-1">
                  {perms.map((p) => {
                    const has = grants.has(p.key);
                    return (
                      <div key={p.key} className="flex items-center gap-2 text-xs">
                        {has ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" />
                        ) : (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={cn(has ? "text-foreground" : "text-muted-foreground/60 line-through")}>
                          {p.label}
                        </span>
                        {p.sensitive && has && (
                          <span className="ml-auto text-[9px] uppercase text-warn">sensitive</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Gated nav preview */}
      <Card>
        <CardHeader>
          <CardTitle>Gated navigation — what {roleDef.label} sees</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {NAV_PREVIEW(role)}
        </CardContent>
      </Card>

      {/* Full permission matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Permission matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <PermissionMatrix activeRole={role} />
        </CardContent>
      </Card>
    </div>
  );
}

function NAV_PREVIEW(role: RoleKey) {
  const visible = new Set(visibleNav(role).map((n) => n.key));
  const all = [
    "products", "orders", "customers", "analytics", "scroll", "look",
    "marketing", "fleet", "health", "roles", "settings",
  ];
  const labelFor: Record<string, string> = {
    products: "Products", orders: "Orders", customers: "Customers", analytics: "Analytics",
    scroll: "Scroll map", look: "Look map", marketing: "Marketing", fleet: "Fleet",
    health: "Health", roles: "Roles & access", settings: "Settings",
  };
  return all.map((k) => {
    const on = visible.has(k);
    return (
      <span
        key={k}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs",
          on
            ? "border-border bg-accent/40 text-foreground"
            : "border-dashed border-border/60 text-muted-foreground/50",
        )}
      >
        {on ? <Check className="h-3 w-3 text-ok" /> : <Minus className="h-3 w-3" />}
        {labelFor[k] ?? k}
      </span>
    );
  });
}

function PermissionMatrix({ activeRole }: { activeRole: RoleKey }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium">Permission</th>
            {ROLES.map((r) => (
              <th
                key={r.key}
                className={cn(
                  "px-2 py-2 text-center font-medium",
                  r.key === activeRole && "text-primary",
                )}
                title={r.blurb}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full", ACCENT_DOT[r.accent])} />
                  {r.label.split(" ")[0]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUP_ORDER.map((group) => {
            const perms = PERMISSIONS.filter((p) => p.group === group);
            if (!perms.length) return null;
            return (
              <Fragment key={group}>
                <tr>
                  <td
                    colSpan={ROLES.length + 1}
                    className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {group}
                  </td>
                </tr>
                {perms.map((p) => (
                  <tr key={p.key} className="border-b border-border/50">
                    <td className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left">
                      <span className="flex items-center gap-1.5">
                        {p.label}
                        {p.sensitive && <Lock className="h-3 w-3 text-warn" />}
                      </span>
                    </td>
                    {ROLES.map((r) => {
                      const has = roleHas(r.key, p.key);
                      return (
                        <td
                          key={r.key}
                          className={cn(
                            "px-2 py-1.5 text-center",
                            r.key === activeRole && "bg-primary/5",
                          )}
                        >
                          {has ? (
                            <Check className="mx-auto h-3.5 w-3.5 text-ok" />
                          ) : (
                            <Minus className="mx-auto h-3 w-3 text-muted-foreground/30" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
