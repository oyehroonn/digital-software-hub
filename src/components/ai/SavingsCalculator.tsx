/**
 * Savings Calculator — AI feature 5 (see BUILD_CONTEXT).
 * =====================================================
 * Placement: Home / Pricing. CTA: "See My Savings".
 *
 * A prospect tells us who they buy from today and roughly what they spend. The
 * LLM (codex-proxy, via the same-origin proxy) supplies a CREDIBLE savings
 * percentage plus sales-first, plain-English copy. Every dollar figure the
 * prospect sees is then computed DETERMINISTICALLY in code from their real
 * spend — the model never gets to invent an inconsistent number. Every
 * submission is captured as a LEAD (stable analytics telemetry), EMAILED to the
 * DSM sales desk, AND an estimate is emailed straight to the prospect — all on
 * stable backends so a specialist can follow up while it is warm.
 *
 * Resilience contract:
 *  - Wrapped in <AIFeature backend="codex">. When the LLM proxy is unhealthy it
 *    degrades to a lightweight beta-signup capture (<SavingsBetaSignup/>) so we
 *    STILL collect the lead instead of rendering nothing — it never blocks or
 *    breaks the page.
 *  - Lead capture uses ONLY stable backends. Email sends go through the local
 *    mail bridge; if that bridge is down the lead is parked in the offline queue
 *    and retried automatically — the prospect is never blocked or lost.
 *  - Telemetry is fire-and-forget and never throws.
 *  - Even if the per-request LLM call fails mid-flight, the lead (name/email/
 *    spend) is still captured — a prospect who typed their email is never lost.
 *
 * This file is self-contained and compiles standalone. It is NOT wired into any
 * page here — the Wire step mounts <SavingsCalculator/> where it belongs.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mail,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from 'lucide-react';

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

/**
 * Fire a lead email so it ACTUALLY lands: try the bridge now, and on any failure
 * (bridge down / admin app not running) park it in the offline queue for
 * automatic retry. Never throws, never blocks the UI.
 */
function fireLeadEmail(args: SendEmailArgs): void {
  sendEmail(args).catch(() => {
    enqueue<LeadEmailPayload>(LEAD_EMAIL_QUEUE_KIND, { args });
  });
}

/** Where sales leads are delivered. Overridable via env for staging. */
const SALES_INBOX =
  (import.meta.env.VITE_SALES_LEAD_INBOX as string | undefined) ?? 'it@aljashtrading.com';

/**
 * Credible realized-savings band. The model proposes a percentage; we clamp it
 * into this band so the number a buyer sees is always defensible — no runaway
 * "80% off" claims, no zero. This is the guardrail that makes the math real.
 */
const SAVINGS_BAND = { min: 12, max: 35 } as const;

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

/** The sales copy we ask the model to write (numbers are NOT trusted from here). */
interface SavingsCopy {
  /** Estimated saving as a percentage of current spend — clamped to SAVINGS_BAND. */
  savingsPercent: number;
  /** One short, plain-English sentence a non-technical buyer gets instantly. */
  headline: string;
  /** 2–3 sentence, benefit-led explanation. No jargon. */
  summary: string;
  /** A few concrete DSM offerings/switches that drive the saving. */
  recommendations: string[];
}

/** Copy + the deterministic dollar math derived from the prospect's real spend. */
interface SavingsResult extends SavingsCopy {
  annualSpend: number;
  annualSavings: number;
  monthlySavings: number;
  newAnnualSpend: number;
  threeYearSavings: number;
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

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return SAVINGS_BAND.min;
  return Math.min(SAVINGS_BAND.max, Math.max(SAVINGS_BAND.min, Math.round(n)));
}

/**
 * The real math. Given the prospect's ACTUAL annualized spend and a credible
 * savings percentage, derive every dollar figure deterministically so the whole
 * result is internally consistent (annualSavings === annualSpend × pct / 100).
 */
function computeSavings(annualSpend: number, copy: SavingsCopy): SavingsResult {
  const savingsPercent = clampPercent(copy.savingsPercent);
  const spend = Math.max(0, annualSpend);
  const annualSavings = Math.round((spend * savingsPercent) / 100);
  return {
    ...copy,
    savingsPercent,
    annualSpend: spend,
    annualSavings,
    monthlySavings: Math.round(annualSavings / 12),
    newAnnualSpend: Math.max(0, spend - annualSavings),
    threeYearSavings: annualSavings * 3,
  };
}

/** Pull the first JSON object out of an LLM reply, tolerating prose / fences. */
function extractCopy(reply: string): SavingsCopy {
  const fenced = reply.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new LLMError('Could not read a savings estimate from the model.');
  }
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as Partial<SavingsCopy>;

  const savingsPercent = clampPercent(Number(parsed.savingsPercent));
  const headline = String(parsed.headline ?? '').trim();
  const summary = String(parsed.summary ?? '').trim();
  const recommendations = Array.isArray(parsed.recommendations)
    ? parsed.recommendations.map((r) => String(r).trim()).filter(Boolean).slice(0, 5)
    : [];

  if (!headline && !summary) {
    throw new LLMError('The model returned an empty estimate.');
  }
  return { savingsPercent, headline, summary, recommendations };
}

function buildMessages(lead: LeadInput, annualSpend: number): ChatMessage[] {
  const system =
    'You are a DSM sales estimator. DSM is a value-focused reseller of professional ' +
    'software licenses, IT services and 3D/CAD tooling (trusted by businesses since ' +
    '1994) that helps companies cut software spend without losing capability. Given a ' +
    "prospect's current vendor and annual software spend, choose a realistic, " +
    'encouraging savings PERCENTAGE and write warm sales copy. Be optimistic but ' +
    `credible: realistic realized savings sit between ${SAVINGS_BAND.min}% and ` +
    `${SAVINGS_BAND.max}%. Never invent exact vendor pricing and DO NOT output any ` +
    'dollar amounts — the site computes the dollars from the real spend. Reply with ' +
    'ONE JSON object and nothing else, matching exactly this shape: ' +
    '{"savingsPercent": number, "headline": string, "summary": string, ' +
    '"recommendations": string[]}. ' +
    'savingsPercent: a whole number in the credible band. ' +
    'headline: one punchy, plain-English sentence that makes them want to act today. ' +
    'summary: 2-3 warm, benefit-led sentences, zero jargon, speaking directly to "you". ' +
    'recommendations: 2-4 concrete switches or DSM offerings that drive the saving.';

  const user =
    `Current vendor: ${lead.vendor || 'not specified'}\n` +
    `Estimated current annual software spend: ${annualSpend}\n` +
    'Buyer is non-technical and price-sensitive. Give them a reason to talk to DSM today.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildSalesEmail(lead: LeadInput, result: SavingsResult): SendEmailArgs {
  const subject = `New savings lead: ${lead.name || lead.email} — ~${formatMoney(
    result.annualSavings,
  )}/yr off ${lead.vendor || 'current vendor'}`;
  const body = [
    'A new lead used the Savings Calculator on the DSM site.',
    '',
    `Name:            ${lead.name || '(not given)'}`,
    `Email:           ${lead.email}`,
    `Current vendor:  ${lead.vendor || '(not given)'}`,
    `Current spend:   ${lead.spendRaw} (${lead.cadence})`,
    `Annualized:      ~${formatMoney(result.annualSpend)}`,
    '',
    '--- Estimate shown to the prospect (dollars computed from their spend) ---',
    `Estimated saving:   ${result.savingsPercent}%  (~${formatMoney(result.annualSavings)} / year)`,
    `Per month:          ~${formatMoney(result.monthlySavings)}`,
    `Over 3 years:       ~${formatMoney(result.threeYearSavings)}`,
    `New annual spend:   ~${formatMoney(result.newAnnualSpend)}`,
    `Headline:           ${result.headline}`,
    `Summary:            ${result.summary}`,
    result.recommendations.length
      ? `Recommendations:\n  - ${result.recommendations.join('\n  - ')}`
      : '',
    '',
    'Follow up while it is warm.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { to: SALES_INBOX, subject, body };
}

function buildProspectEmail(lead: LeadInput, result: SavingsResult): SendEmailArgs {
  const first = (lead.name || '').trim().split(/\s+/)[0];
  const subject = `Your DSM savings estimate: ~${formatMoney(result.annualSavings)}/year`;
  const body = [
    `Hi${first ? ' ' + first : ''},`,
    '',
    'Thanks for trying the DSM Savings Calculator. Here is your personalized estimate:',
    '',
    `  • Estimated saving:  ${result.savingsPercent}%`,
    `  • You keep:          ~${formatMoney(result.annualSavings)} per year (~${formatMoney(
      result.monthlySavings,
    )} / month)`,
    `  • Over three years:  ~${formatMoney(result.threeYearSavings)}`,
    lead.vendor ? `  • Switching from:    ${lead.vendor}` : '',
    '',
    result.headline,
    '',
    result.summary,
    '',
    result.recommendations.length
      ? 'Where the savings come from:\n' +
        result.recommendations.map((r) => `  - ${r}`).join('\n')
      : '',
    '',
    'These are estimates — a DSM savings specialist will confirm your exact price with ',
    'no obligation. Just reply to this email and we will lock it in.',
    '',
    'Talk soon,',
    'The DSM team — trusted since 1994',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { to: lead.email.trim(), subject, body };
}

/**
 * Capture a QUALIFIED lead (we have a real estimate) on STABLE backends only.
 * Never throws, never blocks the UI:
 *  - fire a `lead_captured` telemetry event (analytics; fire-and-forget)
 *  - email the sales desk AND email the prospect their estimate; either send,
 *    if the bridge is down, is parked in the offline queue for automatic retry.
 */
function captureLead(lead: LeadInput, result: SavingsResult): void {
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
      annualSpend: result.annualSpend,
      savingsPercent: result.savingsPercent,
      annualSavings: result.annualSavings,
    },
  });

  fireLeadEmail(buildSalesEmail(lead, result));
  fireLeadEmail(buildProspectEmail(lead, result));
}

/**
 * Capture a lead even when we could NOT produce an estimate (LLM hiccup) or the
 * prospect signed up via the degraded beta form. We still have their contact +
 * spend, so the sales desk gets it and the prospect is never lost.
 */
function captureRawLead(lead: LeadInput, annualSpend: number, source: string): void {
  track({
    event: 'lead_captured',
    eventType: 'ai',
    elementText: 'savings-calculator',
    metadata: {
      feature: 'savings-calculator',
      source,
      email: lead.email,
      name: lead.name,
      vendor: lead.vendor,
      spendRaw: lead.spendRaw,
      cadence: lead.cadence,
      annualSpend,
      savingsPercent: null,
    },
  });

  const subject = `New savings lead (${source}): ${lead.name || lead.email}`;
  const body = [
    `A new lead came in via the DSM Savings Calculator (${source}).`,
    '',
    `Name:            ${lead.name || '(not given)'}`,
    `Email:           ${lead.email}`,
    `Current vendor:  ${lead.vendor || '(not given)'}`,
    lead.spendRaw ? `Current spend:   ${lead.spendRaw} (${lead.cadence})` : '',
    annualSpend > 0 ? `Annualized:      ~${formatMoney(annualSpend)}` : '',
    '',
    'No AI estimate was generated — reach out and quote them manually while it is warm.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  fireLeadEmail({ to: SALES_INBOX, subject, body });
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
  const [result, setResult] = useState<SavingsResult | null>(null);
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
        // The model supplies copy + a percentage; the DOLLARS are computed here
        // from the prospect's real spend, so the estimate is always consistent.
        const computed = computeSavings(annualSpend, extractCopy(reply));
        setResult(computed);
        setPhase('result');
        captureLead(lead, computed);
      } catch (err) {
        // codex-proxy hiccup mid-request. Do not break the page. We STILL have a
        // real lead (name/email/spend) — capture it so the prospect is not lost.
        track({
          event: 'ai_outage',
          eventType: 'error',
          metadata: {
            service: 'codex',
            feature: 'savings-calculator',
            error: err instanceof Error ? err.message : String(err),
          },
        });
        captureRawLead(lead, annualSpend, 'estimate-failed');
        setErrorMsg(
          'We could not crunch the numbers just now — but we have your details and a ' +
            'DSM specialist will email your savings shortly. You can also try again.',
        );
        setPhase('error');
      }
    },
    [lead, annualSpend, validationError],
  );

  const reset = useCallback(() => {
    setResult(null);
    setErrorMsg('');
    setPhase('form');
  }, []);

  // ── Result view ────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
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
            {result.savingsPercent}%
          </span>
          <span className="pb-1 text-lg text-muted-foreground">
            ≈ <strong className="text-foreground">{formatMoney(result.annualSavings)}</strong> back in your pocket / year
          </span>
        </div>

        <p className="mt-4 text-lg font-semibold text-foreground">{result.headline}</p>
        <p className="mt-2 text-muted-foreground">{result.summary}</p>

        {/* Real, consistent breakdown — every figure derived from the spend entered. */}
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Per month', value: formatMoney(result.monthlySavings) },
            { label: 'Per year', value: formatMoney(result.annualSavings) },
            { label: 'Over 3 years', value: formatMoney(result.threeYearSavings) },
            { label: 'New annual spend', value: formatMoney(result.newAnnualSpend) },
          ].map((tile) => (
            <div key={tile.label} className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 p-3">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</dt>
              <dd className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">{tile.value}</dd>
            </div>
          ))}
        </dl>

        {result.recommendations.length > 0 && (
          <ul className="mt-5 space-y-2">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            We&apos;ve sent this estimate to <strong>{lead.email}</strong> and a DSM savings specialist
            will reach out to lock in your price — no obligation.
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
            <a
              href={`mailto:${SALES_INBOX}?subject=${encodeURIComponent(
                'I want my DSM savings',
              )}&body=${encodeURIComponent(
                `Please lock in my estimated ${result.savingsPercent}% saving (~${formatMoney(
                  result.annualSavings,
                )}/yr). My email: ${lead.email}`,
              )}`}
            >
              Claim my savings <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
          <Button variant="outline" onClick={reset}>
            Recalculate
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Trusted by businesses since 1994
          </span>
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
      <h3 className="mt-2 text-2xl font-bold text-foreground">Stop overpaying for software</h3>
      <p className="mt-1 text-muted-foreground">
        Tell us who you buy from today and roughly what you spend. In seconds you&apos;ll see
        exactly how much DSM can put back in your pocket — free, and no obligation.
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

      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Free estimate · no obligation · trusted since 1994
      </p>
    </form>
  );
}

// ── Beta-signup degradation (mounted when codex-proxy is DOWN) ────────────────
//
// The AI estimator needs the LLM. When the proxy is unhealthy we must NOT render
// nothing — a prospect ready to save is a lead we want. So we degrade to a
// lightweight capture: they leave their email, we log the lead and email the
// sales desk on stable backends, and a specialist follows up manually.

function SavingsBetaSignup({ className }: { className?: string }) {
  const fieldId = useId();
  const [lead, setLead] = useState<LeadInput>({
    name: '',
    email: '',
    vendor: '',
    spendRaw: '',
    cadence: 'yearly',
  });
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValidEmail(lead.email)) {
        setErrorMsg('Enter a valid email so a specialist can send your savings.');
        return;
      }
      setErrorMsg('');
      const base = parseSpend(lead.spendRaw);
      const annualSpend = lead.cadence === 'monthly' ? base * 12 : base;
      captureRawLead(lead, annualSpend, 'beta-signup');
      setDone(true);
    },
    [lead],
  );

  if (done) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm dark:from-emerald-950/40 dark:to-background sm:p-8',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">You&apos;re on the list</span>
        </div>
        <p className="mt-3 text-lg font-semibold text-foreground">
          Thanks — a DSM savings specialist will email <strong>{lead.email}</strong> with your
          personalized numbers.
        </p>
        <p className="mt-2 text-muted-foreground">
          No obligation. We&apos;ll show you exactly where you&apos;re overpaying and how much you keep by
          switching to DSM.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn('rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8', className)}
    >
      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
        <PiggyBank className="h-5 w-5" aria-hidden />
        <span className="text-sm font-semibold uppercase tracking-wide">Savings Calculator</span>
      </div>
      <h3 className="mt-2 text-2xl font-bold text-foreground">Get your personalized savings</h3>
      <p className="mt-1 text-muted-foreground">
        Leave your details and who you buy from today. A DSM specialist will send your estimated
        savings — free and with no obligation.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${fieldId}-name`}>Your name</Label>
          <Input
            id={`${fieldId}-name`}
            placeholder="Full name"
            value={lead.name}
            onChange={(e) => setLead((p) => ({ ...p, name: e.target.value }))}
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
            onChange={(e) => setLead((p) => ({ ...p, email: e.target.value }))}
            autoComplete="email"
            required
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-vendor`}>Who do you buy from?</Label>
          <Input
            id={`${fieldId}-vendor`}
            placeholder="e.g. Autodesk, Adobe…"
            value={lead.vendor}
            onChange={(e) => setLead((p) => ({ ...p, vendor: e.target.value }))}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor={`${fieldId}-spend`}>Current spend (optional)</Label>
          <Input
            id={`${fieldId}-spend`}
            inputMode="decimal"
            placeholder="e.g. 12,000/yr"
            value={lead.spendRaw}
            onChange={(e) => setLead((p) => ({ ...p, spendRaw: e.target.value }))}
            className="mt-1.5"
          />
        </div>
      </div>

      {errorMsg && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-6 w-full bg-emerald-600 text-base hover:bg-emerald-700 sm:w-auto">
        Send me my savings <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Free · no obligation · trusted since 1994
      </p>
    </form>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface SavingsCalculatorProps {
  /** Optional extra classes for the outer card. */
  className?: string;
}

/**
 * Drop-in Savings Calculator. When the LLM backend is healthy it runs the full
 * AI estimate; when it is down it degrades to a beta-signup lead capture (per
 * the resilience contract) — so it is always safe to place on a page and always
 * captures the lead.
 */
export default function SavingsCalculator({ className }: SavingsCalculatorProps) {
  return (
    <AIFeature
      backend="codex"
      feature="savings-calculator"
      fallback={<SavingsBetaSignup className={className} />}
    >
      <SavingsCalculatorInner className={className} />
    </AIFeature>
  );
}
