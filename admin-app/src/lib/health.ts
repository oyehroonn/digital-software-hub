/**
 * Health checks for every backend the DSM stack depends on.
 * Mirrors the resilience contract: STABLE (ecommerce, email) vs
 * UNSTABLE (vps, codex-proxy, simli). "Reachable" (any HTTP response, even
 * 4xx/5xx) counts as UP for a status board; a network error / timeout = DOWN.
 */
import { httpGet, mailcli, runtime } from "./rpc";
import type { AppConfig } from "./config";
import { queueSize } from "./offlineQueue";

export type Health = "up" | "down" | "unknown";

export interface ServiceStatus {
  key: string;
  label: string;
  kind: "stable" | "unstable" | "local";
  health: Health;
  latencyMs: number | null;
  detail: string;
  checkedAt: number;
}

async function timed(fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; detail: string }> {
  const start = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - start), detail: "reachable" };
  } catch (e: unknown) {
    return {
      ok: false,
      ms: Math.round(performance.now() - start),
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function checkEcommerce(cfg: AppConfig): Promise<ServiceStatus> {
  const r = await timed(() => httpGet(`${cfg.ecommerce_url}?action=schema`, { timeoutMs: 5000 }));
  return status("ecommerce", "Ecommerce (DSM Analytics API)", "stable", r);
}

export async function checkEmail(cfg: AppConfig): Promise<ServiceStatus> {
  if (!runtime.isTauri) {
    return status("email", "Email API", "stable", {
      ok: false,
      ms: 0,
      detail: "desktop app only",
    });
  }
  const r = await timed(() => mailcli(cfg.email_cli, "whoami"));
  return status("email", "Email API", "stable", r);
}

export async function checkVps(cfg: AppConfig): Promise<ServiceStatus> {
  const r = await timed(() => httpGet(`${cfg.vps_base}/ai/status`, { timeoutMs: 2500 }));
  return status("vps", "VPS Flask API", "unstable", r);
}

export async function checkCodex(cfg: AppConfig): Promise<ServiceStatus> {
  // A plain browser `fetch` straight to `${codex_base}/models`
  // (https://open.techrealm.ai/v1/models) is CORS-blocked — that host sends
  // no Access-Control-Allow-Origin header (its OPTIONS preflight even 403s),
  // so the request never completes and this always reported "down" /
  // "Failed to fetch" even while AI chat features (which route through the
  // Tauri http bridge, or the VPS proxy below) worked fine. Same
  // known-good routing `lib/llm.ts`'s `ping()` already uses: the Tauri
  // native http bridge isn't subject to browser CORS, so try codex_base
  // directly there; everywhere else (the web admin panel) go through the
  // VPS's same-origin-friendly `/api/llm/models` proxy first, which mirrors
  // the direct codex-proxy response and is served with
  // `Access-Control-Allow-Origin: *`.
  const codexUrl = cfg.codex_base ? `${cfg.codex_base.replace(/\/+$/, "")}/models` : "";
  const vpsUrl = cfg.vps_base ? `${cfg.vps_base.replace(/\/+$/, "")}/api/llm/models` : "";
  const headers = cfg.codex_key ? { Authorization: `Bearer ${cfg.codex_key}` } : undefined;
  const candidates = (runtime.isTauri ? [codexUrl, vpsUrl] : [vpsUrl, codexUrl]).filter(Boolean);

  let r: { ok: boolean; ms: number; detail: string } = {
    ok: false,
    ms: 0,
    detail: "no codex/VPS base configured",
  };
  for (const url of candidates) {
    r = await timed(() => httpGet(url, { timeoutMs: 2500, headers }));
    if (r.ok) break;
  }
  return status("codex", "codex-proxy (LLM)", "unstable", r);
}

export async function checkSimli(cfg: AppConfig): Promise<ServiceStatus> {
  const r = await timed(() => httpGet(cfg.simli_base, { timeoutMs: 2500 }));
  return status("simli", "Simli (avatar)", "unstable", r);
}

function status(
  key: string,
  label: string,
  kind: ServiceStatus["kind"],
  r: { ok: boolean; ms: number; detail: string },
): ServiceStatus {
  return {
    key,
    label,
    kind,
    health: r.ok ? "up" : "down",
    latencyMs: r.ms,
    detail: r.detail,
    checkedAt: Date.now(),
  };
}

export async function checkAll(cfg: AppConfig): Promise<ServiceStatus[]> {
  return Promise.all([
    checkEcommerce(cfg),
    checkEmail(cfg),
    checkVps(cfg),
    checkCodex(cfg),
    checkSimli(cfg),
  ]);
}

export function pendingQueueStatus(): { count: number } {
  return { count: queueSize() };
}
