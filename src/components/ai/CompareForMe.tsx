/**
 * CompareForMe — AI feature #4 ("Compare & Recommend").
 *
 * A sales-first, plain-English product comparison tool for NON-technical buyers.
 * The shopper ticks 2–3 products, hits "Compare & Recommend", and the codex-proxy
 * LLM streams back a jargon-free side-by-side plus a clear "buy this one" verdict
 * and a next step. Optionally the shopper can have the write-up emailed to them
 * (lead capture) — sent via the STABLE email bridge and parked in the offline
 * queue if the bridge is momentarily down.
 *
 * Resilience contract:
 *  - The whole thing is wrapped in <AIFeature backend="codex">. If the LLM proxy
 *    is unhealthy the feature renders NOTHING (no spinner, no broken UI) and an
 *    `ai_outage` telemetry event is fired by the wrapper.
 *  - A runtime LLM failure (proxy dies mid-request) is caught, degrades to a
 *    friendly inline message, and ALSO reports an `ai_outage` event.
 *  - Emailing never blocks: on bridge failure the request is queued for retry.
 *
 * This component is self-contained and is NOT wired into any page here — the Wire
 * step decides where it mounts and what catalogue it receives.
 */

import { useMemo, useState } from 'react';
import { Sparkles, Check, Mail, AlertCircle, Loader2, RefreshCw } from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chatStream, LLMError, type ChatMessage } from '@/lib/llm';
import { reportAiOutage } from '@/lib/telemetry';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';

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
  /** The catalogue the shopper may pick from. */
  products: ComparableProduct[];
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

// ── Prompt construction ──────────────────────────────────────────────────────

function productToPromptLine(p: ComparableProduct): string {
  const parts: string[] = [`• ${p.name}`];
  if (p.price != null && p.price !== '') parts.push(`price: ${p.price}`);
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

function buildMessages(picked: ComparableProduct[]): ChatMessage[] {
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
      '- Never invent specs, prices, or features that were not given. If unsure, speak in benefit terms.',
      '- Sound helpful and confident, never pushy.',
    ].join('\n'),
  };

  const user: ChatMessage = {
    role: 'user',
    content: [
      'Please compare these products and tell me which to buy and why:',
      '',
      ...picked.map(productToPromptLine),
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
  const initialSelected = useMemo(() => {
    const set = new Set<string>();
    (preselectedIds ?? []).forEach((id) => set.add(String(id)));
    return set;
  }, [preselectedIds]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [phase, setPhase] = useState<Phase>('select');
  const [result, setResult] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Email capture (lead gen)
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'queued' | 'sent'>('idle');

  const pickedProducts = useMemo(
    () => products.filter((p) => selected.has(String(p.id))),
    [products, selected],
  );

  const canCompare = selected.size >= MIN_PICKS && selected.size <= MAX_PICKS;

  function toggle(id: string | number) {
    const key = String(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (next.size >= MAX_PICKS) return prev; // cap at MAX_PICKS
        next.add(key);
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
        buildMessages(picked),
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

  function reset() {
    setPhase('select');
    setResult('');
    setErrorMsg('');
    setEmailState('idle');
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
          Not sure which to buy? Tick {MIN_PICKS}–{MAX_PICKS} options and we'll explain
          the difference in plain English and tell you the best pick.
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

          <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {products.length === 0 && (
              <p className="text-sm text-muted-foreground">No products available to compare yet.</p>
            )}
            {products.map((p) => {
              const key = String(p.id);
              const isChecked = selected.has(key);
              const atCap = !isChecked && selected.size >= MAX_PICKS;
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
                    onCheckedChange={() => toggle(p.id)}
                    aria-label={`Compare ${p.name}`}
                  />
                  <span className="flex-1 text-sm text-foreground">{p.name}</span>
                  {p.price != null && p.price !== '' && (
                    <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">
                      {typeof p.price === 'number' ? `AED ${p.price}` : p.price}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
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
