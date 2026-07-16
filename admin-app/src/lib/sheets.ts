/**
 * Read a Google Sheet DIRECTLY as CSV — the proven "oleaf" pattern.
 *
 * The sheet is published "anyone with the link: Viewer" and served from its
 * CSV export endpoint:
 *   https://docs.google.com/spreadsheets/d/<ID>/export?format=csv
 *
 * CORS caveat: Google's CSV export sends NO CORS headers, so a plain browser
 * `fetch` is blocked. We handle it robustly:
 *   (a) Tauri desktop  → fetch via the Rust http bridge (`httpGet` → reqwest),
 *       which is not subject to browser CORS and follows the 307 redirect.
 *   (b) Browser (vite dev / non-Tauri) → route through the VPS read-proxy at
 *       `{vps_base}/api/sheet?id=<ID>`, which fetches the CSV server-side and
 *       returns it as text/csv (same-origin-friendly).
 *
 * When the sheet is not published yet Google returns an HTML sign-in / error
 * page instead of CSV; we detect that (and any fetch failure) and return `[]`
 * so every caller cleanly renders an empty state (never fabricated data).
 */
import { httpGet, runtime } from "./rpc";
import type { AppConfig } from "./config";

/** Direct CSV export URL for a Google Sheet id. */
export function sheetCsvUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
}

/** VPS read-proxy URL for a Google Sheet id (server-side CSV fetch, no CORS). */
export function sheetProxyUrl(vpsBase: string, sheetId: string): string {
  return `${(vpsBase || "").replace(/\/+$/, "")}/api/sheet?id=${encodeURIComponent(sheetId)}`;
}

/**
 * Secret-gated Apps Script read URL for a known sheet id. The Apps Script owns
 * the (private) sheets and serves their rows as JSON via
 * `?action=telemetry|orders&secret=…`, so the sheets never need to be published
 * publicly. Returns "" when the id isn't one of the two known sheets or the
 * Apps Script url/secret isn't configured. `newest last`, capped at `limit`.
 */
export function appsScriptReadUrl(cfg: AppConfig, sheetId: string, limit = 2000): string {
  if (!cfg.ecommerce_url || !cfg.ecommerce_secret || !sheetId) return "";
  let action = "";
  if (sheetId === cfg.telemetry_sheet_id) action = "telemetry";
  else if (sheetId === cfg.orders_sheet_id) action = "orders";
  if (!action) return "";
  const base = cfg.ecommerce_url.replace(/\/+$/, "");
  const q = new URLSearchParams({ action, secret: cfg.ecommerce_secret, limit: String(limit) });
  return `${base}?${q.toString()}`;
}

/** Coerce the Apps Script's header-keyed row objects to Record<string,string>. */
function normalizeRows(rows: unknown): Record<string, string>[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    if (r && typeof r === "object") {
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
        obj[k] = v == null ? "" : typeof v === "string" ? v : String(v);
      }
    }
    return obj;
  });
}

/**
 * Split raw CSV text into a matrix of cells, honouring RFC-4180 quoting:
 * doubled quotes (`""`) inside a quoted field, and commas / newlines embedded
 * inside quoted fields. Tolerates both CRLF and LF line endings.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * Blank trailing lines are dropped. Header cells are trimmed.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const matrix = parseCsvRows(text);
  if (matrix.length === 0) return [];
  const headers = matrix[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (r.length === 1 && r[0].trim() === "") continue; // blank line
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = r[j] ?? "";
    out.push(obj);
  }
  return out;
}

/** Heuristic: Google returns an HTML page (not CSV) when a sheet isn't shared. */
function looksLikeHtml(t: string): boolean {
  const head = t.slice(0, 256).toLowerCase().replace(/^﻿/, "").trimStart();
  return (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.includes("<title>") ||
    head.includes("<!doctype html")
  );
}

/**
 * Fetch a Google Sheet as parsed CSV rows. Never throws: returns `[]` when the
 * sheet is not published yet (HTML response), when the fetch fails, or when the
 * id is blank — so callers render a clean empty state (never fabricated data).
 *
 * In the desktop build we try the direct CSV export first (via the native http
 * bridge) and fall back to the VPS proxy; in the browser we go straight to the
 * proxy because the direct request is CORS-blocked.
 */
export async function fetchSheetRows(
  cfg: AppConfig,
  sheetId: string,
  opts: { timeoutMs?: number } = {},
): Promise<Record<string, string>[]> {
  const { timeoutMs = 12000 } = opts;
  if (!sheetId) return [];

  // 1) Preferred: the secret-gated Apps Script JSON read. Works even though the
  //    sheets are PRIVATE (the script owns them), so nothing needs publishing.
  //    Native http bridge (Tauri) follows the 302 → googleusercontent echo and
  //    isn't CORS-blocked; in the browser this may be blocked, so we still fall
  //    through to the CSV/proxy candidates below.
  const asUrl = appsScriptReadUrl(cfg, sheetId);
  if (asUrl) {
    try {
      const text = await httpGet(asUrl, { timeoutMs });
      if (text && !looksLikeHtml(text)) {
        const data = JSON.parse(text) as { ok?: boolean; rows?: unknown };
        if (data && data.ok && Array.isArray(data.rows)) {
          const rows = normalizeRows(data.rows);
          if (rows.length) return rows;
        }
      }
    } catch {
      /* endpoint not redeployed yet / blocked → fall back to CSV below */
    }
  }

  // 2) Fallback: direct CSV export (Tauri) then the VPS CSV proxy. Only yields
  //    data if the sheet is published "anyone with link: Viewer".
  const proxy = cfg.vps_base ? sheetProxyUrl(cfg.vps_base, sheetId) : "";
  const candidates = runtime.isTauri
    ? [sheetCsvUrl(sheetId), proxy].filter(Boolean)
    : [proxy].filter(Boolean);

  for (const url of candidates) {
    try {
      const text = await httpGet(url, { timeoutMs });
      if (text && !looksLikeHtml(text)) {
        const rows = parseCsv(text);
        if (rows.length) return rows;
      }
    } catch {
      /* try the next candidate, else fall through to [] */
    }
  }
  return [];
}
