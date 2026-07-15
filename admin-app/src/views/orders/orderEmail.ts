/**
 * Quote / recovery email builders + send.
 *
 * Sending goes through the STABLE Email API (mailcli, native only). When the
 * desktop shell isn't present (vite dev in a browser) we degrade to copying the
 * composed email to the clipboard and opening the user's mail client — the
 * workflow never dead-ends.
 *
 * Body drafting can optionally use the LLM (codex-proxy) for a warmer, tailored
 * message; if the LLM is unhealthy or slow it falls back to a solid template.
 */
import type { AppConfig } from "@/lib/config";
import { mailcli, httpPost, runtime } from "@/lib/rpc";
import { fmtMoney } from "@/lib/utils";
import type { Order } from "@/lib/ecommerce";
import { orderValue, orderCurrency } from "./ordersData";

export interface Draft {
  to: string;
  subject: string;
  body: string;
}

const SIGNOFF = "\n\nWarm regards,\nThe DSM Solutions Team\nsales@dsmsolutions.com.au";

/* ------------------------------------------------------------------ *
 * Templates (always available — no backend needed)
 * ------------------------------------------------------------------ */
export function quoteTemplate(o: Order): Draft {
  const cur = orderCurrency(o);
  const qty = parseFloat(String(o.quantity ?? 1)) || 1;
  const unit = orderValue(o) / qty;
  const total = orderValue(o);
  const name = (o.customerName || "there").split(" ")[0];
  const product = o.productName || o.sku || "your selected solution";
  const lines = [
    `Hi ${name},`,
    "",
    `Thank you for your interest in ${product}. Here is your tailored quote:`,
    "",
    `  Product   : ${product}${o.sku ? ` (${o.sku})` : ""}`,
    `  Quantity  : ${qty}`,
    `  Unit price: ${fmtMoney(unit, cur)}`,
    `  Total     : ${fmtMoney(total, cur)}`,
    "",
    "This quote is valid for 30 days and includes onboarding support and free updates for the license term. Reply to this email and we'll get you set up the same day.",
  ];
  return {
    to: o.email || "",
    subject: `Your DSM quote for ${product} — ${fmtMoney(total, cur)}`,
    body: lines.join("\n") + SIGNOFF,
  };
}

export function recoveryTemplate(opts: {
  email: string;
  productName?: string;
  value?: number;
  currency?: string;
}): Draft {
  const cur = opts.currency || "AUD";
  const product = opts.productName || "the items in your cart";
  const lines = [
    "Hi there,",
    "",
    `We noticed you were setting up ${product} but didn't finish checking out. No problem — your cart is saved and ready when you are.`,
    "",
    opts.value ? `  Your cart total: ${fmtMoney(opts.value, cur)}` : "",
    "",
    "As a thank-you for coming back, reply with code WELCOME10 for 10% off your first license. Need a hand choosing the right edition? Just hit reply and a specialist will help.",
  ].filter((l) => l !== "");
  return {
    to: opts.email,
    subject: `Still thinking it over? Your DSM cart is saved${opts.value ? ` — ${fmtMoney(opts.value, cur)}` : ""}`,
    body: lines.join("\n") + SIGNOFF,
  };
}

/* ------------------------------------------------------------------ *
 * Optional LLM polish (degrades to the template on any failure)
 * ------------------------------------------------------------------ */
export async function draftWithLLM(
  config: AppConfig,
  fallback: Draft,
  instruction: string,
): Promise<Draft> {
  if (!config.codex_key) return fallback;
  try {
    const payload = {
      model: config.codex_model,
      messages: [
        {
          role: "system",
          content:
            "You are a concise B2B sales assistant for DSM Solutions. Rewrite the email body to be warm, specific and persuasive without being pushy. Keep it under 160 words. Return ONLY the email body text, no subject line, no preamble.",
        },
        { role: "user", content: `${instruction}\n\nCurrent draft body:\n${fallback.body}` },
      ],
      temperature: 0.6,
    };
    const text = await httpPost(
      `${config.codex_base}/chat/completions`,
      JSON.stringify(payload),
      "application/json",
      { timeoutMs: 9000, headers: { Authorization: `Bearer ${config.codex_key}` } },
    );
    const data = JSON.parse(text);
    const body = data?.choices?.[0]?.message?.content;
    if (typeof body === "string" && body.trim().length > 20) {
      return { ...fallback, body: body.trim() };
    }
  } catch {
    /* fall through to template */
  }
  return fallback;
}

/* ------------------------------------------------------------------ *
 * Send / copy
 * ------------------------------------------------------------------ */
export interface SendResult {
  ok: boolean;
  via: "email-api" | "clipboard" | "none";
  detail: string;
}

export async function sendDraft(config: AppConfig, draft: Draft): Promise<SendResult> {
  if (!draft.to) return { ok: false, via: "none", detail: "No recipient email on this record." };
  if (runtime.isTauri) {
    try {
      const out = await mailcli(config.email_cli, "sendEmail", {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
      });
      return { ok: true, via: "email-api", detail: out || "Sent via Email API." };
    } catch (e) {
      return {
        ok: false,
        via: "none",
        detail: e instanceof Error ? e.message : "Email API failed.",
      };
    }
  }
  // Browser dev fallback: copy + open mail client.
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
      ? "Desktop app not detected — email copied to clipboard and mail client opened."
      : "Could not send or copy.",
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
