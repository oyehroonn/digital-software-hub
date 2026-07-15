/**
 * Health checks / pingers for the three UNSTABLE backends.
 *
 * Every check is bounded by a hard timeout (default 2.5s per the resilience
 * contract) and NEVER throws — it resolves to a HealthResult. A check that
 * times out, 500s, or is unreachable resolves to { ok: false }.
 *
 *   - VPS Flask API   → GET  {VITE_API_BASE}/ai/status
 *   - codex-proxy     → GET  {LLM proxy base}/models   (same-origin, key added server-side)
 *   - Simli           → GET  {Simli health base}       (same-origin proxy, or configured URL)
 */

import type { AiBackend } from './telemetry';

export interface HealthResult {
  ok: boolean;
  /** round-trip time in ms, when the request completed */
  latencyMs?: number;
  /** short reason when !ok */
  error?: string;
}

export const DEFAULT_HEALTH_TIMEOUT_MS = 2500;

// ── Endpoint resolution (env-overridable) ───────────────────────────────────

/** VPS Flask base, e.g. http://localhost:5051 */
export const VPS_BASE =
  import.meta.env.VITE_API_BASE || 'http://localhost:5051';

/**
 * Same-origin proxy for the OpenAI-compatible codex-proxy. The browser NEVER
 * talks to open.techrealm.ai directly — a server route injects the key.
 * Default is a relative path so it resolves against the site's own origin.
 */
export const LLM_PROXY_BASE =
  import.meta.env.VITE_LLM_PROXY_BASE || '/api/llm';

/**
 * Simli health endpoint. Prefer a same-origin proxy (`/api/simli/health`) that
 * validates the session key server-side. Overridable to a direct URL if the
 * deployment exposes one that is CORS-readable.
 */
export const SIMLI_HEALTH_URL =
  import.meta.env.VITE_SIMLI_HEALTH_URL || '/api/simli/health';

// ── Timed fetch helper ──────────────────────────────────────────────────────

async function timedProbe(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS
): Promise<HealthResult> {
  if (typeof fetch === 'undefined') {
    return { ok: false, error: 'fetch-unavailable' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      ...init,
      signal: controller.signal,
    });
    const latencyMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        started
    );
    if (!res.ok) {
      return { ok: false, latencyMs, error: `http-${res.status}` };
    }
    return { ok: true, latencyMs };
  } catch (err) {
    const aborted =
      err instanceof DOMException && err.name === 'AbortError';
    return {
      ok: false,
      error: aborted ? 'timeout' : err instanceof Error ? err.message : 'network-error',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Per-backend checks ──────────────────────────────────────────────────────

export function checkVps(
  base: string = VPS_BASE,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS
): Promise<HealthResult> {
  return timedProbe(`${base.replace(/\/$/, '')}/ai/status`, {}, timeoutMs);
}

export function checkCodex(
  proxyBase: string = LLM_PROXY_BASE,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS
): Promise<HealthResult> {
  // Mirrors codex-proxy's `/v1/models`; our proxy exposes it as `{base}/models`.
  return timedProbe(`${proxyBase.replace(/\/$/, '')}/models`, {}, timeoutMs);
}

export function checkSimli(
  url: string = SIMLI_HEALTH_URL,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS
): Promise<HealthResult> {
  return timedProbe(url, {}, timeoutMs);
}

// ── Unified dispatcher (used by <AIFeature>) ────────────────────────────────

export function checkBackend(
  backend: AiBackend,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS
): Promise<HealthResult> {
  switch (backend) {
    case 'vps':
      return checkVps(undefined, timeoutMs);
    case 'codex':
      return checkCodex(undefined, timeoutMs);
    case 'simli':
      return checkSimli(undefined, timeoutMs);
    default:
      return Promise.resolve({ ok: false, error: 'unknown-backend' });
  }
}
