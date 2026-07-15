/**
 * InstantQuote — AI feature #1 "Instant Quote Genie" (Home hero).
 *
 * A sales-first, plain-English quote builder for non-technical buyers. The
 * visitor types what they need in one sentence ("I run a 5-person architecture
 * studio and need AutoCAD for everyone"), taps "Get My Quote", and instantly
 * gets a tailored recommendation: the right products, a friendly price, and a
 * one-tap "Email me this quote".
 *
 * Backends (per the resilience contract):
 *  - codex-proxy (UNSTABLE)  → the wrapper below (`backend="codex"`) only mounts
 *    the feature when the LLM is healthy; the hero silently omits it otherwise.
 *  - VPS product API (UNSTABLE) → used to ground the quote in the real catalog
 *    when reachable; on failure we degrade to an LLM-only estimate (no crash).
 *  - Email bridge (STABLE) → sends the quote. If the local bridge is momentarily
 *    unreachable, the send is queued via the offline queue and auto-flushed
 *    later, so the buyer is always told "on its way".
 *  - Ecommerce/analytics (STABLE) → fire-and-forget telemetry for the funnel.
 *
 * This file exports the wrapped feature as its default; drop <InstantQuote/> into
 * the Home hero and it self-manages availability. It does not wire itself in.
 */

import { useState } from 'react';
import { Sparkles, Send, Loader2, CheckCircle2, ArrowRight, RefreshCw } from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chat, LLMError, type ChatMessage } from '@/lib/llm';
import { searchProducts, getTopProducts, type Product } from '@/lib/api';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';
import { sendTelemetry } from '@/lib/telemetry';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

// ── Offline email delivery ──────────────────────────────────────────────────
// If the local mail bridge is down at send time we don't lose the quote: we
// enqueue it and register a processor that retries when the bridge returns.

const QUOTE_EMAIL_KIND = 'quote-email';

registerProcessor<SendEmailArgs>(QUOTE_EMAIL_KIND, async (payload) => {
  await sendEmail(payload);
});

// ── Quote shape returned by the LLM ─────────────────────────────────────────

interface QuoteLineItem {
  /** Product/edition name in plain English. */
  name: string;
  /** Short "why this fits you" line — buyer-facing, no jargon. */
  why: string;
  /** Display price, e.g. "$1,690 / year" or "Contact for pricing". */
  price: string;
  /** Optional matched catalog id, when grounded in the live product API. */
  productId?: string | number;
}

interface Quote {
  /** One or two friendly sentences summarising the recommendation. */
  headline: string;
  items: QuoteLineItem[];
  /** Total across items, formatted for display (may be an estimate). */
  total: string;
  /** A short, warm closing line that nudges toward talking to sales. */
  closing: string;
}

type Phase = 'idle' | 'thinking' | 'ready' | 'error';

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Pull the first JSON object out of a model reply, tolerating code fences. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object in model reply');
  }
  return JSON.parse(body.slice(start, end + 1));
}

function coerceQuote(value: unknown): Quote {
  const obj = (value ?? {}) as Record<string, unknown>;
  const rawItems = Array.isArray(obj.items) ? obj.items : [];
  const items: QuoteLineItem[] = rawItems
    .map((it): QuoteLineItem => {
      const rec = (it ?? {}) as Record<string, unknown>;
      return {
        name: String(rec.name ?? '').trim() || 'Recommended license',
        why: String(rec.why ?? '').trim(),
        price: String(rec.price ?? '').trim() || 'Contact for pricing',
        productId:
          typeof rec.productId === 'string' || typeof rec.productId === 'number'
            ? rec.productId
            : undefined,
      };
    })
    .filter((it) => it.name.length > 0)
    .slice(0, 6);

  return {
    headline:
      String(obj.headline ?? '').trim() ||
      "Here's the setup we'd recommend for you.",
    items:
      items.length > 0
        ? items
        : [
            {
              name: 'Tailored license bundle',
              why: 'Matched to what you described.',
              price: 'Contact for pricing',
            },
          ],
    total: String(obj.total ?? '').trim() || 'Contact for a final price',
    closing:
      String(obj.closing ?? '').trim() ||
      'Want this locked in? We can email it to you and a specialist will follow up.',
  };
}

/** Compact the live catalog into a grounding block the model can price against. */
function catalogContext(products: Product[]): string {
  if (products.length === 0) return '';
  const lines = products.slice(0, 12).map((p) => {
    const price = String(p.price ?? '').trim() || 'n/a';
    const lic = String(p.licenseType ?? '').trim();
    return `- id=${p.id} | ${p.name} | brand=${p.brand} | license=${lic} | price=${price}`;
  });
  return `\n\nHere is our live catalog to price against (use these exact names and prices where they fit; reference id when you use one):\n${lines.join(
    '\n',
  )}`;
}

/** Best-effort catalog fetch. VPS is unstable — never let it break the quote. */
async function fetchCatalog(need: string): Promise<Product[]> {
  try {
    const res = await searchProducts(need);
    if (res.products?.length) return res.products;
  } catch {
    /* fall through to top products */
  }
  try {
    const res = await getTopProducts(10);
    return res.products ?? [];
  } catch {
    return [];
  }
}

function buildMessages(need: string, products: Product[]): ChatMessage[] {
  const system =
    'You are a friendly sales specialist for DSM, a reseller of professional design ' +
    'and engineering software licenses (AutoCAD, Autodesk, Windows, and more). ' +
    'Talk to non-technical business buyers in warm, plain English — no jargon, ' +
    'no hedging. Recommend the smallest set of licenses that genuinely fits their ' +
    'need, explain each choice in one buyer-friendly sentence, and give confident ' +
    'prices. If you are unsure of an exact price, give a clear estimate and note it. ' +
    'Reply with ONLY a JSON object, no prose, no code fences, matching:\n' +
    '{"headline": string, "items": [{"name": string, "why": string, "price": string, "productId"?: string}], "total": string, "closing": string}';

  const user =
    `A prospective buyer says: "${need.trim()}"\n\n` +
    'Build them a tailored quote. Keep it to 1–4 line items. Make the total add up ' +
    'from the items when you can. Sound helpful and ready to close.' +
    catalogContext(products);

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ── Inner feature (only mounted when codex-proxy is healthy) ─────────────────

function InstantQuoteInner() {
  const [need, setNeed] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<'no' | 'delivered' | 'queued'>('no');
  const [emailError, setEmailError] = useState('');

  const canQuote = need.trim().length >= 3 && phase !== 'thinking';

  async function handleGetQuote() {
    if (!canQuote) return;
    setPhase('thinking');
    setQuote(null);
    setErrorMsg('');
    setSent('no');
    setEmailError('');

    sendTelemetry({
      event: 'quote_requested',
      eventType: 'ai',
      elementId: 'instant-quote',
      metadata: { feature: 'quote-genie', needLength: need.trim().length },
    });

    try {
      const products = await fetchCatalog(need);
      const reply = await chat(buildMessages(need, products), {
        temperature: 0.5,
        maxTokens: 700,
      });
      const parsed = coerceQuote(extractJson(reply));
      setQuote(parsed);
      setPhase('ready');
      sendTelemetry({
        event: 'quote_generated',
        eventType: 'ai',
        metadata: {
          feature: 'quote-genie',
          items: parsed.items.length,
          grounded: products.length > 0,
        },
      });
    } catch (err) {
      const message =
        err instanceof LLMError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong';
      setErrorMsg(message);
      setPhase('error');
    }
  }

  function handleEmailQuote() {
    if (!quote) return;
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setSending(true);

    const payload: SendEmailArgs = {
      to,
      subject: 'Your DSM quote is ready',
      html: true,
      body: quoteToHtml(quote, need),
    };

    sendTelemetry({
      event: 'quote_emailed',
      eventType: 'lead',
      elementText: to,
      metadata: { feature: 'quote-genie', items: quote.items.length },
    });

    sendEmail(payload)
      .then(() => {
        setSent('delivered');
      })
      .catch(() => {
        // Mail bridge momentarily down → queue it; it flushes automatically.
        enqueue(QUOTE_EMAIL_KIND, payload);
        setSent('queued');
      })
      .finally(() => setSending(false));
  }

  function reset() {
    setNeed('');
    setQuote(null);
    setPhase('idle');
    setErrorMsg('');
    setEmail('');
    setSent('no');
    setEmailError('');
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-border bg-card/80 p-6 shadow-premium backdrop-blur-sm sm:p-8">
      <div className="mb-4 flex items-center gap-2 text-crimson">
        <Sparkles className="size-5" aria-hidden />
        <span className="text-sm font-semibold uppercase tracking-wide">
          Instant Quote
        </span>
      </div>

      {phase !== 'ready' && (
        <>
          <h3 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Tell us what you need. Get a price in seconds.
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            No forms, no waiting. Describe your team or project and we'll build a
            tailored quote right here.
          </p>

          <Textarea
            value={need}
            onChange={(e) => setNeed(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGetQuote();
            }}
            placeholder="e.g. I run a 6-person architecture studio and need AutoCAD for everyone, plus Windows 11 Pro."
            className="mt-5 min-h-[104px] resize-none text-base"
            disabled={phase === 'thinking'}
          />

          <Button
            onClick={handleGetQuote}
            disabled={!canQuote}
            size="lg"
            className="mt-4 w-full text-base font-semibold"
          >
            {phase === 'thinking' ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Building your quote…
              </>
            ) : (
              <>
                Get My Quote
                <ArrowRight className="size-5" aria-hidden />
              </>
            )}
          </Button>

          {phase === 'error' && (
            <p className="mt-3 text-sm text-destructive">
              We couldn't build that quote just now. Please try again — or tweak
              your wording.
              {errorMsg ? (
                <span className="mt-1 block text-xs opacity-70">{errorMsg}</span>
              ) : null}
            </p>
          )}
        </>
      )}

      {phase === 'ready' && quote && (
        <div>
          <p className="text-lg font-medium text-foreground">{quote.headline}</p>

          <ul className="mt-4 space-y-3">
            {quote.items.map((item, i) => (
              <li
                key={`${item.name}-${i}`}
                className="rounded-xl border border-border bg-background/40 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-foreground">{item.name}</span>
                  <span className="whitespace-nowrap text-sm font-semibold text-crimson">
                    {item.price}
                  </span>
                </div>
                {item.why && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.why}</p>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
            <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Your estimate
            </span>
            <span className="text-xl font-semibold text-foreground">
              {quote.total}
            </span>
          </div>

          <p className="mt-3 text-sm text-muted-foreground">{quote.closing}</p>

          {/* Email capture / send */}
          {sent === 'no' ? (
            <div className="mt-5">
              <label
                htmlFor="instant-quote-email"
                className="text-sm font-medium text-foreground"
              >
                Email me this quote
              </label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="instant-quote-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEmailQuote();
                  }}
                  placeholder="you@company.com"
                  className="flex-1 text-base"
                  disabled={sending}
                />
                <Button
                  onClick={handleEmailQuote}
                  disabled={sending}
                  size="lg"
                  className="font-semibold"
                >
                  {sending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" aria-hidden />
                      Send it
                    </>
                  )}
                </Button>
              </div>
              {emailError && (
                <p className="mt-2 text-sm text-destructive">{emailError}</p>
              )}
            </div>
          ) : (
            <div className="mt-5 flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson/5 p-4 text-sm text-foreground">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-crimson" aria-hidden />
              <span>
                {sent === 'delivered'
                  ? "Sent! Check your inbox — a specialist will follow up shortly."
                  : "You're all set — your quote is on its way and will land in your inbox shortly. A specialist will follow up."}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCw className="size-4" aria-hidden />
            Start a new quote
          </button>
        </div>
      )}
    </div>
  );
}

// ── Email body ───────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function quoteToHtml(quote: Quote, need: string): string {
  const rows = quote.items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <div style="font-weight:600;color:#111;">${escapeHtml(it.name)}</div>
          ${
            it.why
              ? `<div style="font-size:13px;color:#666;margin-top:2px;">${escapeHtml(
                  it.why,
                )}</div>`
              : ''
          }
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;font-weight:600;color:#b1121f;">
          ${escapeHtml(it.price)}
        </td>
      </tr>`,
    )
    .join('');

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;">
    <h2 style="margin:0 0 4px;">Your DSM quote</h2>
    <p style="margin:0 0 16px;color:#444;">${escapeHtml(quote.headline)}</p>
    <p style="margin:0 0 16px;font-size:13px;color:#888;"><strong>What you told us:</strong> ${escapeHtml(
      need.trim(),
    )}</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <div style="display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:2px solid #111;">
      <span style="font-weight:600;text-transform:uppercase;font-size:12px;color:#666;">Your estimate</span>
      <span style="font-weight:700;font-size:18px;">${escapeHtml(quote.total)}</span>
    </div>
    <p style="margin:20px 0 0;color:#444;">${escapeHtml(quote.closing)}</p>
    <p style="margin:20px 0 0;font-size:12px;color:#999;">
      Prices are estimates and may vary by license term and volume. Reply to this email and a DSM specialist will confirm and help you buy.
    </p>
  </div>`;
}

// ── Public export: codex-gated wrapper ───────────────────────────────────────

/**
 * Home-hero Instant Quote. Renders nothing unless the LLM backend is healthy
 * (the resilience contract). Drop it straight into the hero — no props.
 */
export default function InstantQuote() {
  return (
    <AIFeature backend="codex" feature="quote-genie">
      <InstantQuoteInner />
    </AIFeature>
  );
}
