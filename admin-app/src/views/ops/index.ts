/**
 * OPS & ROLES area barrel — the integration step imports from here.
 *
 *   import { OpsHealthBoard, RolesView, RoleSwitcher } from "@/views/ops";
 *
 * Plus the RBAC primitives the shell needs to gate its nav:
 *   filterTabsByRole, visibleNav, useSession, useCan  (re-exported from lib/roles)
 */
export { OpsHealthBoard } from "./OpsHealthBoard";
export { RolesView } from "./RolesView";
export { RoleSwitcher } from "./RoleSwitcher";

export {
  ROLES,
  REGIONS,
  PERMISSIONS,
  NAV_CONFIG,
  roleGrants,
  roleHas,
  visibleNav,
  filterTabsByRole,
  regionForCountry,
  inRegionScope,
  getSession,
  setRole,
  setRegion,
  subscribeSession,
  useSession,
  useCan,
} from "@/lib/roles";
export type { RoleKey, RegionKey, Permission, Session, NavItem } from "@/lib/roles";
