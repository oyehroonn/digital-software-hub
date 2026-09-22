/**
 * App configuration. Secrets live ONLY in the OS config dir
 * (macOS: ~/Library/Application Support/dsm-admin/config.json,
 *  Windows: %APPDATA%/dsm-admin/config.json) — never committed to git.
 *
 * Non-secret defaults are baked here; secrets default to "" and must be
 * supplied via the local config file or the in-app Settings panel.
 */
import { invoke, runtime } from "./rpc";

export interface AppConfig {
  ecommerce_url: string; // DSM Analytics API base URL (orders + telemetry) — was the Apps Script exec URL
  ecommerce_secret: string; // read key for the DSM Analytics API (?action=orders|telemetry&secret=...)
  telemetry_read_url: string; // optional read-proxy for sheet rows; blank = use the DSM Analytics API GET
  telemetry_sheet_id: string; // legacy key used only to pick the "telemetry" read action; no longer a real sheet id
  orders_sheet_id: string; // legacy key used only to pick the "orders" read action; no longer a real sheet id
  vps_base: string; // VPS Flask product API
  codex_base: string; // codex-proxy (OpenAI compatible)
  codex_key: string;
  codex_model: string;
  simli_base: string;
  simli_key: string;
  email_cli: string; // absolute path to mailcli.py
}

export const DEFAULT_CONFIG: AppConfig = {
  // DSM Analytics API — self-hosted CSV-backed Flask service on the VPS that
  // replaced the ecommerce Google Apps Script (2026-09-23). Same base URL
  // handles POST (order/telemetry intake) and GET (?action=schema|orders|
  // telemetry reads). See ~/.rpidrive/notes/dsm-analytics-csv-api.md.
  ecommerce_url: "https://dsm-analytics.waleeds.world/",
  // Read key for the DSM Analytics API's GET ?action=telemetry|orders
  // endpoints. Unlike the old Apps Script secret, this IS meant to ship in the
  // public admin build — the previous design left it blank in production,
  // which is exactly what caused the "No Apps Script secret set" banner and
  // blank Orders/Heatmaps/Newsletter tabs. It can still be overridden via
  // VITE_ECOM_SECRET (build env), the OS config file (desktop), or Settings.
  ecommerce_secret: (import.meta.env.VITE_ECOM_SECRET as string) || "f07b384602bb68eb3e2ab2cb616689ee64af9e06",
  telemetry_read_url: "",
  telemetry_sheet_id: "telemetry",
  orders_sheet_id: "orders",
  vps_base: "https://dsm-api.techrealm.ai",
  codex_base: "https://open.techrealm.ai/v1",
  codex_key: "",
  codex_model: "gpt-5.4",
  simli_base: "https://api.simli.ai",
  simli_key: "",
  email_cli: "/Users/hico/claude-employee/mailcli.py",
};

const LS_KEY = "dsm-admin.config";

let _cache: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (_cache) return _cache;
  let stored: Partial<AppConfig> = {};
  try {
    if (runtime.isTauri) {
      stored = (await invoke<AppConfig>("get_config")) ?? {};
    } else {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) stored = JSON.parse(raw);
    }
  } catch {
    /* fall back to defaults */
  }
  _cache = { ...DEFAULT_CONFIG, ...stripEmpty(stored) };
  return _cache;
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  _cache = cfg;
  if (runtime.isTauri) {
    await invoke("save_config", { config: cfg });
  } else {
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  }
}

export function clearConfigCache() {
  _cache = null;
}

function stripEmpty(o: Partial<AppConfig>): Partial<AppConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v !== "" && v != null) out[k] = v;
  }
  return out as Partial<AppConfig>;
}
