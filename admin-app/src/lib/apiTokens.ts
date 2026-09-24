/**
 * Client for the DSM Analytics API's token-management endpoints
 * (`POST /tokens`, `GET /tokens`, `DELETE /tokens/<id>`) — added 2026-09-24 so
 * external agents/sessions can be handed a scoped, revocable token instead of
 * the one permanent `ecommerce_secret` (`VITE_ECOM_SECRET`).
 *
 * Auth for all three calls is the EXISTING static read key (`config.
 * ecommerce_secret`) — the backend's `admin_key_ok()` checks only that static
 * secret, never a minted token, so a short-lived token handed to an agent can
 * never be used to mint or revoke other tokens. This mirrors why the admin
 * app itself is the only place that can reach these endpoints.
 *
 * Plain `fetch` (not the Tauri http bridge used in lib/sheets.ts) is fine
 * here — unlike Google Sheets' CSV export, this API is ours and already sends
 * CORS headers (see `add_cors` in api.py), so it works the same from the
 * desktop webview and the browser dev server.
 */
import type { AppConfig } from "./config";

export type TokenType = "short_lived" | "always_on";
export type TokenStatus = "active" | "expired" | "revoked";
/** Added 2026-09-24 alongside the dsm-files Agent File Gateway. "analytics"
 * (the default/omitted case, for every token minted before scopes existed)
 * is the original behavior — usable as `?secret=` against this API's own
 * read endpoints. "filesystem" tokens are validated the same way (same
 * store, same hash check, same active/expired/revoked rules) but only by
 * the separate dsm-files-api gateway — see dsm-sites-filesystem.md. */
export type TokenScope = "analytics" | "filesystem";
export type FilesystemPermission = "read" | "create" | "write" | "rename" | "delete";
export const FILESYSTEM_WORKSPACES = ["beta", "agentic", "marketing", "creatives"] as const;

/** Public, secret-free hosted docs — served directly off the two gateways,
 * no Cloudflare Access gate, so an external browser-only agent can fetch
 * them without an email-OTP login. */
export const FILES_GATEWAY_URL = "https://dsm-files.waleeds.world";
export const FILES_DOC_URL = `${FILES_GATEWAY_URL}/docs/dsm-sites-filesystem.md`;
export const ANALYTICS_DOC_URL = `${FILES_GATEWAY_URL}/docs/dsm-analytics-access-public.md`;

export interface TokenRecord {
  id: string;
  label: string;
  type: TokenType;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  status: TokenStatus;
  scope?: TokenScope;
  workspaces?: string[];
  permissions?: FilesystemPermission[];
}

export interface MintedToken extends TokenRecord {
  /** The raw token value — only ever present in the response to the mint
   * call itself. Never returned by GET /tokens. */
  token: string;
}

function base(cfg: AppConfig): string {
  return (cfg.ecommerce_url || "").replace(/\/+$/, "");
}

function withSecret(url: string, cfg: AppConfig): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}secret=${encodeURIComponent(cfg.ecommerce_secret || "")}`;
}

async function asJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  const obj = data as { ok?: boolean; error?: string };
  if (!res.ok || obj.ok === false) {
    throw new Error(obj.error || `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

/** List every minted token (raw values are never included). */
export async function listTokens(cfg: AppConfig): Promise<TokenRecord[]> {
  if (!cfg.ecommerce_url || !cfg.ecommerce_secret) return [];
  const url = withSecret(`${base(cfg)}/tokens`, cfg);
  const res = await fetch(url, { method: "GET" });
  const data = await asJson<{ tokens: TokenRecord[] }>(res);
  return data.tokens ?? [];
}

export interface MintTokenOptions {
  ttlMinutes?: number;
  /** Defaults to "analytics" (the original, pre-scope behavior) when omitted. */
  scope?: TokenScope;
  /** Only meaningful for scope: "filesystem". Defaults server-side to all 4
   * workspaces when omitted. */
  workspaces?: string[];
  /** Only meaningful for scope: "filesystem". Defaults server-side to
   * read+create+write+rename (no delete) when omitted. */
  permissions?: FilesystemPermission[];
}

/** Mint a token. Returns the raw value — shown once, never recoverable after. */
export async function mintToken(
  cfg: AppConfig,
  type: TokenType,
  label: string,
  ttlMinutesOrOptions?: number | MintTokenOptions,
): Promise<MintedToken> {
  const opts: MintTokenOptions =
    typeof ttlMinutesOrOptions === "number" ? { ttlMinutes: ttlMinutesOrOptions } : ttlMinutesOrOptions ?? {};
  const url = withSecret(`${base(cfg)}/tokens`, cfg);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      label,
      ...(type === "short_lived" && opts.ttlMinutes ? { ttl_minutes: opts.ttlMinutes } : {}),
      ...(opts.scope ? { scope: opts.scope } : {}),
      ...(opts.workspaces ? { workspaces: opts.workspaces } : {}),
      ...(opts.permissions ? { permissions: opts.permissions } : {}),
    }),
  });
  const data = await asJson<{ token: MintedToken }>(res);
  return data.token;
}

/** Mints BOTH an all-workspace filesystem token (read+create+write+rename,
 * no delete) and an analytics token in one shot — what the admin UI's
 * "Mint agent bundle" button uses to produce the two ready-to-copy blocks
 * for an AI agent's context. */
export async function mintAgentBundle(
  cfg: AppConfig,
  type: TokenType,
  label: string,
  ttlMinutes?: number,
): Promise<{ filesystem: MintedToken; analytics: MintedToken }> {
  const filesystem = await mintToken(cfg, type, `${label} (filesystem)`, {
    ttlMinutes,
    scope: "filesystem",
    workspaces: [...FILESYSTEM_WORKSPACES],
    permissions: ["read", "create", "write", "rename"],
  });
  const analytics = await mintToken(cfg, type, `${label} (analytics)`, { ttlMinutes, scope: "analytics" });
  return { filesystem, analytics };
}

/** Revoke a token by id. Idempotent. */
export async function revokeToken(cfg: AppConfig, id: string): Promise<void> {
  const url = withSecret(`${base(cfg)}/tokens/${encodeURIComponent(id)}`, cfg);
  const res = await fetch(url, { method: "DELETE" });
  await asJson<{ revoked: boolean }>(res);
}

/** A ready-to-paste example call using this token, for the reveal-once box. */
export function usageSnippet(cfg: AppConfig, token: string): string {
  const url = `${base(cfg)}/?action=orders&secret=${token}`;
  return `curl "${url}"`;
}

/** Same idea, for a filesystem-scoped token against the dsm-files gateway. */
export function filesystemUsageSnippet(token: string): string {
  return `curl -H "Authorization: Bearer ${token}" "${FILES_GATEWAY_URL}/api/files?workspace=beta&path=/"`;
}
