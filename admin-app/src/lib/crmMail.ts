/**
 * Outbound campaigns for the CRM — renewal nudges and win-back offers.
 *
 * Templates are PURE and deterministic (always available, no backend). Sending
 * routes through the STABLE Email API via the native `mailcli` bridge; in a
 * plain browser (no Tauri) send is unavailable and callers degrade to a copy /
 * preview flow. An optional LLM polish step (VPS `/api/llm/chat/completions`)
 * is best-effort: any failure silently returns the deterministic draft, obeying
 * the resilience contract (never block, never break).
 */
import { mailcli, httpPost, runtime } from "./rpc";
import { fmtMoney } from "./utils";
import type { AppConfig } from "./config";
import type { Customer, License, WinBackEntry } from "./crm";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  /** What this draft is for — used for logging / grouping. */
  kind: "renewal" | "winback";
  ref: string; // license id / customer email
}

export interface SendResult {
  to: string;
  ok: boolean;
  detail: string;
}

const FROM_SIGNOFF = "\n\n— The DSM Team\nAljash Trading · it@aljashtrading.com";

function firstName(name: string): string {
  const n = (name || "").trim().split(/\s+/)[0];
  return n || "there";
}

/** Renewal nudge for a single expiring / expired licence. */
export function composeRenewalEmail(license: License, customerName?: string): EmailDraft {
  const name = firstName(customerName ?? license.customerName);
  const product = license.productName + (license.edition ? ` ${license.edition}` : "");
  const expired = license.status === "expired";
  const when = license.expiresAt ? new Date(license.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "soon";
  const subject = expired
    ? `Your ${product} licence has lapsed — reactivate in one click`
    : `Your ${product} licence renews ${when}`;
  const lead = expired
    ? `We noticed your ${product} licence expired on ${when}. Your projects and settings are still safe — reactivating brings everything back exactly as you left it.`
    : `A quick heads-up: your ${product} licence is up for renewal on ${when}. Renew now and there's zero interruption to your work.`;
  const seats = license.seats > 1 ? `\n\nThis covers your ${license.seats} seats.` : "";
  const body =
    `Hi ${name},\n\n` +
    `${lead}${seats}\n\n` +
    `Renewing takes under a minute — just reply to this email or hit the link in your account and we'll handle the rest. ` +
    `If your team has grown, we can roll extra seats into the same renewal at a better per-seat rate.\n\n` +
    `Want to talk it through first? Reply with a good time and we'll call you.` +
    FROM_SIGNOFF;
  return { to: license.customerEmail, subject, body, kind: "renewal", ref: license.id };
}

/** Win-back offer for a lapsed customer. */
export function composeWinBackEmail(entry: WinBackEntry): EmailDraft {
  const c = entry.customer;
  const name = firstName(c.name);
  const spent = c.totalSpend > 0 ? ` As a valued customer (you've invested ${fmtMoney(c.totalSpend, c.currency)} with us)` : "";
  const subject = `We'd love to have you back, ${name}`;
  const body =
    `Hi ${name},\n\n` +
    `It's been a while!${spent}, we wanted to reach out personally.\n\n` +
    `A lot has shipped since you last logged in — faster rendering, new virtual try-on tooling, and licensing that's simpler than ever. ` +
    `We'd like to offer you a returning-customer discount and a free migration of your old projects.\n\n` +
    `Reply to this email and we'll set you up — no pressure, no long forms.` +
    FROM_SIGNOFF;
  return { to: c.email, subject, body, kind: "winback", ref: c.email };
}

/** Build a full renewal campaign for a set of licences. */
export function buildRenewalCampaign(licenses: License[], customers: Customer[]): EmailDraft[] {
  const nameByEmail = new Map(customers.map((c) => [c.email, c.name]));
  return licenses
    .filter((l) => l.customerEmail)
    .map((l) => composeRenewalEmail(l, nameByEmail.get(l.customerEmail)));
}

export function buildWinBackCampaign(entries: WinBackEntry[]): EmailDraft[] {
  return entries.filter((e) => e.customer.email).map(composeWinBackEmail);
}

/**
 * Optionally polish a draft with the LLM. Best-effort: returns the original body
 * unchanged on any failure / timeout / non-Tauri browser CORS block.
 */
export async function aiPolish(cfg: AppConfig, draft: EmailDraft): Promise<string> {
  const url = `${cfg.vps_base}/api/llm/chat/completions`;
  const payload = {
    model: cfg.codex_model || "gpt-5.4",
    messages: [
      {
        role: "system",
        content:
          "You are a concise B2B sales copywriter for DSM (3D design software). Rewrite the email to be warm, specific and under 130 words. Keep the subject intent. Return ONLY the email body, no preamble.",
      },
      { role: "user", content: `Subject: ${draft.subject}\n\n${draft.body}` },
    ],
    temperature: 0.6,
  };
  try {
    const text = await httpPost(url, JSON.stringify(payload), "application/json", { timeoutMs: 8000 });
    const data = JSON.parse(text);
    const out = data?.choices?.[0]?.message?.content;
    return typeof out === "string" && out.trim().length > 20 ? out.trim() : draft.body;
  } catch {
    return draft.body;
  }
}

/** True when the Email API can actually send (desktop app only). */
export function canSend(): boolean {
  return runtime.isTauri;
}

/**
 * Send a campaign through the Email API. Sends sequentially so a partial failure
 * still delivers the rest. Rejects only if the native bridge is unavailable.
 */
export async function sendCampaign(cfg: AppConfig, drafts: EmailDraft[]): Promise<SendResult[]> {
  if (!runtime.isTauri) throw new Error("Email sending is only available in the desktop app");
  const results: SendResult[] = [];
  for (const d of drafts) {
    if (!d.to) {
      results.push({ to: d.to, ok: false, detail: "no email on file" });
      continue;
    }
    try {
      await mailcli(cfg.email_cli, "sendEmail", { to: d.to, subject: d.subject, body: d.body });
      results.push({ to: d.to, ok: true, detail: "sent" });
    } catch (e) {
      results.push({ to: d.to, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** A `mailto:` link fallback for the browser / manual send. */
export function mailtoLink(draft: EmailDraft): string {
  const params = new URLSearchParams({ subject: draft.subject, body: draft.body });
  return `mailto:${draft.to}?${params.toString()}`;
}
