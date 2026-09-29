/**
 * Client for dsm-analytics-api's waleed_ai campaign-ops approval endpoints
 * (`GET /api/campaign-ops/approvals`, `POST /api/campaign-ops/approve`,
 * `POST /api/campaign-ops/dismiss`) — added 2026-09-29 as the human-approval
 * layer on top of the read-only daily-prepare job described in
 * ~/.rpidrive/notes/dsm-waleed-ai-campaign-ops.md.
 *
 * Auth: the SAME static secret as everything else in this file
 * (`config.ecommerce_secret`) — mirrors stagingApi.ts's pattern exactly.
 * dsm-analytics-api's routes check this against its own ANALYTICS_READ_KEY
 * env var (`read_key_ok()`), same as `/api/campaign-ops/status`.
 *
 * IMPORTANT — "Approve & Send" is REAL: it creates a brand-new
 * ActiveCampaign list scoped to just that one small test batch, adds the
 * selected real contacts to it, and sends them a real campaign
 * immediately. There is no dry-run/simulate mode on the server. Only call
 * approveCampaignBatch() when the admin has explicitly clicked the button —
 * see campaign_send.py on the VPS for the full guardrail list (suppression
 * filter, hard volume cap, fresh per-batch list so lists 35/36 are never
 * polluted).
 */
import type { AppConfig } from "./config";

export const CAMPAIGN_OPS_API_URL = "https://dsm-analytics.waleeds.world";

export type TrackListKind = "warm" | "cold";
export type ApprovalRunStatus = "in_progress" | "sent" | "failed";

export interface CampaignApprovalLogEntry {
  id: string;
  track_id: string;
  requested_at: string;
  completed_at?: string;
  volume_requested: number;
  candidates_matched?: number;
  suppressed_removed?: number;
  selected_count?: number;
  contacts_added?: number;
  subject?: string;
  ac_list_id?: number;
  ac_message_id?: number;
  ac_campaign_id?: number;
  recipient_emails?: string[];
  status: ApprovalRunStatus;
  error?: string;
}

export interface CampaignDismissedEntry {
  track_id: string;
  dismissed_at: string;
  reason?: string;
}

export interface CampaignTrackContent {
  subject: string;
  preview_text: string;
  html: string;
  text: string;
  banner_fragment: string;
}

export interface CampaignTrack {
  track_id: string;
  purpose: string;
  list_kind: TrackListKind;
  ac_list_id: number;
  ac_list_name: string;
  segment_size: number | null;
  default_test_volume: number;
  max_test_volume: number;
  suppression_applies: boolean;
  content: CampaignTrackContent | null;
  content_error: string | null;
  history: CampaignApprovalLogEntry[];
  dismissed: CampaignDismissedEntry[];
  last_status: ApprovalRunStatus | "never_run";
}

export interface CampaignApprovalsFeed {
  ok: boolean;
  service: string;
  initiative: string;
  nothing_sent_disclaimer: string;
  tracks: CampaignTrack[];
  time: string;
}

function base(): string {
  return CAMPAIGN_OPS_API_URL.replace(/\/+$/, "");
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

export async function fetchCampaignApprovals(cfg: AppConfig): Promise<CampaignApprovalsFeed> {
  if (!cfg.ecommerce_secret) {
    return {
      ok: false,
      service: "dsm-campaign-ops",
      initiative: "waleed_ai",
      nothing_sent_disclaimer: "",
      tracks: [],
      time: "",
    };
  }
  const url = withSecret(`${base()}/api/campaign-ops/approvals`, cfg);
  const res = await fetch(url, { method: "GET" });
  return asJson<CampaignApprovalsFeed>(res);
}

/**
 * REAL send. See the module docstring — there is no simulate mode. `volume`
 * is clamped server-side to the track's max_test_volume regardless of what
 * is passed here.
 */
export async function approveCampaignBatch(
  cfg: AppConfig,
  trackId: string,
  volume: number,
): Promise<{ ok: boolean; result: CampaignApprovalLogEntry }> {
  const url = withSecret(`${base()}/api/campaign-ops/approve`, cfg);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, volume, confirm: true }),
  });
  return asJson(res);
}

/** No side effects — just records that this track's current batch was dismissed. */
export async function dismissCampaignBatch(cfg: AppConfig, trackId: string, reason?: string): Promise<{ ok: boolean }> {
  const url = withSecret(`${base()}/api/campaign-ops/dismiss`, cfg);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId, reason: reason || "" }),
  });
  return asJson(res);
}
