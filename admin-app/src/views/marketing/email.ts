/**
 * Email delivery for the Marketing area. Blasts and one-off sends go through the
 * stable Email API via the native `mailcli` bridge (desktop only). Every send —
 * success or failure — is recorded in the marketing send-log so the SendLog view
 * is a complete audit trail.
 *
 * In a plain browser (vite dev, no Tauri shell) there is no mail bridge, so
 * sends are recorded as `simulated` instead of throwing — the composer stays
 * fully testable without spamming anyone.
 */
import { mailcli, runtime } from "@/lib/rpc";
import type { AppConfig } from "@/lib/config";
import { logSends, uid, type SendLogEntry } from "./store";

export interface Recipient {
  email: string;
  name?: string;
}

export interface BlastInput {
  subject: string;
  body: string; // plain text; {{name}} is substituted per recipient
  recipients: Recipient[];
  campaignId?: string;
  campaignName?: string;
  kind?: SendLogEntry["kind"];
  endpoint?: string; // mailcli endpoint (default it@aljashtrading.com)
  onProgress?: (done: number, total: number) => void;
}

export interface BlastResult {
  sent: number;
  failed: number;
  simulated: number;
  batchId: string;
}

function personalize(body: string, r: Recipient): string {
  const name = r.name?.trim() || r.email.split("@")[0];
  return body.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*email\s*\}\}/gi, r.email);
}

/**
 * Send one email per recipient (sequential to stay polite to the mail API),
 * logging each. Returns aggregate counts. Never rejects — transport failures are
 * captured per-recipient in the log.
 */
export async function sendBlast(cfg: AppConfig, input: BlastInput): Promise<BlastResult> {
  const batchId = uid("batch");
  const entries: SendLogEntry[] = [];
  let sent = 0;
  let failed = 0;
  let simulated = 0;
  const total = input.recipients.length;

  for (let i = 0; i < total; i++) {
    const r = input.recipients[i];
    const base: Omit<SendLogEntry, "status"> = {
      id: uid("log"),
      at: Date.now(),
      kind: input.kind ?? (total > 1 ? "blast" : "single"),
      subject: input.subject,
      to: r.email,
      campaignId: input.campaignId,
      campaignName: input.campaignName,
      batchId,
    };

    if (!runtime.isTauri) {
      simulated++;
      entries.push({ ...base, status: "simulated" });
    } else {
      try {
        await mailcli(
          cfg.email_cli,
          "sendEmail",
          { to: r.email, subject: input.subject, body: personalize(input.body, r) },
          input.endpoint,
        );
        sent++;
        entries.push({ ...base, status: "sent" });
      } catch (e) {
        failed++;
        entries.push({ ...base, status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }
    input.onProgress?.(i + 1, total);
  }

  logSends(entries);
  return { sent, failed, simulated, batchId };
}
