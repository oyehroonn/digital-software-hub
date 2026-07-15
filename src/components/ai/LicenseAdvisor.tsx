/**
 * LicenseAdvisor — AI feature #2 ("Help Me Choose")
 * --------------------------------------------------
 * A sales-first, plain-English edition picker for non-technical buyers.
 * The visitor answers 2–3 dead-simple questions and the AI recommends the
 * exact DSM edition to buy, with an action-oriented buy CTA.
 *
 * Resilience contract:
 *  - The whole feature is wrapped in <AIFeature backend="codex">. If the
 *    codex-proxy is unhealthy the CTA never renders (no spinner, no error).
 *  - The recommendation call (src/lib/llm.ts `chat`) is bounded + catches; on
 *    failure we degrade to a deterministic local recommendation so the buyer
 *    is NEVER left without an answer, and we report the outage via telemetry.
 *  - "Email me this" uses the STABLE mail bridge (src/lib/stable/email). If the
 *    bridge is down the send is parked in the offline queue and retried later.
 *
 * This file compiles standalone and is NOT wired into any page here.
 */

import { useState } from 'react';
import { Check, Sparkles, Loader2, ArrowRight, Mail } from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chat, LLMError } from '@/lib/llm';
import { checkCodex } from '@/lib/health';
import { track, reportAiOutage } from '@/lib/stable/analytics';
import { sendEmail } from '@/lib/stable/email';
import { enqueue } from '@/lib/offlineQueue';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

// ── Edition catalog (sales-first copy; the single source of truth the AI
//    must choose from). Keeping it local means we can always fall back to a
//    deterministic pick when the LLM is unavailable. ─────────────────────────

interface Edition {
  id: string;
  name: string;
  tagline: string;
  priceLabel: string;
  /** Plain-English "who it's for" used in the fallback + the prompt. */
  bestFor: string;
  highlights: string[];
  /** Where the buy CTA sends the visitor. */
  buyHref: string;
}

const EDITIONS: Edition[] = [
  {
    id: 'standard',
    name: 'DSM Standard',
    tagline: 'Everything a solo pro or small team needs to start winning work.',
    priceLabel: 'from $49/mo',
    bestFor: 'Individuals and teams of up to 3 who want the essentials without the extras.',
    highlights: ['1–3 seats', 'Core design toolkit', 'Email support', 'Cloud project storage'],
    buyHref: '/pricing?edition=standard',
  },
  {
    id: 'professional',
    name: 'DSM Professional',
    tagline: 'The best-value edition for growing studios that ship every week.',
    priceLabel: 'from $99/mo',
    bestFor: 'Busy teams of 4–20 who need collaboration, faster rendering, and priority help.',
    highlights: ['Up to 20 seats', 'Real-time collaboration', 'Priority support', 'Advanced 3D + render tools'],
    buyHref: '/pricing?edition=professional',
  },
  {
    id: 'enterprise',
    name: 'DSM Enterprise',
    tagline: 'Security, control, and a dedicated team behind every deployment.',
    priceLabel: 'custom pricing',
    bestFor: 'Larger organizations (20+) that need SSO, admin controls, and a named account manager.',
    highlights: ['Unlimited seats', 'SSO + admin controls', 'Dedicated account manager', 'Onboarding & SLAs'],
    buyHref: '/pricing?edition=enterprise',
  },
];

const DEFAULT_EDITION_ID = 'professional';

function editionById(id: string): Edition {
  return EDITIONS.find((e) => e.id === id) ?? EDITIONS.find((e) => e.id === DEFAULT_EDITION_ID)!;
}

// ── The 3 simple questions ───────────────────────────────────────────────────

interface QuestionOption {
  value: string;
  label: string;
}

interface Question {
  id: 'teamSize' | 'goal' | 'priority';
  prompt: string;
  options: QuestionOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 'teamSize',
    prompt: 'How many people will be using DSM?',
    options: [
      { value: 'solo', label: 'Just me' },
      { value: 'small', label: 'A small team (2–20)' },
      { value: 'large', label: 'A whole company (20+)' },
    ],
  },
  {
    id: 'goal',
    prompt: "What matters most to you right now?",
    options: [
      { value: 'start', label: 'Get started affordably' },
      { value: 'grow', label: 'Work faster & together' },
      { value: 'control', label: 'Security & central control' },
    ],
  },
  {
    id: 'priority',
    prompt: 'How hands-on do you want our team to be?',
    options: [
      { value: 'self', label: "I'll set it up myself" },
      { value: 'guided', label: 'Some guidance is nice' },
      { value: 'managed', label: 'Do it with me, end to end' },
    ],
  },
];

type Answers = Partial<Record<Question['id'], string>>;

interface Recommendation {
  edition: Edition;
  headline: string;
  reasons: string[];
  /** true when this came from the deterministic fallback, not the LLM. */
  fallback: boolean;
}

// ── Deterministic fallback so a buyer is never left without an answer ────────

function localRecommend(answers: Answers): Recommendation {
  let id: string = DEFAULT_EDITION_ID;
  if (answers.teamSize === 'large' || answers.goal === 'control' || answers.priority === 'managed') {
    id = 'enterprise';
  } else if (answers.teamSize === 'solo' && answers.goal === 'start') {
    id = 'standard';
  } else {
    id = 'professional';
  }
  const edition = editionById(id);
  return {
    edition,
    headline: `${edition.name} is your best fit`,
    reasons: [edition.bestFor, edition.tagline],
    fallback: true,
  };
}

// ── LLM-powered recommendation ───────────────────────────────────────────────

interface LlmPick {
  editionId?: string;
  headline?: string;
  reasons?: string[];
}

function buildMessages(answers: Answers) {
  const catalog = EDITIONS.map(
    (e) => `- id="${e.id}" | ${e.name} (${e.priceLabel}): ${e.bestFor}`,
  ).join('\n');

  const said = QUESTIONS.map((q) => {
    const opt = q.options.find((o) => o.value === answers[q.id]);
    return `${q.prompt} → ${opt ? opt.label : 'no answer'}`;
  }).join('\n');

  const system =
    'You are a friendly DSM sales advisor helping a NON-TECHNICAL buyer pick the right edition. ' +
    'Speak in warm, plain English. Be confident, concise, and action-oriented. ' +
    'You MUST choose exactly one edition id from the catalog. ' +
    'Reply with ONLY a JSON object, no markdown, shaped like: ' +
    '{"editionId":"<one of the catalog ids>","headline":"<short benefit-led headline>",' +
    '"reasons":["<plain-English reason>","<plain-English reason>"]}. ' +
    'Give 2–3 reasons, each one short sentence, focused on what the buyer gets — not jargon.';

  const user = `Editions:\n${catalog}\n\nThe buyer told us:\n${said}\n\nRecommend the single best edition.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

function parseLlmPick(raw: string): LlmPick | null {
  try {
    // Tolerate stray prose / code fences around the JSON.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    return JSON.parse(raw.slice(start, end + 1)) as LlmPick;
  } catch {
    return null;
  }
}

async function recommend(answers: Answers): Promise<Recommendation> {
  // Belt-and-suspenders: the proxy may have gone down since mount. A quick
  // bounded probe lets us skip a doomed 20s call and degrade instantly.
  const health = await checkCodex();
  if (!health.ok) {
    reportAiOutage('codex', 'license-advisor', health.error);
    return localRecommend(answers);
  }

  try {
    const text = await chat(buildMessages(answers), { temperature: 0.5, maxTokens: 400 });
    const pick = parseLlmPick(text);
    const edition = pick?.editionId ? editionById(pick.editionId) : null;
    if (!edition) return localRecommend(answers);

    const reasons =
      Array.isArray(pick?.reasons) && pick!.reasons!.length
        ? pick!.reasons!.filter((r): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 3)
        : [edition.bestFor, edition.tagline];

    return {
      edition,
      headline: pick?.headline?.trim() || `${edition.name} is your best fit`,
      reasons,
      fallback: false,
    };
  } catch (err) {
    reportAiOutage('codex', 'license-advisor', err instanceof LLMError ? err.message : err);
    return localRecommend(answers);
  }
}

// ── Inner UI (only mounted when codex-proxy is healthy) ──────────────────────

type Phase = 'quiz' | 'thinking' | 'result';

function LicenseAdvisorInner() {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('quiz');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [rec, setRec] = useState<Recommendation | null>(null);

  // Email-the-recommendation state.
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'queued'>('idle');

  const current = QUESTIONS[step];

  function reset() {
    setPhase('quiz');
    setStep(0);
    setAnswers({});
    setRec(null);
    setEmail('');
    setEmailState('idle');
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      track({ event: 'license_advisor_open', eventType: 'ai' });
    } else {
      // Reset shortly after the dialog closes so it's fresh next time.
      reset();
    }
  }

  async function choose(value: string) {
    const next: Answers = { ...answers, [current.id]: value };
    setAnswers(next);

    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
      return;
    }

    // Last question answered → run the recommendation.
    setPhase('thinking');
    track({ event: 'license_advisor_submit', eventType: 'ai', metadata: { ...next } });
    const result = await recommend(next);
    setRec(result);
    setPhase('result');
    track({
      event: 'license_advisor_result',
      eventType: 'ai',
      metadata: { editionId: result.edition.id, fallback: result.fallback },
    });
  }

  function onBuy() {
    if (!rec) return;
    track({
      event: 'license_advisor_buy_click',
      eventType: 'click',
      elementText: `Get ${rec.edition.name}`,
      metadata: { editionId: rec.edition.id },
    });
    // Also drop a durable lead so sales can follow up even if the buyer
    // bounces before checkout. Fire-and-forget; never blocks navigation.
    enqueue('license_lead', {
      editionId: rec.edition.id,
      answers,
      email: email || undefined,
      at: Date.now(),
    });
  }

  async function onEmailRecommendation() {
    if (!rec || !email.trim()) return;
    setEmailState('sending');

    const subject = `Your DSM recommendation: ${rec.edition.name}`;
    const body = [
      `Hi,`,
      ``,
      `Based on your answers, we recommend ${rec.edition.name} (${rec.edition.priceLabel}).`,
      ``,
      rec.headline,
      ...rec.reasons.map((r) => `• ${r}`),
      ``,
      `What you get:`,
      ...rec.edition.highlights.map((h) => `• ${h}`),
      ``,
      `Ready when you are — reply to this email and we'll get you set up.`,
      `— The DSM Team`,
    ].join('\n');

    try {
      await sendEmail({ to: email.trim(), subject, body });
      setEmailState('sent');
      track({ event: 'license_advisor_email_sent', eventType: 'ai', metadata: { editionId: rec.edition.id } });
    } catch {
      // Mail bridge down → park it for retry so the lead is never lost.
      enqueue('license_advice_email', { to: email.trim(), subject, body, editionId: rec.edition.id });
      setEmailState('queued');
      track({ event: 'license_advisor_email_queued', eventType: 'ai', metadata: { editionId: rec.edition.id } });
    }
  }

  const progress = phase === 'quiz' ? step + 1 : QUESTIONS.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2">
          <Sparkles className="h-4 w-4" />
          Help Me Choose
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Find your perfect DSM edition
          </DialogTitle>
          <DialogDescription>
            Answer {QUESTIONS.length} quick questions — no tech knowledge needed. We'll point you to the exact
            edition to buy.
          </DialogDescription>
        </DialogHeader>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {QUESTIONS.map((q, i) => (
            <span
              key={q.id}
              className={
                'h-1.5 flex-1 rounded-full transition-colors ' +
                (i < progress ? 'bg-primary' : 'bg-muted')
              }
            />
          ))}
        </div>

        {/* QUIZ */}
        {phase === 'quiz' && current && (
          <div className="space-y-4">
            <p className="text-base font-medium">{current.prompt}</p>
            <div className="grid gap-2">
              {current.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => void choose(opt.value)}
                  className="flex w-full items-center justify-between rounded-lg border border-input bg-background px-4 py-3 text-left text-sm font-medium transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {opt.label}
                  <ArrowRight className="h-4 w-4 opacity-40" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* THINKING */}
        {phase === 'thinking' && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Matching you to the right edition…</p>
          </div>
        )}

        {/* RESULT */}
        {phase === 'result' && rec && (
          <div className="space-y-4">
            <Card className="border-primary/40">
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Badge className="gap-1">
                    <Check className="h-3 w-3" />
                    Recommended for you
                  </Badge>
                  <span className="text-sm font-semibold text-muted-foreground">{rec.edition.priceLabel}</span>
                </div>
                <CardTitle className="text-xl">{rec.edition.name}</CardTitle>
                <CardDescription>{rec.headline}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5">
                  {rec.reasons.map((reason, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>

                <Button asChild size="lg" className="w-full gap-2">
                  <a href={rec.edition.buyHref} onClick={onBuy}>
                    Get {rec.edition.name}
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>

                {/* Email-me-this lead capture (STABLE mail bridge + offline queue) */}
                {emailState === 'sent' ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Sent! Check your inbox for the details.
                  </p>
                ) : emailState === 'queued' ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Saved — we'll email this to you shortly.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      inputMode="email"
                      placeholder="Email me this recommendation"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      aria-label="Your email address"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!email.trim() || emailState === 'sending'}
                      onClick={() => void onEmailRecommendation()}
                    >
                      {emailState === 'sending' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <button
              type="button"
              onClick={reset}
              className="w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Start over
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Public export: resilience-wrapped. If codex-proxy is down, the CTA simply
//    does not appear (fallback={null}). ────────────────────────────────────────

export default function LicenseAdvisor() {
  return (
    <AIFeature backend="codex" feature="license-advisor" fallback={null}>
      <LicenseAdvisorInner />
    </AIFeature>
  );
}
