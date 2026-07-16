/**
 * Approvals — fulfilment side-effects for the APPROVE flow.
 *
 * On approve, three things happen (each isolated + independently reported):
 *   1. createMemberAccount — POST an Exclusive Member record to the STABLE
 *      ecommerce Apps Script (server-side via the native http bridge so no CORS
 *      and the secret never touches the JS bundle).
 *   2. sendApprovalEmail — deliver the approved quote/price + member login
 *      credentials + welcome copy through the STABLE Email API (mailcli, native
 *      only). In a plain browser (vite dev) it degrades to copy-to-clipboard +
 *      opening the mail client, then optionally the VPS /api/email — the
 *      workflow never dead-ends.
 *   3. the caller marks the request approved in the local overlay.
 *
 * Everything is defensive: a failure in one step is reported, never thrown past
 * the orchestrator, so a half-completed approval is visible and retryable.
 */
import type { AppConfig } from "@/lib/config";
import { mailcli, httpPost, runtime } from "@/lib/rpc";
import { fmtMoney } from "@/lib/utils";
import type { ApprovalRequest, MemberCreds } from "./approvalsData";

/* ------------------------------------------------------------------ *
 * 1 — Member account creation (ecommerce Apps Script)
 * ------------------------------------------------------------------ */

export interface StepResult {
  ok: boolean;
  detail: string;
}

export interface MemberRecord {
  storeName: string;
  customerName: string;
  email: string;
  phone: string;
  memberCode: string;
  plan: string;
  productName: string;
  price: number;
  currency: string;
  notes: string;
}

/**
 * Write the member/order record to the ecommerce Apps Script. Sends a `member`
 * typed payload PLUS the standard order fields so the row is meaningful whether
 * or not the script has a dedicated member handler. Rejects on transport
 * failure so the orchestrator can report it.
 */
export async function createMemberAccount(cfg: AppConfig, m: MemberRecord): Promise<StepResult> {
  const payload = {
    type: "member",
    secret: cfg.ecommerce_secret,
    storeName: m.storeName,
    customerName: m.customerName,
    email: m.email,
    phone: m.phone,
    memberCode: m.memberCode,
    plan: m.plan,
    membership: "DSM Exclusive Member",
    // Mirror order fields so a plain order-sheet append still records the sale.
    productId: "",
    productName: m.productName,
    sku: m.memberCode,
    quantity: 1,
    price: m.price,
    currency: m.currency,
    status: "member-approved",
    notes: m.notes,
  };
  try {
    const text = await httpPost(
      cfg.ecommerce_url,
      JSON.stringify(payload),
      "text/plain;charset=utf-8",
      { timeoutMs: 12000 },
    );
    // Apps Script commonly answers {result:"success"} or plain text; treat a
    // non-error transport as success unless it clearly says otherwise.
    const low = (text || "").toLowerCase();
    if (low.includes("error") || low.includes("unauthor") || low.includes("denied")) {
      return { ok: false, detail: text.slice(0, 200) || "Apps Script rejected the record." };
    }
    return { ok: true, detail: "Member account recorded in the ecommerce sheet." };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Could not reach the ecommerce Apps Script." };
  }
}

/* ------------------------------------------------------------------ *
 * 2 — Welcome / approved-quote email
 * ------------------------------------------------------------------ */

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

const SIGNOFF = "\n\nWarm regards,\nThe DSM Solutions Team\nsales@dsmsolutions.com.au";

/** Compose the "you're approved + here's your login" welcome email. */
export function composeApprovalEmail(
  req: ApprovalRequest,
  quote: { price: number; currency: string },
  creds: MemberCreds,
): Draft {
  const name = (req.customerName || "there").split(/\s+/)[0];
  const product = req.productName || "your DSM solution";
  const priceLine = quote.price > 0 ? fmtMoney(quote.price, quote.currency) : "included with your membership";
  const lines = [
    `Hi ${name},`,
    "",
    "Great news — your request has been approved and your tailored quote is ready. Welcome aboard: you are now a DSM Exclusive Member.",
    "",
    "Your approved quote",
    `  Product      : ${product}${req.sku ? ` (${req.sku})` : ""}`,
    req.quantity > 1 ? `  Quantity     : ${req.quantity}` : "",
    `  Approved price: ${priceLine}`,
    "  Validity     : 30 days · onboarding support & free updates included",
    "",
    "Your Exclusive Member login",
    `  Member code  : ${creds.memberCode}`,
    `  Temp password: ${creds.memberPassword}`,
    `  Sign in here : ${creds.loginUrl}`,
    "",
    "Signing in unlocks member pricing, priority support and your licence downloads. You'll be asked to set your own password on first login.",
    "",
    "As a DSM Exclusive Member you get first access to new releases, member-only rates and a dedicated specialist. Reply to this email any time and we'll help you get set up the same day.",
  ].filter((l) => l !== "");
  return {
    to: req.email,
    subject: `You're approved — welcome to DSM Exclusive Membership (${creds.memberCode})`,
    body: lines.join("\n") + SIGNOFF,
  };
}

export interface SendResult extends StepResult {
  via: "email-api" | "vps" | "clipboard" | "none";
}

/**
 * Send the welcome email. Native → Email API (mailcli). Browser → try the VPS
 * /api/email endpoint, else copy to clipboard + open the mail client. Never
 * dead-ends.
 */
export async function sendApprovalEmail(cfg: AppConfig, draft: Draft): Promise<SendResult> {
  if (!draft.to) return { ok: false, via: "none", detail: "No recipient email on this request." };

  if (runtime.isTauri) {
    try {
      const out = await mailcli(cfg.email_cli, "sendEmail", {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      });
      return { ok: true, via: "email-api", detail: out || "Welcome email sent via the Email API." };
    } catch (e) {
      return { ok: false, via: "none", detail: e instanceof Error ? e.message : "Email API failed." };
    }
  }

  // Browser: attempt the VPS /api/email relay (best-effort, may be down).
  if (cfg.vps_base) {
    try {
      const text = await httpPost(
        `${cfg.vps_base.replace(/\/+$/, "")}/api/email`,
        JSON.stringify({ to: draft.to, subject: draft.subject, body: draft.body }),
        "application/json",
        { timeoutMs: 8000 },
      );
      const low = (text || "").toLowerCase();
      if (!low.includes("error") && !low.includes("fail")) {
        return { ok: true, via: "vps", detail: "Welcome email sent via the VPS relay." };
      }
    } catch {
      /* fall through to clipboard */
    }
  }

  const copied = await copyToClipboard(`To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}`);
  try {
    const href = `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(
      draft.subject,
    )}&body=${encodeURIComponent(draft.body)}`;
    window.open(href, "_blank");
  } catch {
    /* ignore */
  }
  return {
    ok: copied,
    via: "clipboard",
    detail: copied
      ? "Desktop app not detected — welcome email copied to clipboard and mail client opened."
      : "Could not send or copy the welcome email.",
  };
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/* ------------------------------------------------------------------ *
 * 3 — Orchestrated approve (account → email → report)
 * ------------------------------------------------------------------ */

export interface ApproveOutcome {
  creds: MemberCreds;
  quote: { price: number; currency: string };
  account: StepResult;
  email: SendResult;
  draft: Draft;
  /** Both side-effects succeeded. */
  ok: boolean;
}

/**
 * Run the full approve flow for one request: create the Exclusive Member
 * account, then email the approved quote + credentials + welcome copy. Returns
 * a per-step outcome the caller persists into the decision overlay + surfaces as
 * toasts. Never throws.
 */
export async function runApproval(
  cfg: AppConfig,
  req: ApprovalRequest,
  quote: { price: number; currency: string },
  creds: MemberCreds,
): Promise<ApproveOutcome> {
  const account = await createMemberAccount(cfg, {
    storeName: "DSM Solutions",
    customerName: req.customerName,
    email: req.email,
    phone: req.phone,
    memberCode: creds.memberCode,
    plan: "DSM Exclusive Member",
    productName: req.productName,
    price: quote.price,
    currency: quote.currency,
    notes: `Approved from ${req.source} request. ${req.details}`.trim(),
  });

  const draft = composeApprovalEmail(req, quote, creds);
  const email = await sendApprovalEmail(cfg, draft);

  return { creds, quote, account, email, draft, ok: account.ok && email.ok };
}
