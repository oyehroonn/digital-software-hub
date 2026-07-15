/**
 * UpgradeFinder — AI feature 09 ("own X → upgrade offers").
 *
 * Sales-first CTA: "What should I upgrade?". The buyer types in the software /
 * hardware they already own (in plain English, one item per line or comma
 * separated) and the assistant comes back with a short list of concrete upgrade
 * offers — what to move to, why it's worth it in everyday terms, and a clear
 * next step. Optionally emails the offers so the lead is captured.
 *
 * Resilience contract:
 *  - The whole thing is wrapped in <AIFeature backend="codex">, so it renders
 *    NOTHING (no spinner, no error) unless the LLM proxy is healthy.
 *  - Any runtime LLM failure degrades to a friendly "talk to a specialist"
 *    message and fires an `ai_outage` telemetry event.
 *  - Emailing the offers goes through the STABLE mail bridge; if that bridge is
 *    down the send is parked in the offline queue and retried on reconnect, so a
 *    lead is never lost.
 *
 * This component is self-contained and does NOT wire itself into any page — the
 * Wire step drops it onto the product / account pages.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chat, LLMError } from '@/lib/llm';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';
import { reportAiOutage, track } from '@/lib/stable/analytics';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

// ── Types ────────────────────────────────────────────────────────────────────

const FEATURE = 'upgrade-finder';
const EMAIL_QUEUE_KIND = 'upgrade-finder-email';

/** A single upgrade offer the assistant returns. */
export interface UpgradeOffer {
  /** What they own today (echoed back so the match is obvious). */
  from: string;
  /** The product / edition we recommend upgrading to. */
  upgradeTo: string;
  /** One plain-English sentence on why it's worth it for a non-technical buyer. */
  why: string;
  /** The single biggest everyday benefit, action-oriented. */
  benefit: string;
  /** Short call-to-action label, e.g. "See the upgrade deal". */
  cta: string;
  /** Optional pricing hint, e.g. "Upgrade pricing available". */
  priceHint?: string;
  /** Optional highlight badge, e.g. "Most popular", "Best value". */
  badge?: string;
}

export interface UpgradeFinderProps {
  /** Extra classes for the outer container. */
  className?: string;
  /**
   * Pre-fill the owned-products list (e.g. from the product page the buyer is
   * viewing, or their account). Deduplicated and trimmed.
   */
  initialOwned?: string[];
  /** Heading shown above the CTA. */
  heading?: string;
  /** Sub-copy under the heading. */
  subheading?: string;
}

// ── Email offline-queue processor (registered once) ──────────────────────────
// Sending the offers goes through the stable mail bridge. If the admin bridge is
// down, sendEmail rejects — we park the send here and it retries on reconnect.
registerProcessor<SendEmailArgs>(EMAIL_QUEUE_KIND, (args) => sendEmail(args).then(() => undefined));

// ── LLM plumbing ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = [
  'You are a friendly, straight-talking sales specialist for DSM, a reseller of',
  'professional design, engineering and productivity software and workstations',
  '(think CAD, 3D, creative suites, office and security tools, plus hardware).',
  'A customer tells you what they already own. Recommend the best UPGRADES for',
  'them — newer editions, higher tiers, bundles, or the natural next product.',
  'Rules:',
  '- Write for a NON-TECHNICAL buyer. Plain English, no jargon, no version-number',
  '  soup. Short, warm, confident sentences.',
  '- Be sales-first and action-oriented: make the value obvious and easy to say yes to.',
  '- Only suggest genuine upgrades to things they mentioned. Never invent that they',
  '  own something they did not say. If an item has no sensible upgrade, skip it.',
  '- Return AT MOST 4 offers, best first.',
  'Respond with ONLY a JSON object of the shape:',
  '{"offers":[{"from":string,"upgradeTo":string,"why":string,"benefit":string,',
  '"cta":string,"priceHint"?:string,"badge"?:string}]}',
  'No markdown, no code fences, no prose before or after the JSON.',
].join(' ');

/** Pull the first JSON object out of an LLM reply, tolerating code fences. */
function extractJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

function coerceOffers(parsed: unknown): UpgradeOffer[] {
  const list =
    parsed && typeof parsed === 'object' && Array.isArray((parsed as { offers?: unknown }).offers)
      ? ((parsed as { offers: unknown[] }).offers)
      : Array.isArray(parsed)
        ? (parsed as unknown[])
        : [];

  const offers: UpgradeOffer[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const upgradeTo = typeof o.upgradeTo === 'string' ? o.upgradeTo.trim() : '';
    if (!upgradeTo) continue;
    offers.push({
      from: typeof o.from === 'string' ? o.from.trim() : '',
      upgradeTo,
      why: typeof o.why === 'string' ? o.why.trim() : '',
      benefit: typeof o.benefit === 'string' ? o.benefit.trim() : '',
      cta: typeof o.cta === 'string' && o.cta.trim() ? o.cta.trim() : 'See the upgrade',
      priceHint: typeof o.priceHint === 'string' ? o.priceHint.trim() : undefined,
      badge: typeof o.badge === 'string' ? o.badge.trim() : undefined,
    });
    if (offers.length >= 4) break;
  }
  return offers;
}

async function findUpgrades(owned: string[]): Promise<UpgradeOffer[]> {
  const reply = await chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Here is what I already own:\n${owned.map((o) => `- ${o}`).join('\n')}\n\nWhat should I upgrade?`,
      },
    ],
    { temperature: 0.5, maxTokens: 900 },
  );
  return coerceOffers(extractJson(reply));
}

// ── Owned-products chip input ────────────────────────────────────────────────

function splitEntries(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Inner UI (only rendered when codex-proxy is healthy) ─────────────────────

function UpgradeFinderInner({
  className,
  initialOwned = [],
  heading = 'What should I upgrade?',
  subheading = 'Tell us what you already run and we’ll show you the smartest upgrades — in plain English.',
}: UpgradeFinderProps) {
  const { toast } = useToast();

  const [owned, setOwned] = useState<string[]>(() =>
    Array.from(new Set(initialOwned.map((s) => s.trim()).filter(Boolean))),
  );
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<UpgradeOffer[] | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [email, setEmail] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState(false);

  const canSubmit = owned.length > 0 && !loading;

  const addDraft = useCallback(() => {
    const entries = splitEntries(draft);
    if (entries.length === 0) return;
    setOwned((prev) => {
      const next = [...prev];
      for (const e of entries) {
        if (!next.some((p) => p.toLowerCase() === e.toLowerCase())) next.push(e);
      }
      return next;
    });
    setDraft('');
  }, [draft]);

  const removeOwned = useCallback((item: string) => {
    setOwned((prev) => prev.filter((p) => p !== item));
  }, []);

  const onDraftKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addDraft();
      }
    },
    [addDraft],
  );

  const runSearch = useCallback(async () => {
    // Fold any un-committed draft into the list first.
    const pending = splitEntries(draft);
    const combined = [...owned];
    for (const e of pending) {
      if (!combined.some((p) => p.toLowerCase() === e.toLowerCase())) combined.push(e);
    }
    if (pending.length) {
      setOwned(combined);
      setDraft('');
    }
    if (combined.length === 0) return;

    setLoading(true);
    setDegraded(false);
    setOffers(null);
    setEmailed(false);
    track({ event: 'upgrade_finder_search', eventType: 'ai', metadata: { count: combined.length } });

    try {
      const result = await findUpgrades(combined);
      setOffers(result);
      track({
        event: 'upgrade_finder_results',
        eventType: 'ai',
        metadata: { count: result.length },
      });
    } catch (err) {
      // Runtime LLM failure — degrade gracefully and report the outage.
      setDegraded(true);
      setOffers([]);
      reportAiOutage('codex', FEATURE, err instanceof LLMError ? err.message : err);
    } finally {
      setLoading(false);
    }
  }, [draft, owned]);

  const offersText = useMemo(() => {
    if (!offers || offers.length === 0) return '';
    return offers
      .map(
        (o, i) =>
          `${i + 1}. ${o.upgradeTo}${o.from ? ` (upgrade from ${o.from})` : ''}\n   Why: ${o.why}\n   You get: ${o.benefit}${
            o.priceHint ? `\n   ${o.priceHint}` : ''
          }`,
      )
      .join('\n\n');
  }, [offers]);

  const emailOffers = useCallback(async () => {
    const to = email.trim();
    if (!to || !offers || offers.length === 0) return;

    const args: SendEmailArgs = {
      to,
      subject: 'Your recommended DSM upgrades',
      body: [
        'Hi,',
        '',
        'Thanks for using our Upgrade Finder. Based on what you told us you own,',
        'here are the upgrades we’d recommend:',
        '',
        offersText,
        '',
        'Reply to this email and a DSM specialist will get you upgrade pricing and',
        'answer any questions.',
        '',
        'DSM',
      ].join('\n'),
    };

    setEmailing(true);
    track({ event: 'upgrade_finder_email', eventType: 'ecommerce', metadata: { offers: offers.length } });
    try {
      await sendEmail(args);
      setEmailed(true);
      toast({ title: 'Sent!', description: `Your upgrade options are on their way to ${to}.` });
    } catch {
      // Mail bridge down → park it; it will send when the bridge is back.
      enqueue(EMAIL_QUEUE_KIND, args);
      setEmailed(true);
      toast({
        title: 'Saved — we’ll send it shortly',
        description: `We’ll email your upgrade options to ${to} as soon as we’re back online.`,
      });
    } finally {
      setEmailing(false);
    }
  }, [email, offers, offersText, toast]);

  return (
    <Card className={cn('w-full max-w-2xl border-border/60', className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="text-xl">{heading}</CardTitle>
            <CardDescription>{subheading}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Owned-products input */}
        <div className="space-y-2">
          <Label htmlFor="upgrade-finder-owned">What do you already own?</Label>
          <div className="flex gap-2">
            <Input
              id="upgrade-finder-owned"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKeyDown}
              placeholder="e.g. AutoCAD 2021, Office Home 2019, a 4-year-old laptop"
              autoComplete="off"
            />
            <Button type="button" variant="secondary" onClick={addDraft} disabled={!draft.trim()}>
              <Plus className="h-4 w-4" />
              <span className="sr-only">Add</span>
            </Button>
          </div>

          {owned.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {owned.map((item) => (
                <Badge key={item} variant="secondary" className="gap-1 py-1 pl-3 pr-1.5 text-sm">
                  {item}
                  <button
                    type="button"
                    onClick={() => removeOwned(item)}
                    className="ml-0.5 rounded-full p-0.5 opacity-70 transition hover:bg-foreground/10 hover:opacity-100"
                    aria-label={`Remove ${item}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <Button type="button" onClick={runSearch} disabled={!canSubmit} className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Finding your upgrades…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Show my upgrades
            </>
          )}
        </Button>

        {/* Degraded (LLM failed at runtime) */}
        {degraded && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            Our upgrade assistant is taking a quick breather. Leave your email below and a DSM
            specialist will send you tailored upgrade options.
          </div>
        )}

        {/* No matches */}
        {!degraded && offers && offers.length === 0 && !loading && (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-4 text-sm text-muted-foreground">
            You’re already in good shape — nothing obvious to upgrade. Add a couple more items,
            or talk to a specialist for a tailored recommendation.
          </div>
        )}

        {/* Offers */}
        {offers && offers.length > 0 && (
          <div className="space-y-3">
            {offers.map((o, i) => (
              <div
                key={`${o.upgradeTo}-${i}`}
                className="group rounded-xl border border-border/60 bg-card p-4 transition hover:border-primary/50 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-semibold leading-tight">{o.upgradeTo}</h4>
                      {o.badge && (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">{o.badge}</Badge>
                      )}
                    </div>
                    {o.from && (
                      <p className="mt-0.5 text-xs text-muted-foreground">Upgrade from {o.from}</p>
                    )}
                  </div>
                  <ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </div>

                {o.why && <p className="mt-2 text-sm text-muted-foreground">{o.why}</p>}
                {o.benefit && (
                  <p className="mt-1.5 text-sm font-medium text-foreground">{o.benefit}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="default">
                    {o.cta}
                  </Button>
                  {o.priceHint && (
                    <span className="text-xs text-muted-foreground">{o.priceHint}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lead capture — email me the offers */}
        {(degraded || (offers && offers.length > 0)) && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            <Label htmlFor="upgrade-finder-email" className="flex items-center gap-1.5">
              <Mail className="h-4 w-4" />
              Email me these options
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="upgrade-finder-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                disabled={emailed}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={emailOffers}
                disabled={!email.trim() || emailing || emailed || !offers || offers.length === 0}
              >
                {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {emailed ? 'Sent' : 'Send'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Public component (wrapped in the resilience gate) ────────────────────────

/**
 * UpgradeFinder — renders the "What should I upgrade?" experience only when the
 * codex-proxy LLM backend is healthy; otherwise renders nothing, per the
 * resilience contract.
 */
export default function UpgradeFinder(props: UpgradeFinderProps) {
  return (
    <AIFeature backend="codex" feature={FEATURE}>
      <UpgradeFinderInner {...props} />
    </AIFeature>
  );
}
