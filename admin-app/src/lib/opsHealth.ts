/**
 * Ops health support: probe catalog + a PERSISTENT incident log.
 *
 * The existing HealthBoard keeps an in-memory rolling window (lost on reload).
 * This layer adds a durable outage log: every time a service transitions
 * up→down or down→up we append an incident to localStorage, so the ops board
 * doubles as a real cross-session incident history (start, end, duration) rather
 * than only a live snapshot. It complements — not replaces — the `ai_outage`
 * telemetry feed (site-fired, product-facing) with infra-level probe results.
 */
import { httpGet, mailcli, runtime } from "./rpc";
import type { AppConfig } from "./config";

export type Kind = "stable" | "unstable" | "local";
export type Health = "up" | "down" | "unknown";

export interface Probe {
  key: string;
  label: string;
  kind: Kind;
  /** short human target shown under the label */
  target: string;
  run: (cfg: AppConfig) => Promise<unknown>;
}

/** Production VPS status endpoint (config default vps_base may point at localhost). */
const VPS_STATUS_URL = "https://dsm-api.techrealm.ai/ai/status";

export function buildProbes(cfg: AppConfig): Probe[] {
  return [
    {
      key: "ecommerce",
      label: "Ecommerce (Apps Script)",
      kind: "stable",
      target: "?action=schema",
      run: (c) => httpGet(`${c.ecommerce_url}?action=schema`, { timeoutMs: 5000 }),
    },
    {
      key: "email",
      label: "Email API",
      kind: "stable",
      target: "mailcli whoami",
      run: (c) => mailcli(c.email_cli, "whoami"),
    },
    {
      key: "vps",
      label: "VPS Flask API",
      kind: "unstable",
      target: "/ai/status",
      run: () => httpGet(VPS_STATUS_URL, { timeoutMs: 8000 }),
    },
    {
      key: "codex",
      label: "codex-proxy (LLM)",
      kind: "unstable",
      target: "/v1/models",
      run: (c) =>
        httpGet(`${c.codex_base}/models`, {
          timeoutMs: 2500,
          headers: c.codex_key ? { Authorization: `Bearer ${c.codex_key}` } : undefined,
        }),
    },
    {
      key: "simli",
      label: "Simli (avatar)",
      kind: "unstable",
      target: "/",
      run: (c) => httpGet(c.simli_base, { timeoutMs: 2500 }),
    },
  ];
}

export interface Sample {
  t: number;
  ok: boolean | null; // null = skipped/unknown (email outside Tauri)
  ms: number | null;
  detail: string;
}

export async function probeOnce(p: Probe, cfg: AppConfig): Promise<Sample> {
  if (p.key === "email" && !runtime.isTauri) {
    return { t: Date.now(), ok: null, ms: null, detail: "desktop app only" };
  }
  const start = performance.now();
  try {
    await p.run(cfg);
    return { t: Date.now(), ok: true, ms: Math.round(performance.now() - start), detail: "reachable" };
  } catch (e: unknown) {
    return {
      t: Date.now(),
      ok: false,
      ms: Math.round(performance.now() - start),
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

export function healthOf(s?: Sample): Health {
  if (!s || s.ok === null) return "unknown";
  return s.ok ? "up" : "down";
}

/* --------------------------- Persistent incident log --------------------- */

export interface Incident {
  id: string;
  service: string; // probe key
  label: string; // probe label at time of incident
  kind: Kind;
  startedAt: number;
  endedAt: number | null; // null = still down (ongoing)
  detail: string; // last error detail seen
}

const LS_KEY = "dsm-admin.incidents";
const MAX_INCIDENTS = 200;
type Listener = (items: Incident[]) => void;
const listeners = new Set<Listener>();

function read(): Incident[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Incident[]) : [];
  } catch {
    return [];
  }
}

function write(items: Incident[]) {
  const trimmed = items.slice(-MAX_INCIDENTS);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(trimmed));
}

export function getIncidents(): Incident[] {
  // newest first
  return read().slice().sort((a, b) => b.startedAt - a.startedAt);
}

export function subscribeIncidents(fn: Listener): () => void {
  listeners.add(fn);
  fn(getIncidents());
  return () => {
    listeners.delete(fn);
  };
}

export function clearIncidents() {
  write([]);
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Reconcile a fresh probe result against the log. Opens a new incident on a
 * down transition, closes the open one on recovery. Idempotent per sample:
 * calling it every poll only mutates on an actual state change.
 */
export function recordProbe(p: Probe, s: Sample): void {
  const health = healthOf(s);
  if (health === "unknown") return; // skipped (e.g. email in browser) — ignore
  const items = read();
  const openIdx = items.findIndex((i) => i.service === p.key && i.endedAt === null);

  if (health === "down") {
    if (openIdx === -1) {
      items.push({
        id: uid(),
        service: p.key,
        label: p.label,
        kind: p.kind,
        startedAt: s.t,
        endedAt: null,
        detail: s.detail,
      });
      write(items);
    } else if (items[openIdx].detail !== s.detail) {
      items[openIdx] = { ...items[openIdx], detail: s.detail };
      write(items);
    }
  } else if (health === "up" && openIdx !== -1) {
    items[openIdx] = { ...items[openIdx], endedAt: s.t };
    write(items);
  }
}

export function incidentDurationMs(i: Incident): number {
  return (i.endedAt ?? Date.now()) - i.startedAt;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export interface Derived {
  latest?: Sample;
  health: Health;
  uptimePct: number | null;
  avgMs: number | null;
  maxMs: number | null;
  measured: number;
}

export function derive(samples: Sample[]): Derived {
  const latest = samples[samples.length - 1];
  const measured = samples.filter((s) => s.ok !== null);
  const okMs = measured.filter((s) => s.ok && s.ms != null).map((s) => s.ms as number);
  const up = measured.filter((s) => s.ok).length;
  return {
    latest,
    health: healthOf(latest),
    uptimePct: measured.length ? (up / measured.length) * 100 : null,
    avgMs: okMs.length ? Math.round(okMs.reduce((a, b) => a + b, 0) / okMs.length) : null,
    maxMs: okMs.length ? Math.max(...okMs) : null,
    measured: measured.length,
  };
}
