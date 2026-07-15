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
  return status("ecommerce", "Ecommerce (Apps Script)", "stable", r);
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
  const r = await timed(() =>
    httpGet(`${cfg.codex_base}/models`, {
      timeoutMs: 2500,
      headers: cfg.codex_key ? { Authorization: `Bearer ${cfg.codex_key}` } : undefined,
    }),
  );
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
