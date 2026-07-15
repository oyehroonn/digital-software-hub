/**
 * Email proxy client — INSTANT transactional email from the browser.
 * ------------------------------------------------------------------
 * The browser must never hold the mail secret, so it POSTs to a same-origin (or
 * VITE_API_BASE) proxy route `POST {base}/api/email` that injects the key
 * server-side and forwards to the STABLE email Apps Script (see
 * `3dstuff/api.py` → `/api/email`, which posts to the Google Apps Script mail
 * web-app — the same stable backend `mailcli.py` wraps). The unstable VPS Flask
 * only *proxies*; the durable delivery is the stable Apps Script.
 *
 * Resilience: this is treated as best-effort. The DURABLE record of a checkout
 * is the order row on the STABLE Ecommerce Apps Script (see `submitOrder`); the
 * email here is a nicety (a purchase link, or a meeting invite). Callers should
 * `catch` and continue — a failed email must never block the confirmation.
 *
 *   POST {base}/api/email
 *   body: { to, subject, body }
 *   → { ok: boolean, status?: number, error?: string }
 */

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

/**
 * Proxy base. Defaults to `{VITE_API_BASE}/api/email`; falls back to a
 * same-origin `/api/email` when no API base is configured. Override with
 * VITE_EMAIL_PROXY_URL.
 */
export const EMAIL_PROXY_URL: string =
  (import.meta.env.VITE_EMAIL_PROXY_URL as string | undefined) ??
  `${API_BASE.replace(/\/$/, '')}/api/email`;

export interface ProxyEmail {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProxyResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Send a transactional email through the proxy. Never throws — returns
 * `{ ok:false, error }` on any failure so callers can degrade gracefully.
 */
export async function sendProxyEmail(
  msg: ProxyEmail,
  opts: { timeoutMs?: number } = {},
): Promise<EmailProxyResult> {
  const to = msg.to?.trim();
  if (!to) return { ok: false, error: "missing 'to'" };

  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timer = controller
    ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000)
    : undefined;

  try {
    const res = await fetch(EMAIL_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject: msg.subject, body: msg.body }),
      signal: controller?.signal,
    });
    let ok = res.ok;
    try {
      const data = (await res.json()) as EmailProxyResult;
      ok = ok && data.ok !== false;
      return { ok, status: res.status, error: data.error };
    } catch {
      return { ok, status: res.status };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
