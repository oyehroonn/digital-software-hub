/**
 * Bridge to the Rust (Tauri) backend. All network + shell calls go through the
 * native layer so we avoid browser CORS and keep secrets out of the JS bundle.
 *
 * When running under `vite dev` in a plain browser (no Tauri), we fall back to
 * `fetch` so the UI is still developable — secrets then come from local config.
 */

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

let _invoke: InvokeFn | null = null;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!_invoke) {
    const mod = await import("@tauri-apps/api/core");
    _invoke = mod.invoke as InvokeFn;
  }
  return _invoke<T>(cmd, args);
}

export interface HttpOpts {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function httpGet(url: string, opts: HttpOpts = {}): Promise<string> {
  const { timeoutMs = 8000, headers } = opts;
  if (isTauri) return invoke<string>("http_get", { url, timeoutMs, headers: headers ?? null });
  return browserFetch(url, { method: "GET", headers }, timeoutMs);
}

export async function httpPost(
  url: string,
  body: string,
  contentType = "application/json",
  opts: HttpOpts = {},
): Promise<string> {
  const { timeoutMs = 15000, headers } = opts;
  if (isTauri)
    return invoke<string>("http_post", {
      url,
      body,
      contentType,
      timeoutMs,
      headers: headers ?? null,
    });
  return browserFetch(
    url,
    { method: "POST", body, headers: { "Content-Type": contentType, ...(headers ?? {}) } },
    timeoutMs,
  );
}

async function browserFetch(url: string, init: RequestInit, timeoutMs: number): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Run the mailcli helper (Email API) via the native shell. Tauri-only. */
export async function mailcli(
  cliPath: string,
  action: string,
  payload?: unknown,
  endpoint?: string,
): Promise<string> {
  if (!isTauri) throw new Error("Email API is only available in the desktop app");
  return invoke<string>("mailcli", {
    cliPath,
    action,
    payload: payload == null ? null : JSON.stringify(payload),
    endpoint: endpoint ?? null,
  });
}

export const runtime = { isTauri };
export { invoke };
