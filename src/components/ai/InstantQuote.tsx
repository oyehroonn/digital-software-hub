/**
 * InstantQuote — AI feature #1 "Instant Quote Genie" (Home hero).
 *
 * A sales-first, plain-English quote builder for non-technical buyers. The
 * visitor types what they need in one sentence ("I run a 5-person architecture
 * studio and need AutoCAD for everyone"), taps "Get My Quote", and instantly
 * gets a tailored recommendation: the right products (shown as real 3D boxes
 * grounded in the live catalog), a friendly price, and a one-tap "Email me
 * this quote".
 *
 * Backends (per the resilience contract):
 *  - codex-proxy (UNSTABLE)  → the wrapper below (`backend="codex"`) only mounts
 *    the feature when the LLM is healthy; when it is down the hero degrades to a
 *    beta-signup card (still a real lead capture) instead of vanishing silently.
 *  - VPS product API (UNSTABLE) → grounds the quote in the real catalog and
 *    powers the matched 3D product boxes when reachable; on failure we degrade
 *    to an LLM-only estimate with no boxes (never a crash).
 *  - Ecommerce Apps Script (STABLE) → the quote / lead is captured here. This is
 *    the always-reachable path: the request lands in the Orders sheet and a
 *    specialist follows up by email. A local mail bridge, when present (admin
 *    app), also fires the formatted HTML quote instantly as a bonus.
 *  - Ecommerce/analytics (STABLE) → fire-and-forget telemetry for the funnel.
 *
 * This file exports the wrapped feature as its default; drop <InstantQuote/> into
 * the Home hero and it self-manages availability. It does not wire itself in.
 */

import { useState } from 'react';
import {
  Sparkles,
  Send,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import ProductModelViewer from '@/components/ProductModelViewer';
import { chat, LLMError, type ChatMessage } from '@/lib/llm';
import { searchProducts, getTopProducts, type Product } from '@/lib/api';
import { sendEmail } from '@/lib/stable/email';
import { submitOrder, type OrderPayload } from '@/lib/stable/orders';
import { sendTelemetry } from '@/lib/telemetry';
import { captureLead } from '@/lib/captureLead';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

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
  return `\n\nHere is our live catalog to price against (use these exact names and prices where they fit; ALWAYS set "productId" to the matching id when you recommend one of these):\n${lines.join(
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

/**
 * Resolve the quote to 2–3 real catalog products to show as 3D boxes. Prefers
 * the ids the model referenced, then tops up from the fetched catalog so the
 * buyer always sees something tangible when the VPS was reachable.
 */
function pickMatches(quote: Quote, products: Product[]): Product[] {
  if (products.length === 0) return [];
  const byId = new Map(products.map((p) => [String(p.id), p]));
  const chosen: Product[] = [];
  const seen = new Set<string>();

  for (const item of quote.items) {
    if (item.productId == null) continue;
    const p = byId.get(String(item.productId));
    if (p && !seen.has(String(p.id))) {
      chosen.push(p);
      seen.add(String(p.id));
    }
  }
  for (const p of products) {
    if (chosen.length >= 3) break;
    if (!seen.has(String(p.id))) {
      chosen.push(p);
      seen.add(String(p.id));
    }
  }
  return chosen.slice(0, 3);
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

// ── Stable lead capture (Ecommerce Apps Script) ──────────────────────────────
// The always-reachable path: the quote request is written to the Orders sheet
// so a specialist can follow up + email even when no mail bridge is running.

function buildLeadOrder(
  email: string,
  need: string,
  quote: Quote | null,
  source: string,
): OrderPayload {
  const matchedId = quote?.items.find((i) => i.productId != null)?.productId;
  const productName = quote
    ? `Instant Quote — ${quote.headline}`.slice(0, 160)
    : 'Instant Quote request';
  const notes = quote
    ? `[${source}] ${quoteToText(quote, need)}`
    : `[${source}] Website visitor requested a quote.\nWhat they told us: ${need.trim()}`;

  return {
    customerName: email.split('@')[0] || 'Website visitor',
    email,
    productId: matchedId ?? 'quote-genie',
    productName,
    quantity: 1,
    price: quote?.total ?? 'Estimate pending',
    notes,
  };
}

// ── Inner feature (only mounted when codex-proxy is healthy) ─────────────────

function InstantQuoteInner() {
  const [need, setNeed] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [matches, setMatches] = useState<Product[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<'no' | 'delivered' | 'queued'>('no');
  const [emailError, setEmailError] = useState('');

  const trimmed = need.trim();
  const canQuote = trimmed.length >= 3 && phase !== 'thinking';

  async function handleGetQuote() {
    if (!canQuote) return;
    setPhase('thinking');
    setQuote(null);
    setMatches([]);
    setErrorMsg('');
    setSent('no');
    setEmailError('');

    sendTelemetry({
      event: 'quote_requested',
      eventType: 'ai',
      elementId: 'instant-quote',
      metadata: { feature: 'quote-genie', needLength: trimmed.length },
    });

    try {
      const products = await fetchCatalog(need);
      const reply = await chat(buildMessages(need, products), {
        temperature: 0.5,
        maxTokens: 700,
      });
      const parsed = coerceQuote(extractJson(reply));
      const matched = pickMatches(parsed, products);
      setQuote(parsed);
      setMatches(matched);
      setPhase('ready');
      sendTelemetry({
        event: 'quote_generated',
        eventType: 'ai',
        metadata: {
          feature: 'quote-genie',
          items: parsed.items.length,
          grounded: products.length > 0,
          matched: matched.length,
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

  async function handleEmailQuote() {
    if (!quote) return;
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailError('');
    setSending(true);

    sendTelemetry({
      event: 'quote_emailed',
      eventType: 'lead',
      elementText: to,
      metadata: { feature: 'quote-genie', items: quote.items.length },
    });

    // Also capture the email as a lead/customer for the admin Customers view.
    captureLead({
      email: to,
      source: 'quote',
      productName: 'Instant Quote request',
      notes: quoteToText(quote, need),
    });

    // Bonus: if a local mail bridge is running (admin app), fire the formatted
    // HTML quote instantly. Best-effort only — the lead capture below is what
    // actually guarantees the buyer is reached, so ignore any bridge failure.
    void sendEmail({
      to,
      subject: 'Your DSM quote is ready',
      html: true,
      body: quoteToHtml(quote, need),
    }).catch(() => {
      /* no admin bridge on this machine — the Apps Script lead covers it */
    });

    // Stable path: record the quote as a lead in the Orders sheet. submitOrder
    // never rejects — it confirms, or parks in the offline queue and retries.
    try {
      const res = await submitOrder(buildLeadOrder(to, need, quote, 'instant-quote'));
      setSent(res.confirmed ? 'delivered' : 'queued');
    } catch {
      setSent('queued');
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setNeed('');
    setQuote(null);
    setMatches([]);
    setPhase('idle');
    setErrorMsg('');
    setEmail('');
    setSent('no');
    setEmailError('');
  }

  // Runtime failure → don't dead-end the buyer; offer the beta-signup capture.
  if (phase === 'error') {
    return (
      <QuoteShell>
        <QuoteBetaSignup
          reason="error"
          prefillNeed={trimmed}
          onRetry={() => {
            setErrorMsg('');
            setPhase('idle');
          }}
        />
      </QuoteShell>
    );
  }

  return (
    <QuoteShell>
      {phase !== 'ready' && (
        <>
          <h3 className="font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
            Tell us what you need. Get a price in seconds.
          </h3>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
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
            className="mt-4 w-full text-base font-semibold transition-all hover:shadow-crimson-glow"
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

          {phase === 'thinking' ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Matching your need to our live catalog and pricing it up…
            </p>
          ) : trimmed.length > 0 && trimmed.length < 3 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Add a little more detail so we can tailor it to you.
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: mention team size and the tools you use for the sharpest quote.
            </p>
          )}

          <p className="mt-auto inline-flex items-center gap-1.5 pt-6 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-crimson/70" aria-hidden />
            Genuine licenses · instant delivery · trusted since 1994
          </p>
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

          {/* Matched catalog products, shown as real 3D boxes. */}
          {matches.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Matched from our catalog
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {matches.map((p) => (
                  <ProductBox key={p.id} product={p} />
                ))}
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-muted-foreground">{quote.closing}</p>

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
                  ? "Got it — your quote is saved and a specialist will email you shortly."
                  : "You're all set — your quote request is saved and on its way. A specialist will follow up by email."}
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
    </QuoteShell>
  );
}

// ── Shared card shell ────────────────────────────────────────────────────────

function QuoteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0b0b0f]/90 to-[#050506]/80 p-6 shadow-premium backdrop-blur-sm transition-all duration-500 hover:border-crimson/25 hover:shadow-premium-lg sm:p-8">
      {/* Thin crimson accent rail along the top edge. */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-crimson/50 to-transparent"
        aria-hidden
      />
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-crimson/25 bg-crimson/[0.08] text-crimson">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-crimson">
            Instant Quote
          </p>
          <p className="truncate text-xs text-muted-foreground">
            A tailored price, built for your team
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

// ── Matched product box (real 3D model from the live catalog) ─────────────────

function ProductBox({ product }: { product: Product }) {
  const href = product.viewer || product.link || undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() =>
        sendTelemetry({
          event: 'quote_product_opened',
          eventType: 'ai',
          productId: product.id,
          metadata: { feature: 'quote-genie', name: product.name },
        })
      }
      className="group flex flex-col rounded-xl border border-border bg-background/40 p-2 transition-colors hover:border-crimson/40"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-secondary/40">
        {product.link ? (
          <ProductModelViewer
            glbSrc={product.link}
            fallbackIcon={
              <div className="flex h-full w-full items-center justify-center">
                <span className="font-serif text-2xl text-foreground/30">
                  {product.name.charAt(0)}
                </span>
              </div>
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-serif text-2xl text-foreground/30">
              {product.name.charAt(0)}
            </span>
          </div>
        )}
        <span className="absolute right-1.5 top-1.5 rounded-full bg-background/70 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          <ExternalLink className="size-3 text-foreground" aria-hidden />
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-foreground">
        {product.name}
      </p>
      {product.price && (
        <p className="mt-0.5 text-xs font-semibold text-crimson">{product.price}</p>
      )}
    </a>
  );
}

// ── Beta-signup degradation (codex down, or a runtime failure) ────────────────

interface BetaSignupProps {
  /** Why we're degrading — tunes the copy and the telemetry. */
  reason: 'offline' | 'error';
  prefillNeed?: string;
  onRetry?: () => void;
}

function QuoteBetaSignup({ reason, prefillNeed = '', onRetry }: BetaSignupProps) {
  const [need, setNeed] = useState(prefillNeed);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setSending(true);

    sendTelemetry({
      event: 'quote_beta_signup',
      eventType: 'lead',
      elementText: to,
      metadata: { feature: 'quote-genie', reason },
    });

    // Also capture the email as a lead/customer for the admin Customers view.
    captureLead({
      email: to,
      source: 'quote',
      productName: 'Instant Quote — early access',
      notes: `Quote beta signup (${reason}). What they told us: ${need.trim() || '(not given)'}`,
    });

    try {
      await submitOrder(buildLeadOrder(to, need, null, `quote-beta:${reason}`));
    } catch {
      /* submitOrder self-queues; the visitor is captured either way */
    } finally {
      setSending(false);
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-crimson/30 bg-crimson/5 p-4 text-sm text-foreground">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-crimson" aria-hidden />
        <span>
          Thank you — you're on the list. A DSM specialist will email you a
          tailored quote shortly.
        </span>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
        {reason === 'error'
          ? 'Let us send you a tailored quote'
          : 'Instant Quote — early access'}
      </h3>
      <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
        {reason === 'error'
          ? "Our quote engine is busy right now. Leave your details and a specialist will email you a tailored quote — usually within a business day."
          : "We're rolling out instant AI quotes. Leave your details and we'll send you a tailored quote and early access."}
      </p>

      <Textarea
        value={need}
        onChange={(e) => setNeed(e.target.value)}
        placeholder="Tell us what you need (team size, tools, project)…"
        className="mt-5 min-h-[88px] resize-none text-base"
        disabled={sending}
      />

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="you@company.com"
          className="flex-1 text-base"
          disabled={sending}
        />
        <Button
          onClick={submit}
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
              Send me a quote
            </>
          )}
        </Button>
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {reason === 'error' && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className="size-4" aria-hidden />
          Try the instant quote again
        </button>
      )}
    </div>
  );
}

// ── Email / lead body builders ───────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-text quote used for the Orders-sheet `notes` column. */
function quoteToText(quote: Quote, need: string): string {
  const lines = quote.items.map(
    (it) => `• ${it.name} — ${it.price}${it.why ? ` (${it.why})` : ''}`,
  );
  return [
    `Quote: ${quote.headline}`,
    `What they told us: ${need.trim()}`,
    ...lines,
    `Estimate: ${quote.total}`,
  ].join('\n');
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
 * Home-hero Instant Quote. When the LLM backend is healthy it renders the live
 * quote builder; when it's down it degrades to a beta-signup lead capture rather
 * than disappearing, so the hero always converts (the resilience contract).
 * Drop it straight into the hero — no props.
 */
export default function InstantQuote() {
  return (
    <AIFeature
      backend="codex"
      feature="quote-genie"
      recheckMs={60000}
    >
      <InstantQuoteInner />
    </AIFeature>
  );
}
