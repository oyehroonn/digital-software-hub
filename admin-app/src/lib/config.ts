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
  ecommerce_url: string; // Apps Script exec URL (orders + telemetry)
  ecommerce_secret: string; // server/admin-app only
  telemetry_read_url: string; // optional read-proxy for sheet rows; blank = use Apps Script GET
  telemetry_sheet_id: string; // Google Sheet id read DIRECTLY as CSV (telemetry)
  orders_sheet_id: string; // Google Sheet id read DIRECTLY as CSV (orders)
  vps_base: string; // VPS Flask product API
  codex_base: string; // codex-proxy (OpenAI compatible)
  codex_key: string;
  codex_model: string;
  simli_base: string;
  simli_key: string;
  email_cli: string; // absolute path to mailcli.py
}

export const DEFAULT_CONFIG: AppConfig = {
  ecommerce_url:
    "https://script.google.com/macros/s/AKfycbx0xBtUqHzC1Swqb7nuL8vyw5l_KkEYxrFYs24Bo7N2l_tRAg38BhF8ru6NlCDda91U/exec",
  // Read/write secret for the ecommerce Apps Script (orders + telemetry). Gates
  // the GET ?action=telemetry|orders read endpoints so the admin can pull the
  // private sheets without publishing them. NEVER hardcoded — it must not ship in
  // a public web bundle. Sourced from a gitignored build env (VITE_ECOM_SECRET,
  // set in admin-app/.env.local for local dev), the OS config file (desktop), or
  // entered once in Settings (stored in localStorage). Empty on the public build.
  ecommerce_secret: (import.meta.env.VITE_ECOM_SECRET as string) || "",
  telemetry_read_url: "",
  telemetry_sheet_id: "1MZykNN5r-pcelIxVApNZzcPUORshgqGfPRyEsE90vWc",
  orders_sheet_id: "1BeHD5fa6veJDBU2PGSsZ2Sw3If0dxyMQlFPq8os84cQ",
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
