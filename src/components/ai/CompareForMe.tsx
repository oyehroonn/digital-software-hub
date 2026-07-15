/**
 * CompareForMe — AI feature #4 ("Compare & Recommend").
 *
 * A sales-first, plain-English product comparison tool for NON-technical buyers.
 * The shopper searches the REAL DSM catalogue, ticks 2–3 products, optionally
 * says what matters most to them, hits "Compare & Recommend", and the
 * codex-proxy LLM streams back a jargon-free side-by-side plus a clear
 * "buy this one" verdict tailored to their priorities, and a next step.
 * Optionally the shopper can have the write-up emailed to them (lead capture) —
 * sent via the STABLE email bridge and parked in the offline queue if the
 * bridge is momentarily down.
 *
 * Catalogue source:
 *  - If `products` are passed in (e.g. the page already has a catalogue slice),
 *    those are used and searched client-side.
 *  - Otherwise the component loads the live catalogue itself from the products
 *    API (`getTopProducts` for a curated starting set, `searchProducts` as the
 *    shopper types). Picks persist across searches so a buyer can find one
 *    product, tick it, search again, and tick another.
 *
 * Resilience contract:
 *  - The whole thing is wrapped in <AIFeature backend="codex">. If the LLM proxy
 *    is unhealthy the feature renders NOTHING (no spinner, no broken UI) and an
 *    `ai_outage` telemetry event is fired by the wrapper.
 *  - A runtime LLM failure (proxy dies mid-request) is caught, degrades to a
 *    friendly inline message, and ALSO reports an `ai_outage` event.
 *  - The catalogue lives on the UNSTABLE products API, so every load is bounded
 *    and failure-tolerant: a search that errors falls back to filtering the
 *    already-loaded products locally and a `products_api` outage is reported —
 *    the compare flow keeps working with whatever is on screen.
 *  - Emailing never blocks: on bridge failure the request is queued for retry.
 *
 * This component is self-contained and is NOT wired into any page here — the Wire
 * step decides where it mounts and what catalogue (if any) it receives.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Check, Mail, AlertCircle, Loader2, RefreshCw, Search, X } from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chatStream, LLMError, type ChatMessage } from '@/lib/llm';
import { reportAiOutage } from '@/lib/telemetry';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';
import { getTopProducts, searchProducts, type Product } from '@/lib/api';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

const FEATURE = 'compare-for-me';
const MIN_PICKS = 2;
const MAX_PICKS = 3;
const EMAIL_QUEUE_KIND = 'compare-email';
const CATALOG_LIMIT = 24; // how many catalogue rows to show in the picker
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The shape we need to compare a product. Deliberately loose so it accepts the
 * full `Product` from `@/lib/api` as well as the trimmed catalogue JSON rows.
 */
export interface ComparableProduct {
  id: string | number;
  name: string;
  price?: string | number;
  category?: string;
  brand?: string;
  licenseType?: string;
  platform?: string;
  validity?: string;
  description?: string;
  tags?: string[];
  whatsIncluded?: string[];
}

export interface CompareForMeProps {
  /**
   * An optional catalogue slice to pick from. When omitted (or empty) the
   * component loads the live catalogue itself from the products API.
   */
  products?: ComparableProduct[];
  /** Optionally pre-tick some products (e.g. the one being viewed). */
  preselectedIds?: Array<string | number>;
  /** Extra classes for the outer card wrapper. */
  className?: string;
}

// ── Offline-queued email retry ───────────────────────────────────────────────
// If the local mail bridge is down when a shopper asks for their comparison,
// we park the send and let the offline queue drain it later. Never blocks the UI.
registerProcessor<SendEmailArgs>(EMAIL_QUEUE_KIND, async (args) => {
  await sendEmail(args);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Narrow the full `Product` to the loose comparable shape we display/prompt. */
function toComparable(p: Product): ComparableProduct {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    category: p.category,
    brand: p.brand,
    licenseType: p.licenseType,
    platform: p.platform,
    validity: p.validity,
    description: p.description,
    tags: p.tags,
    whatsIncluded: p.whatsIncluded,
  };
}

/** A price is only worth showing to a buyer if it's an actual figure. */
function displayPrice(price: ComparableProduct['price']): string | null {
  if (price == null || price === '') return null;
  if (typeof price === 'number') return `AED ${price}`;
  return /\d/.test(price) ? price : null; // hide "Contact for pricing" etc.
}

/** Client-side filter used for a provided catalogue or as a search fallback. */
function localFilter(items: ComparableProduct[], q: string): ComparableProduct[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((p) =>
    [p.name, p.brand, p.category, p.description, ...(p.tags ?? [])]
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(needle)),
  );
}

// ── Prompt construction ──────────────────────────────────────────────────────

function productToPromptLine(p: ComparableProduct): string {
  const parts: string[] = [`• ${p.name}`];
  const price = displayPrice(p.price);
  if (price) parts.push(`price: ${price}`);
  if (p.category) parts.push(`category: ${p.category}`);
  if (p.brand) parts.push(`brand: ${p.brand}`);
  if (p.licenseType) parts.push(`license: ${p.licenseType}`);
  if (p.platform) parts.push(`platform: ${p.platform}`);
  if (p.validity) parts.push(`validity: ${p.validity}`);
  if (p.whatsIncluded?.length) parts.push(`includes: ${p.whatsIncluded.join(', ')}`);
  if (p.tags?.length) parts.push(`tags: ${p.tags.join(', ')}`);
  if (p.description) parts.push(`about: ${p.description}`);
  return parts.join(' | ');
}

function buildMessages(picked: ComparableProduct[], priorities: string): ChatMessage[] {
  const system: ChatMessage = {
    role: 'system',
    content: [
      'You are a friendly, trustworthy sales advisor for DSM, a software & IT licensing store.',
      'Your job: help a NON-technical buyer choose between a few products with zero jargon.',
      'Rules:',
      '- Write in plain, warm, everyday English. No acronyms or tech-speak unless you instantly explain them.',
      '- Be concise and skimmable. Keep it under ~200 words.',
      '- Structure the answer with these exact section headings, each on its own line:',
      '  "Bottom line:" one or two sentences naming the single product you recommend and who it is best for.',
      '  "Quick comparison:" 2-4 short bullet lines contrasting the options in everyday terms (price, what you get, who it suits).',
      '  "Why this pick:" 2-3 short bullets on the concrete benefits of your recommendation.',
      '  "Next step:" one encouraging sentence inviting them to add it to the cart or ask for a tailored quote.',
      '- If the buyer told you what matters most to them, treat that as the deciding factor and refer to it directly in "Bottom line" and "Why this pick".',
      '- Never invent specs, prices, or features that were not given. If a price is not listed, say pricing is on request rather than guessing a number.',
      '- Sound helpful and confident, never pushy.',
    ].join('\n'),
  };

  const trimmedPriorities = priorities.trim();
  const user: ChatMessage = {
    role: 'user',
    content: [
      'Please compare these products and tell me which to buy and why:',
      '',
      ...picked.map(productToPromptLine),
      '',
      trimmedPriorities
        ? `What matters most to me: ${trimmedPriorities}`
        : 'I have not said what matters most — recommend the best all-round choice for a typical buyer.',
    ].join('\n'),
  };

  return [system, user];
}

// ── Inner feature (only mounted when codex-proxy is healthy) ──────────────────

type Phase = 'select' | 'streaming' | 'done' | 'error';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function CompareForMeInner({ products, preselectedIds, className }: CompareForMeProps) {
  const providedProducts = products ?? [];
  const selfFetch = providedProducts.length === 0;

  // Which products the shopper has ticked. We keep the whole object (not just
  // the id) so a pick survives when the visible list changes under a new search.
  const [selected, setSelected] = useState<Map<string, ComparableProduct>>(new Map());
  const seededRef = useRef(false);

  // Catalogue picker state.
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<ComparableProduct[]>(providedProducts);
  const [loadingCatalog, setLoadingCatalog] = useState(selfFetch);
  const [catalogNote, setCatalogNote] = useState('');

  // Comparison state.
  const [priorities, setPriorities] = useState('');
  const [phase, setPhase] = useState<Phase>('select');
  const [result, setResult] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Email capture (lead gen).
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'queued' | 'sent'>('idle');

  // ── Load the live catalogue when none was provided, and re-query on search ──
  useEffect(() => {
    if (!selfFetch) {
      // Provided catalogue → filter locally, no network.
      setCatalog(localFilter(providedProducts, query));
      return;
    }

    let active = true;
    const q = query.trim();
    setLoadingCatalog(true);

    const timer = setTimeout(async () => {
      try {
        const res = q ? await searchProducts(q) : await getTopProducts(CATALOG_LIMIT);
        if (!active) return;
        setCatalog((res.products ?? []).slice(0, CATALOG_LIMIT).map(toComparable));
        setCatalogNote('');
      } catch (err) {
        if (!active) return;
        // The products API (VPS Flask) is unstable — report and keep the picker
        // usable by falling back to whatever we already have on screen.
        reportAiOutage('vps', FEATURE, err);
        setCatalog((prev) => localFilter(prev, q));
        setCatalogNote(
          q
            ? "Live search is momentarily unavailable — showing what we've already loaded."
            : 'Our catalogue is momentarily unavailable — you can still compare any items shown below.',
        );
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timer);
    };
    // providedProducts is derived from the (stable) prop; query/selfFetch drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selfFetch]);

  // ── Seed preselected picks once, from whatever catalogue is first known ─────
  useEffect(() => {
    if (seededRef.current || !preselectedIds?.length) return;
    const wanted = new Set(preselectedIds.map(String));
    const pool = selfFetch ? catalog : providedProducts;
    const found = pool.filter((p) => wanted.has(String(p.id)));
    if (found.length === 0 && (loadingCatalog || pool.length === 0)) return; // wait for a pool
    seededRef.current = true;
    if (found.length === 0) return;
    setSelected((prev) => {
      const next = new Map(prev);
      found.slice(0, MAX_PICKS).forEach((p) => next.set(String(p.id), p));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, loadingCatalog, preselectedIds, selfFetch]);

  const pickedProducts = useMemo(() => Array.from(selected.values()), [selected]);
  const canCompare = selected.size >= MIN_PICKS && selected.size <= MAX_PICKS;

  function toggle(p: ComparableProduct) {
    const key = String(p.id);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_PICKS) return prev; // cap at MAX_PICKS
        next.set(key, p);
      }
      return next;
    });
  }

  async function runComparison() {
    if (!canCompare) return;
    const picked = pickedProducts;
    setPhase('streaming');
    setResult('');
    setErrorMsg('');
    setEmailState('idle');

    try {
      await chatStream(
        buildMessages(picked, priorities),
        (token) => setResult((prev) => prev + token),
        { temperature: 0.5, maxTokens: 500 },
      );
      setPhase('done');
    } catch (err) {
      // Runtime unstable-backend failure → report + degrade gracefully.
      reportAiOutage('codex', FEATURE, err);
      setErrorMsg(
        err instanceof LLMError && err.status
          ? `Our recommendation engine is busy right now (code ${err.status}).`
          : 'Our recommendation engine is momentarily unavailable.',
      );
      setPhase('error');
    }
  }

  function emailMe() {
    if (!isValidEmail(email) || !result) return;
    const names = pickedProducts.map((p) => p.name).join(' vs ');
    const args: SendEmailArgs = {
      to: email.trim(),
      subject: `Your DSM comparison: ${names}`,
      body: [
        `Hi,`,
        ``,
        `Here's the comparison you asked for on dsm — ${names}:`,
        ``,
        result,
        ``,
        `Ready to go ahead or want a tailored quote? Just reply to this email and our team will help.`,
        ``,
        `— The DSM Team`,
      ].join('\n'),
    };

    // Try to send immediately; if the bridge is down, park it for retry.
    sendEmail(args)
      .then(() => setEmailState('sent'))
      .catch(() => {
        enqueue(EMAIL_QUEUE_KIND, args);
        setEmailState('queued');
      });
    // Optimistically reflect acceptance so the shopper is never left waiting.
    setEmailState((prev) => (prev === 'sent' ? prev : 'queued'));
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-crimson" />
          <CardTitle className="text-xl">Compare & Recommend</CardTitle>
        </div>
        <CardDescription>
          Not sure which to buy? Search our catalogue, tick {MIN_PICKS}–{MAX_PICKS} options
          and we'll explain the difference in plain English and tell you the best pick for you.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Product picker */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Choose products to compare</span>
            <Badge variant="secondary">
              {selected.size}/{MAX_PICKS} selected
            </Badge>
          </div>

          {/* Search the real catalogue */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products (e.g. Autodesk, rendering, antivirus)…"
              className="pl-9"
              aria-label="Search products to compare"
            />
            {loadingCatalog && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {/* Currently-picked chips (persist across searches) */}
          {pickedProducts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {pickedProducts.map((p) => (
                <button
                  key={String(p.id)}
                  type="button"
                  onClick={() => toggle(p)}
                  className="inline-flex items-center gap-1 rounded-full border border-crimson/40 bg-crimson/5 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-crimson/10"
                  aria-label={`Remove ${p.name}`}
                >
                  {p.name}
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {catalogNote && (
            <p className="text-xs text-muted-foreground">{catalogNote}</p>
          )}

          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {!loadingCatalog && catalog.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {query
                  ? `No products match "${query.trim()}". Try another word.`
                  : 'No products available to compare yet.'}
              </p>
            )}
            {catalog.map((p) => {
              const key = String(p.id);
              const isChecked = selected.has(key);
              const atCap = !isChecked && selected.size >= MAX_PICKS;
              const price = displayPrice(p.price);
              return (
                <label
                  key={key}
                  className={[
                    'flex cursor-pointer items-center gap-3 rounded-md border p-2.5 transition-colors',
                    isChecked
                      ? 'border-crimson/40 bg-crimson/5'
                      : 'border-border hover:bg-accent/50',
                    atCap ? 'cursor-not-allowed opacity-50' : '',
                  ].join(' ')}
                >
                  <Checkbox
                    checked={isChecked}
                    disabled={atCap}
                    onCheckedChange={() => toggle(p)}
                    aria-label={`Compare ${p.name}`}
                  />
                  <span className="flex-1 text-sm text-foreground">
                    {p.name}
                    {p.brand && (
                      <span className="ml-1 text-xs text-muted-foreground">· {p.brand}</span>
                    )}
                  </span>
                  {price && (
                    <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                      {price}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* Optional: tailor the recommendation */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="compare-priorities">
            What matters most to you? <span className="text-muted-foreground">(optional)</span>
          </label>
          <Input
            id="compare-priorities"
            value={priorities}
            onChange={(e) => setPriorities(e.target.value)}
            placeholder="e.g. tightest budget, easiest to use, for a 5-person team"
          />
        </div>

        {/* Primary CTA */}
        {phase !== 'streaming' && (
          <Button
            onClick={runComparison}
            disabled={!canCompare}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-4 w-4" />
            {phase === 'done' || phase === 'error' ? 'Compare again' : 'Compare & Recommend'}
          </Button>
        )}

        {!canCompare && phase === 'select' && selected.size > 0 && (
          <p className="-mt-2 text-center text-xs text-muted-foreground">
            Pick at least {MIN_PICKS} to compare.
          </p>
        )}

        {/* Streaming / result */}
        {(phase === 'streaming' || phase === 'done') && (
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              {phase === 'streaming' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-crimson" />
                  Weighing up your options…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 text-crimson" />
                  Here's our recommendation
                </>
              )}
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {result}
              {phase === 'streaming' && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-crimson align-middle" />
              )}
            </div>
          </div>
        )}

        {/* Error degrade */}
        {phase === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {errorMsg} Please try again in a moment — or tell us what you need and our
                team will recommend the right fit.
              </p>
              <Button variant="outline" size="sm" onClick={runComparison}>
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          </div>
        )}

        {/* Lead capture: email me this comparison */}
        {phase === 'done' && (
          <div className="space-y-2 border-t border-border pt-4">
            {emailState === 'idle' ? (
              <>
                <label className="text-sm font-medium text-foreground">
                  Want this sent to your inbox?
                </label>
                <div className="flex gap-2">
                  <Input
                    type="email"
                    inputMode="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={emailMe}
                    disabled={!isValidEmail(email)}
                  >
                    <Mail className="h-4 w-4" />
                    Email it
                  </Button>
                </div>
              </>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-crimson" />
                {emailState === 'sent'
                  ? 'Sent! Check your inbox.'
                  : "Got it — we'll email your comparison shortly."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Public export: gated behind the codex-proxy health wrapper ────────────────

export default function CompareForMe(props: CompareForMeProps) {
  return (
    <AIFeature backend="codex" feature={FEATURE}>
      <CompareForMeInner {...props} />
    </AIFeature>
  );
}
