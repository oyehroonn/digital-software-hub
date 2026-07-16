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
