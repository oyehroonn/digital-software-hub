/**
 * Savings Calculator — AI feature 5 (see BUILD_CONTEXT).
 * =====================================================
 * Placement: Home / Pricing. CTA: "See My Savings".
 *
 * A prospect tells us who they buy from today and roughly what they spend. The
 * LLM (codex-proxy, via the same-origin proxy) turns that into a plain-English,
 * sales-first savings estimate they can act on immediately. Every submission is
 * captured as a LEAD (stable analytics telemetry) and EMAILED to the DSM sales
 * desk (stable email bridge) so a specialist can follow up.
 *
 * Resilience contract:
 *  - Wrapped in <AIFeature backend="codex">, so the whole thing renders NOTHING
 *    when the LLM proxy is unhealthy — it never blocks or breaks the page.
 *  - Lead capture uses ONLY stable backends. The email send goes through the
 *    local mail bridge; if that bridge is down the lead is parked in the offline
 *    queue and retried automatically — the prospect is never blocked.
 *  - Telemetry is fire-and-forget and never throws.
 *
 * This file is self-contained and compiles standalone. It is NOT wired into any
 * page here — the Wire step mounts <SavingsCalculator/> where it belongs.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import { ArrowRight, Loader2, PiggyBank, Sparkles, TrendingDown } from 'lucide-react';

import AIFeature from './AIFeature';
import { chat, LLMError, type ChatMessage } from '@/lib/llm';
import { track } from '@/lib/stable/analytics';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ── Offline-resilient lead email ─────────────────────────────────────────────
//
// The mail bridge is only up when the admin app is running. So we NEVER await it
// on the critical path and we NEVER let a bridge outage lose a lead: sending is
// routed through the offline queue, which retries on reconnect / app-launch.

const LEAD_EMAIL_QUEUE_KIND = 'savings_lead_email';

interface LeadEmailPayload {
  args: SendEmailArgs;
}

// Register the processor once at module load (mirrors analytics.ts / orders.ts).
registerProcessor<LeadEmailPayload>(LEAD_EMAIL_QUEUE_KIND, ({ args }) => sendEmail(args).then(() => undefined));

/** Where sales leads are delivered. Overridable via env for staging. */
const SALES_INBOX =
  (import.meta.env.VITE_SALES_LEAD_INBOX as string | undefined) ?? 'it@aljashtrading.com';

// ── Types ────────────────────────────────────────────────────────────────────

interface LeadInput {
  name: string;
  email: string;
  vendor: string;
  /** Current spend as the prospect typed it (raw, before parsing). */
  spendRaw: string;
  /** Whether spend is billed monthly or yearly. */
  cadence: 'monthly' | 'yearly';
}

/** The structured estimate we ask the model to return. */
interface SavingsEstimate {
  /** Estimated saving as a percentage of current spend (0–100). */
  savingsPercent: number;
  /** Estimated saving in the same period the prospect entered (their currency-agnostic number). */
  estimatedAnnualSavings: number;
  /** One short, plain-English sentence a non-technical buyer gets instantly. */
  headline: string;
  /** 2–3 sentence, benefit-led explanation. No jargon. */
  summary: string;
  /** A few concrete DSM offerings/switches that drive the saving. */
  recommendations: string[];
}

type Phase = 'form' | 'calculating' | 'result' | 'error';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSpend(raw: string): number {
  // Accept "1,200", "$1200", "1.2k", "1200/mo" etc. Best-effort.
  const cleaned = raw.replace(/[^0-9.kKmM]/g, '');
  const kMatch = /^([0-9]*\.?[0-9]+)\s*[kK]$/.exec(cleaned);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);
  const mMatch = /^([0-9]*\.?[0-9]+)\s*[mM]$/.exec(cleaned);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return Math.round(value).toLocaleString('en-US');
}

/** Pull the first JSON object out of an LLM reply, tolerating prose / fences. */
function extractEstimate(reply: string): SavingsEstimate {
  const fenced = reply.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new LLMError('Could not read a savings estimate from the model.');
  }
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as Partial<SavingsEstimate>;

  const savingsPercent = clampPercent(Number(parsed.savingsPercent));
  const estimatedAnnualSavings = Math.max(0, Number(parsed.estimatedAnnualSavings) || 0);
  const headline = String(parsed.headline ?? '').trim();
  const summary = String(parsed.summary ?? '').trim();
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((r) => String(r).trim()).filter(Boolean).slice(0, 5)
    : [];

  if (!headline && !summary) {
    throw new LLMError('The model returned an empty estimate.');
  }
  return { savingsPercent, estimatedAnnualSavings, headline, summary, recommendations };
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function buildMessages(lead: LeadInput, annualSpend: number): ChatMessage[] {
  const system =
    'You are a DSM sales estimator. DSM is a value-focused reseller of professional ' +
    'software licenses, IT services and 3D/CAD tooling that helps businesses cut ' +
    'software spend without losing capability. Given a prospect\'s current vendor and ' +
    'annual software spend, produce a realistic, encouraging savings estimate a ' +
    'non-technical buyer can act on. Be optimistic but credible: typical realized ' +
    'savings range 12%–35%. Never invent exact vendor pricing. Reply with ONE JSON ' +
    'object and nothing else, matching exactly this shape: ' +
    '{"savingsPercent": number, "estimatedAnnualSavings": number, "headline": string, ' +
    '"summary": string, "recommendations": string[]}. ' +
    'headline: one punchy plain-English sentence. summary: 2-3 warm, benefit-led ' +
    'sentences, zero jargon. recommendations: 2-4 concrete switches or DSM offerings ' +
    'that drive the saving. estimatedAnnualSavings must roughly equal ' +
    'annualSpend * savingsPercent / 100.';

  const user =
    `Current vendor: ${lead.vendor || 'not specified'}\n` +
    `Estimated current annual software spend: ${annualSpend}\n` +
    `Buyer is non-technical and price-sensitive. Give them a reason to talk to DSM today.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildLeadEmail(lead: LeadInput, annualSpend: number, est: SavingsEstimate): SendEmailArgs {
  const subject = `New savings lead: ${lead.name || lead.email} (~${est.savingsPercent}% off ${lead.vendor || 'current vendor'})`;
  const body = [
    'A new lead used the Savings Calculator on the DSM site.',
    '',
    `Name:            ${lead.name || '(not given)'}`,
    `Email:           ${lead.email}`,
    `Current vendor:  ${lead.vendor || '(not given)'}`,
    `Current spend:   ${lead.spendRaw} (${lead.cadence})`,
    `Annualized:      ~${formatMoney(annualSpend)}`,
    '',
    '--- AI estimate shown to the prospect ---',
    `Estimated saving:   ${est.savingsPercent}%  (~${formatMoney(est.estimatedAnnualSavings)} / year)`,
    `Headline:           ${est.headline}`,
    `Summary:            ${est.summary}`,
    est.recommendations.length ? `Recommendations:\n  - ${est.recommendations.join('\n  - ')}` : '',
    '',
    'Follow up while it is warm.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { to: SALES_INBOX, subject, body };
}

/**
 * Capture the lead on STABLE backends only. Never throws, never blocks the UI:
 *  - fire a `lead_captured` telemetry event (analytics; fire-and-forget)
 *  - email the sales desk; if the bridge is down, park it in the offline queue
 */
function captureLead(lead: LeadInput, annualSpend: number, est: SavingsEstimate): void {
  track({
    event: 'lead_captured',
    eventType: 'ai',
    elementText: 'savings-calculator',
    metadata: {
      feature: 'savings-calculator',
      email: lead.email,
      name: lead.name,
      vendor: lead.vendor,
      spendRaw: lead.spendRaw,
      cadence: lead.cadence,
      annualSpend,
      savingsPercent: est.savingsPercent,
      estimatedAnnualSavings: est.estimatedAnnualSavings,
    },
  });

  const emailArgs = buildLeadEmail(lead, annualSpend, est);
  // Try to send now; on any failure (bridge down) queue it for automatic retry.
  sendEmail(emailArgs).catch(() => {
    enqueue<LeadEmailPayload>(LEAD_EMAIL_QUEUE_KIND, { args: emailArgs });
  });
}

// ── Inner UI (only mounted when codex-proxy is healthy) ───────────────────────

function SavingsCalculatorInner({ className }: { className?: string }) {
  const fieldId = useId();
  const [lead, setLead] = useState<LeadInput>({
    name: '',
    email: '',
    vendor: '',
    spendRaw: '',
    cadence: 'yearly',
  });
  const [phase, setPhase] = useState<Phase>('form');
  const [estimate, setEstimate] = useState<SavingsEstimate | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const annualSpend = useMemo(() => {
    const base = parseSpend(lead.spendRaw);
    return lead.cadence === 'monthly' ? base * 12 : base;
  }, [lead.spendRaw, lead.cadence]);

  const update = useCallback(
    (patch: Partial<LeadInput>) => setLead((prev) => ({ ...prev, ...patch })),
    [],
  );

  const validationError = useMemo(() => {
    if (!isValidEmail(lead.email)) return 'Enter a valid email so we can send your estimate.';
    if (annualSpend <= 0) return 'Enter your current software spend to see your savings.';
    return '';
  }, [lead.email, annualSpend]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (validationError) {
        setErrorMsg(validationError);
        return;
      }
      setErrorMsg('');
      setPhase('calculating');

      track({
        event: 'savings_calculator_submit',
        eventType: 'ai',
        metadata: { feature: 'savings-calculator', vendor: lead.vendor, annualSpend },
      });

      try {
        const reply = await chat(buildMessages(lead, annualSpend), {
          temperature: 0.5,
          maxTokens: 500,
        });
        const est = extractEstimate(reply);
        setEstimate(est);
        setPhase('result');
        // Lead capture happens on success — we have a real estimate to email.
        captureLead(lead, annualSpend, est);
      } catch (err) {
        // codex-proxy hiccup mid-request. Do not break the page; offer a retry.
        track({
          event: 'ai_outage',
          eventType: 'error',
          metadata: {
            service: 'codex',
            feature: 'savings-calculator',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        setErrorMsg('We could not crunch the numbers just now. Please try again in a moment.');
        setPhase('error');
      }
    },
    [lead, annualSpend, validationError],
  );

  const reset = useCallback(() => {
    setEstimate(null);
    setErrorMsg('');
    setPhase('form');
  }, []);

  // ── Result view ────────────────────────────────────────────────────────────
  if (phase === 'result' && estimate) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm dark:from-emerald-950/40 dark:to-background sm:p-8',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <TrendingDown className="h-5 w-5" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">Your estimated savings</span>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
          <span className="text-5xl font-bold leading-none text-emerald-600 dark:text-emerald-400">
            {estimate.savingsPercent}%
          </span>
          <span className="pb-1 text-lg text-muted-foreground">
            ≈ <strong className="text-foreground">{formatMoney(estimate.estimatedAnnualSavings)}</strong> saved / year
          </span>
        </div>

        <p className="mt-4 text-lg font-semibold text-foreground">{estimate.headline}</p>
        <p className="mt-2 text-muted-foreground">{estimate.summary}</p>

        {estimate.recommendations.length > 0 && (
          <ul className="mt-4 space-y-2">
            {estimate.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          A DSM savings specialist will reach out to <strong>{lead.email}</strong> to lock in your price.
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <a href="mailto:sales@dsm.com?subject=I%20want%20my%20DSM%20savings">
              Claim my savings <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" onClick={reset}>
            Recalculate
          </Button>
        </div>
      </div>
    );
  }

  // ── Form / calculating / error view ─────────────────────────────────────────
  const busy = phase === 'calculating';
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <PiggyBank className="h-5 w-5" aria-hidden />
        <span className="text-sm font-semibold uppercase tracking-wide">Savings Calculator</span>
      </div>
      <h3 className="mt-2 text-2xl font-bold text-foreground">See how much DSM can save you</h3>
      <p className="mt-1 text-muted-foreground">
        Tell us who you buy from today and roughly what you spend. We&apos;ll show your
        estimated savings in seconds — no obligation.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${fieldId}-vendor`}>Who do you buy from today?</Label>
          <Input
            id={`${fieldId}-vendor`}
            placeholder="e.g. Autodesk, Adobe, Microsoft, a local reseller…"
            value={lead.vendor}
            onChange={(e) => update({ vendor: e.target.value })}
            disabled={busy}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-spend`}>Current software spend</Label>
          <Input
            id={`${fieldId}-spend`}
            inputMode="decimal"
            placeholder="e.g. 12,000 or 1.2k"
            value={lead.spendRaw}
            onChange={(e) => update({ spendRaw: e.target.value })}
            disabled={busy}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-cadence`}>Billed</Label>
          <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md border border-input bg-background p-1">
            {(['monthly', 'yearly'] as const).map((c) => (
              <button
                key={c}
                type="button"
                disabled={busy}
                onClick={() => update({ cadence: c })}
                className={cn(
                  'rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                  lead.cadence === c
                    ? 'bg-emerald-600 text-white'
                    : 'text-muted-foreground hover:bg-muted',
                )}
                aria-pressed={lead.cadence === c}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor={`${fieldId}-name`}>Your name</Label>
          <Input
            id={`${fieldId}-name`}
            placeholder="Full name"
            value={lead.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={busy}
            autoComplete="name"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-email`}>Work email</Label>
          <Input
            id={`${fieldId}-email`}
            type="email"
            placeholder="you@company.com"
            value={lead.email}
            onChange={(e) => update({ email: e.target.value })}
            disabled={busy}
            autoComplete="email"
            required
            className="mt-1.5"
          />
        </div>
      </div>

      {annualSpend > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          That&apos;s about <strong>{formatMoney(annualSpend)}</strong> a year we&apos;ll price against.
        </p>
      )}

      {errorMsg && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        disabled={busy}
        className="mt-6 w-full bg-emerald-600 text-base hover:bg-emerald-700 sm:w-auto"
        size="lg"
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Crunching your numbers…
          </>
        ) : (
          <>
            See My Savings <ArrowRight className="ml-1.5 h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface SavingsCalculatorProps {
  /** Optional extra classes for the outer card. */
  className?: string;
}

/**
 * Drop-in Savings Calculator. Renders nothing when the LLM backend is down
 * (per the resilience contract), so it is always safe to place on a page.
 */
export default function SavingsCalculator({ className }: SavingsCalculatorProps) {
  return (
    <AIFeature backend="codex" feature="savings-calculator">
      <SavingsCalculatorInner className={className} />
    </AIFeature>
  );
}
