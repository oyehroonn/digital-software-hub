/**
 * Client for the dsm-files-api gateway's staging/merge-request admin
 * endpoints (`GET /admin/merge-requests`, `POST /admin/merge-requests/<id>/
 * approve|reject`) — added 2026-09-24 alongside the Agent File Gateway's
 * STAGING-ONLY deploy infra (stageN branches/worktrees, `POST /api/staging/
 * request`, `POST /api/deploy`; see ~/.rpidrive/notes/dsm-sites-filesystem.md
 * and the "Agent File Gateway" section of the DSM rebrand-scope memory).
 *
 * Auth: the SAME static secret as everything else in this file
 * (`config.ecommerce_secret`, i.e. the DSM Analytics API's admin secret) —
 * mirrors apiTokens.ts's admin_key_ok() pattern exactly. dsm-files-api's
 * `/admin/*` routes check this against their own `DSM_ADMIN_KEY` env var
 * (same value), never against a minted filesystem token, so an agent
 * token — however permissive — can never approve/reject a merge request.
 *
 * IMPORTANT — "Approve & Merge to Production" is REAL: it triggers an
 * actual `git merge` into `main` (+ a real GitHub push for beta/creatives,
 * or a real `wrangler pages deploy --branch=main` for agentic/marketing).
 * There is no simulate/dry-run mode. Only click it when you mean it.
 */
import type { AppConfig } from "./config";

export const FILES_GATEWAY_URL = "https://dsm-files.waleeds.world";

export type MergeRequestStatus = "pending" | "merged" | "rejected" | "failed";

export interface MergeRequest {
  id: string;
  workspace: string;
  stage: number;
  branch: string;
  token_id_prefix: string;
  created_at: string;
  git_diff: string;
  staging_url: string;
  pages_deploy_url?: string | null;
  head_sha?: string | null;
  ahead?: number | null;
  status: MergeRequestStatus;
  dns_status?: { dns_record: string; pages_domain: string } | null;
  dns_error?: string | null;
  reject_reason?: string;
  merge_error?: string;
  merge_result?: Record<string, unknown>;
  resolved_at?: string;
}

function base(): string {
  return FILES_GATEWAY_URL.replace(/\/+$/, "");
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

export async function listMergeRequests(cfg: AppConfig): Promise<MergeRequest[]> {
  if (!cfg.ecommerce_secret) return [];
  const url = withSecret(`${base()}/admin/merge-requests`, cfg);
  const res = await fetch(url, { method: "GET" });
  const data = await asJson<{ merge_requests: MergeRequest[] }>(res);
  return data.merge_requests ?? [];
}

/** REAL merge-to-production. See the module docstring — no dry-run exists. */
export async function approveMergeRequest(cfg: AppConfig, id: string): Promise<{ result: Record<string, unknown> }> {
  const url = withSecret(`${base()}/admin/merge-requests/${encodeURIComponent(id)}/approve`, cfg);
  const res = await fetch(url, { method: "POST" });
  return asJson(res);
}

export async function rejectMergeRequest(cfg: AppConfig, id: string, reason?: string): Promise<{ merge_request: MergeRequest }> {
  const url = withSecret(`${base()}/admin/merge-requests/${encodeURIComponent(id)}/reject`, cfg);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: reason || "" }),
  });
  return asJson(res);
}
