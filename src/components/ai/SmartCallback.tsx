/**
 * Smart Callback — AI feature 10 (see BUILD_CONTEXT).
 * ===================================================
 * Placement: AI Lab / footer. CTA: "Book a Call".
 *
 * A prospect says, in plain English, what they need. The LLM (codex-proxy, via
 * the same-origin proxy) turns that into a crisp, sales-ready brief — a call
 * title, a one-paragraph summary and a short agenda — then we book a 30-minute
 * call on the DSM sales calendar via the STABLE email/calendar bridge
 * (createEvent), fully PRE-FILLED with the prospect's details and the AI summary
 * so a specialist walks in already knowing the pitch.
 *
 * Resilience contract:
 *  - Wrapped in <AIFeature backend="codex"> with a beta-signup degradation: when
 *    the LLM proxy is unhealthy the widget swaps to a lightweight capture form
 *    (same fields, same STABLE booking) that skips the AI brief but STILL books
 *    the call from the prospect's own words — a down model never means a lost
 *    lead or a dead-end. The wrapper re-checks the proxy on an interval, so the
 *    full AI experience returns automatically once it recovers.
 *  - Booking uses ONLY stable backends. The calendar/email goes through the
 *    local mail bridge; if that bridge is down the booking + the sales notice are
 *    parked in the offline queue and retried automatically. The prospect is
 *    NEVER blocked and a lead is NEVER lost.
 *  - If the LLM hiccups mid-request we still book the call using the prospect's
 *    own words as the summary, and fire an `ai_outage` telemetry event. A calendar
 *    booking is far too valuable to drop over a transient model error.
 *  - Telemetry is fire-and-forget and never throws.
 *
 * This file is self-contained and compiles standalone. It is NOT wired into any
 * page here — the Wire step mounts <SmartCallback/> where it belongs.
 */

import { useCallback, useId, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, CheckCircle2, Loader2, Phone, Sparkles } from 'lucide-react';

import AIFeature from './AIFeature';
import { chat, type ChatMessage } from '@/lib/llm';
import { track } from '@/lib/stable/analytics';
import {
  createEvent,
  sendEmail,
  type CreateEventArgs,
  type SendEmailArgs,
} from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ── Offline-resilient booking + notify ───────────────────────────────────────
//
// The mail/calendar bridge is only up when the admin app is running. So we NEVER
// await it on the critical path and we NEVER let a bridge outage lose a booking:
// both the calendar event and the sales notice are routed through the offline
// queue, which retries on reconnect / app-launch.

const BOOKING_QUEUE_KIND = 'callback_booking';
const NOTIFY_QUEUE_KIND = 'callback_notify_email';

interface BookingPayload {
  args: CreateEventArgs;
}
interface NotifyPayload {
  args: SendEmailArgs;
}

// Register processors once at module load (mirrors analytics.ts / orders.ts).
registerProcessor<BookingPayload>(BOOKING_QUEUE_KIND, ({ args }) =>
  createEvent(args).then(() => undefined),
);
registerProcessor<NotifyPayload>(NOTIFY_QUEUE_KIND, ({ args }) =>
  sendEmail(args).then(() => undefined),
);

/** Where callback bookings + notices are delivered. Overridable via env. */
const SALES_INBOX =
  (import.meta.env.VITE_SALES_LEAD_INBOX as string | undefined) ?? 'it@aljashtrading.com';

/** Length of every callback, in minutes. */
const CALL_DURATION_MIN = 30;

// ── Types ────────────────────────────────────────────────────────────────────

interface CallbackInput {
  name: string;
  email: string;
  phone: string;
  company: string;
  /** What the prospect needs, in their own words. */
  intent: string;
  /** <input type="datetime-local"> value, e.g. "2026-07-16T15:00". */
  when: string;
}

/** The sales brief we ask the model to produce from the raw intent. */
interface CallBrief {
  /** Short calendar title, e.g. "DSM call: Autodesk license renewal". */
  callTitle: string;
  /** One warm, plain-English paragraph a specialist can read at a glance. */
  summary: string;
  /** 2–4 concrete talking points for the call. */
  agenda: string[];
}

type Phase = 'form' | 'booking' | 'booked' | 'error';

/**
 * Which experience produced a booking:
 *  - 'ai'   → codex-proxy healthy, the form used the AI-generated brief;
 *  - 'beta' → LLM degraded, the form booked straight from the prospect's words.
 */
type BookingSource = 'ai' | 'beta';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format a Date as ISO-8601 preserving the local timezone offset. */
function toOffsetIso(d: Date): string {
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const abs = Math.abs(tzMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00${offset}`
  );
}

/** A sensible default: tomorrow at 10:00 local, formatted for datetime-local. */
function defaultWhen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Earliest bookable moment (now), formatted for the datetime-local `min` attr. */
function minWhen(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function friendlyWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return d.toLocaleString();
  }
}

/** Pull the first JSON object out of an LLM reply, tolerating prose / fences. */
function extractBrief(reply: string): CallBrief {
  const fenced = reply.replace(/```(?:json)?/gi, '').trim();
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not read a call brief from the model.');
  }
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as Partial<CallBrief>;

  const callTitle = String(parsed.callTitle ?? '').trim();
  const summary = String(parsed.summary ?? '').trim();
  const agenda = Array.isArray(parsed.agenda)
    ? parsed.agenda.map((a) => String(a).trim()).filter(Boolean).slice(0, 4)
    : [];

  if (!summary && !callTitle) {
    throw new Error('The model returned an empty brief.');
  }
  return {
    callTitle: callTitle || 'DSM sales call',
    summary,
    agenda,
  };
}

/** Fallback brief built from the prospect's own words when the LLM is unavailable. */
function fallbackBrief(input: CallbackInput): CallBrief {
  const trimmed = input.intent.trim();
  const shortIntent = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
  return {
    callTitle: `DSM call: ${shortIntent || 'sales enquiry'}`,
    summary:
      `${input.name || 'A prospect'} from ${input.company || 'their business'} asked for a ` +
      `callback about: “${trimmed || 'a general enquiry'}”.`,
    agenda: [],
  };
}

function buildMessages(input: CallbackInput): ChatMessage[] {
  const system =
    'You are a DSM sales-desk assistant. DSM is a value-focused reseller of ' +
    'professional software licenses, IT services and 3D/CAD tooling that helps ' +
    'businesses cut software spend without losing capability. A prospect has asked ' +
    'for a 30-minute callback. Turn their request into a crisp brief the sales rep ' +
    'reads before dialing. Reply with ONE JSON object and nothing else, matching ' +
    'exactly this shape: {"callTitle": string, "summary": string, "agenda": string[]}. ' +
    'callTitle: a short calendar title (max ~8 words) naming the concrete need. ' +
    'summary: ONE warm, plain-English paragraph (2-3 sentences), zero jargon, that ' +
    'tells the rep who this is and what they want. agenda: 2-4 concrete talking ' +
    'points that move the deal forward. Never invent facts the prospect did not give.';

  const user =
    `Prospect name: ${input.name || '(not given)'}\n` +
    `Company: ${input.company || '(not given)'}\n` +
    `What they need (their words): ${input.intent.trim() || '(not given)'}\n` +
    'Write the brief.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function buildEventArgs(input: CallbackInput, brief: CallBrief, startIso: string, endIso: string): CreateEventArgs {
  const description = [
    brief.summary,
    '',
    'Contact:',
    `  Name:    ${input.name || '(not given)'}`,
    `  Email:   ${input.email}`,
    `  Phone:   ${input.phone || '(not given)'}`,
    `  Company: ${input.company || '(not given)'}`,
    '',
    'In their words:',
    `  ${input.intent.trim() || '(not given)'}`,
    brief.agenda.length ? '' : '',
    brief.agenda.length ? 'Suggested agenda:' : '',
    ...brief.agenda.map((a) => `  - ${a}`),
    '',
    'Booked automatically by the DSM Smart Callback assistant.',
  ]
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === '')) // collapse blank runs
    .join('\n');

  return {
    title: brief.callTitle,
    start: startIso,
    end: endIso,
    attendees: [input.email, SALES_INBOX],
    description,
    location: 'Phone / video (DSM sales desk)',
  };
}

function buildNotifyEmail(input: CallbackInput, brief: CallBrief, startIso: string): SendEmailArgs {
  const subject = `New callback booked: ${input.name || input.email} — ${friendlyWhen(startIso)}`;
  const body = [
    'A prospect booked a 30-minute callback via the DSM Smart Callback assistant.',
    '',
    `When:     ${friendlyWhen(startIso)} (${CALL_DURATION_MIN} min)`,
    `Name:     ${input.name || '(not given)'}`,
    `Email:    ${input.email}`,
    `Phone:    ${input.phone || '(not given)'}`,
    `Company:  ${input.company || '(not given)'}`,
    '',
    '--- AI brief ---',
    `Title:    ${brief.callTitle}`,
    `Summary:  ${brief.summary}`,
    brief.agenda.length ? `Agenda:\n  - ${brief.agenda.join('\n  - ')}` : '',
    '',
    'In their words:',
    `  ${input.intent.trim() || '(not given)'}`,
    '',
    'The calendar invite has already been created and sent to the prospect.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { to: SALES_INBOX, subject, body };
}

/**
 * Book the call on STABLE backends only. Never throws, never blocks the UI:
 *  - createEvent on the sales calendar (invite goes to prospect + sales desk)
 *  - notify the sales desk by email with the AI brief
 * Any bridge failure parks the action in the offline queue for automatic retry.
 */
function bookCallback(
  input: CallbackInput,
  brief: CallBrief,
  startIso: string,
  endIso: string,
  source: BookingSource,
): void {
  const eventArgs = buildEventArgs(input, brief, startIso, endIso);
  const notifyArgs = buildNotifyEmail(input, brief, startIso);

  track({
    event: 'callback_booked',
    eventType: 'ai',
    elementText: 'smart-callback',
    metadata: {
      feature: 'smart-callback',
      source, // 'ai' when the LLM brief succeeded, 'beta' when degraded
      email: input.email,
      name: input.name,
      company: input.company,
      start: startIso,
      callTitle: brief.callTitle,
    },
  });

  // Try to book now; on any failure (bridge down) queue for automatic retry.
  createEvent(eventArgs).catch(() => {
    enqueue<BookingPayload>(BOOKING_QUEUE_KIND, { args: eventArgs });
  });
  sendEmail(notifyArgs).catch(() => {
    enqueue<NotifyPayload>(NOTIFY_QUEUE_KIND, { args: notifyArgs });
  });
}

// ── Shared form (serves both the AI path and the degraded beta path) ──────────
//
// One form drives both experiences so they stay in lock-step (identical fields,
// validation and STABLE booking). The only difference is how the call brief is
// produced: the 'ai' mode asks codex-proxy for a polished brief; the 'beta' mode
// (mounted by <AIFeature> when the proxy is down) skips the model entirely and
// books straight from the prospect's own words. Neither mode can lose a lead.

interface CallbackFormProps {
  className?: string;
  /** 'ai' when codex-proxy is healthy; 'beta' when degraded via <AIFeature>. */
  mode: BookingSource;
}

function CallbackForm({ className, mode }: CallbackFormProps) {
  const isBeta = mode === 'beta';
  const fieldId = useId();
  const [input, setInput] = useState<CallbackInput>({
    name: '',
    email: '',
    phone: '',
    company: '',
    intent: '',
    when: defaultWhen(),
  });
  const [phase, setPhase] = useState<Phase>('form');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmedWhen, setConfirmedWhen] = useState('');

  const min = useMemo(() => minWhen(), []);

  const update = useCallback(
    (patch: Partial<CallbackInput>) => setInput((prev) => ({ ...prev, ...patch })),
    [],
  );

  const validationError = useMemo(() => {
    if (!isValidEmail(input.email)) return 'Enter a valid email so we can send your invite.';
    if (!input.intent.trim()) return 'Tell us what you need help with so the right person calls.';
    if (!input.when) return 'Pick a day and time that suits you.';
    const start = new Date(input.when);
    if (Number.isNaN(start.getTime())) return 'Pick a valid day and time.';
    if (start.getTime() < Date.now() - 60_000) return 'Please choose a time in the future.';
    return '';
  }, [input.email, input.intent, input.when]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (validationError) {
        setErrorMsg(validationError);
        return;
      }
      setErrorMsg('');
      setPhase('booking');

      const start = new Date(input.when);
      const startIso = toOffsetIso(start);
      const endIso = toOffsetIso(new Date(start.getTime() + CALL_DURATION_MIN * 60_000));

      track({
        event: 'smart_callback_submit',
        eventType: 'ai',
        metadata: { feature: 'smart-callback', mode, company: input.company, start: startIso },
      });

      // Decide how to build the sales brief. In beta mode the LLM is known-down,
      // so we skip it entirely; otherwise we ask codex-proxy but NEVER drop the
      // booking if the model hiccups — the prospect's own words become the brief.
      let brief: CallBrief;
      let source: BookingSource = mode;
      if (isBeta) {
        brief = fallbackBrief(input);
      } else {
        try {
          const reply = await chat(buildMessages(input), { temperature: 0.4, maxTokens: 400 });
          brief = extractBrief(reply);
        } catch (err) {
          track({
            event: 'ai_outage',
            eventType: 'error',
            metadata: {
              service: 'codex',
              feature: 'smart-callback',
              error: err instanceof Error ? err.message : String(err),
            },
          });
          brief = fallbackBrief(input);
          source = 'beta'; // AI was meant to run but degraded on this request
        }
      }

      // Book on stable backends only — resolves instantly, retries in background.
      bookCallback(input, brief, startIso, endIso, source);
      setConfirmedWhen(startIso);
      setPhase('booked');
    },
    [input, validationError, mode, isBeta],
  );

  const reset = useCallback(() => {
    setErrorMsg('');
    setConfirmedWhen('');
    setPhase('form');
    setInput((prev) => ({ ...prev, intent: '' }));
  }, []);

  // ── Booked view ─────────────────────────────────────────────────────────────
  if (phase === 'booked') {
    return (
      <div
        className={cn(
          'rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-card p-6 shadow-sm sm:p-8',
          className,
        )}
      >
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-wide">You&apos;re booked</span>
        </div>

        <h3 className="mt-3 text-2xl font-bold text-foreground">
          Your 30-minute call is set
        </h3>
        <p className="mt-2 text-muted-foreground">
          A DSM specialist will call you on{' '}
          <strong className="text-foreground">{friendlyWhen(confirmedWhen)}</strong>. We&apos;ve
          emailed a calendar invite to <strong className="text-foreground">{input.email}</strong> and{' '}
          {isBeta
            ? 'passed your notes straight to the team — so no time is wasted.'
            : 'briefed the team with an AI summary of exactly what you need — so no time is wasted.'}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={reset} variant="outline">
            Book another call
          </Button>
        </div>
      </div>
    );
  }

  // ── Form / booking view ─────────────────────────────────────────────────────
  const busy = phase === 'booking';
  return (
    <form
      onSubmit={onSubmit}
      className={cn('rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8', className)}
    >
      <div className="flex items-center gap-2 text-primary">
        <Phone className="h-5 w-5" aria-hidden />
        <span className="text-sm font-semibold uppercase tracking-wide">Talk to a specialist</span>
      </div>
      <h3 className="mt-2 text-2xl font-bold text-foreground">Book a 30-minute call</h3>
      <p className="mt-1 text-muted-foreground">
        Tell us what you need in a sentence and pick a time. We&apos;ll set up the call and make
        sure the right expert is ready with answers — no forms, no phone tag.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`${fieldId}-intent`}>What do you need help with?</Label>
          <Textarea
            id={`${fieldId}-intent`}
            placeholder="e.g. We're renewing 12 Autodesk seats and want to cut the cost…"
            value={input.intent}
            onChange={(e) => update({ intent: e.target.value })}
            disabled={busy}
            rows={3}
            className="mt-1.5 resize-none"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-name`}>Your name</Label>
          <Input
            id={`${fieldId}-name`}
            placeholder="Full name"
            value={input.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={busy}
            autoComplete="name"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-company`}>Company</Label>
          <Input
            id={`${fieldId}-company`}
            placeholder="Company name"
            value={input.company}
            onChange={(e) => update({ company: e.target.value })}
            disabled={busy}
            autoComplete="organization"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-email`}>Work email</Label>
          <Input
            id={`${fieldId}-email`}
            type="email"
            placeholder="you@company.com"
            value={input.email}
            onChange={(e) => update({ email: e.target.value })}
            disabled={busy}
            autoComplete="email"
            required
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor={`${fieldId}-phone`}>Phone (optional)</Label>
          <Input
            id={`${fieldId}-phone`}
            type="tel"
            placeholder="+1 555 000 1234"
            value={input.phone}
            onChange={(e) => update({ phone: e.target.value })}
            disabled={busy}
            autoComplete="tel"
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={`${fieldId}-when`}>Pick a time that works for you</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              id={`${fieldId}-when`}
              type="datetime-local"
              min={min}
              value={input.when}
              onChange={(e) => update({ when: e.target.value })}
              disabled={busy}
              className="max-w-xs"
            />
          </div>
          {input.when && !validationError && (
            <p className="mt-2 text-xs text-muted-foreground">
              We&apos;ll call you on <strong className="text-foreground">{friendlyWhen(input.when)}</strong>{' '}
              for {CALL_DURATION_MIN} minutes.
            </p>
          )}
        </div>
      </div>

      {errorMsg && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <Button type="submit" disabled={busy} className="mt-6 w-full text-base sm:w-auto" size="lg">
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting up your call…
          </>
        ) : (
          <>
            Book a Call <ArrowRight className="ml-1.5 h-4 w-4" />
          </>
        )}
      </Button>

      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
        {isBeta
          ? 'We pass your notes straight to the specialist, so the call gets straight to value.'
          : 'We brief the specialist with an AI summary of your request, so the call gets straight to value.'}
      </p>
    </form>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface SmartCallbackProps {
  /** Optional extra classes for the outer card. */
  className?: string;
}

/**
 * Drop-in Smart Callback. When codex-proxy is healthy (checked, and periodically
 * re-checked, by <AIFeature>) it runs the full AI-briefed booking flow. When the
 * proxy is down it degrades to the SAME form in beta mode — still capturing the
 * intent and booking the 30-minute call on STABLE backends — so it is always
 * safe to place in the AI Lab or footer and never a dead-end for a lead.
 */
export default function SmartCallback({ className }: SmartCallbackProps) {
  return (
    <AIFeature
      backend="codex"
      feature="smart-callback"
      recheckMs={60_000}
      fallback={<CallbackForm mode="beta" className={className} />}
    >
      <CallbackForm mode="ai" className={className} />
    </AIFeature>
  );
}
