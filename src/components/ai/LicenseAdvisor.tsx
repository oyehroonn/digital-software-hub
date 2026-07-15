/**
 * LicenseAdvisor — AI feature #2 ("Help Me Choose")
 * --------------------------------------------------
 * A sales-first, plain-English edition picker for non-technical buyers.
 * The visitor answers 3 dead-simple questions and the AI recommends the EXACT
 * real product/edition to buy from the LIVE DSM catalog, with a buy CTA that
 * deep-links straight to that product in the store (`/store?product=<id>`).
 *
 * How the recommendation is built:
 *  1. The answers are turned into a focused catalog search against the live
 *     product API (`VITE_API_BASE/search`) to pull real candidate editions —
 *     with real names, prices and license types.
 *  2. Those candidates are handed to the codex-proxy LLM, which picks the single
 *     best-fit product id and writes a warm, jargon-free headline + reasons.
 *  3. We map the chosen id back to the real product and render a buy CTA.
 *
 * Resilience contract:
 *  - The whole feature is wrapped in <AIFeature backend="codex">. If the
 *    codex-proxy is unhealthy the CTA never renders (no spinner, no error).
 *  - The catalog search hits the UNSTABLE VPS API: it is bounded + caught. If it
 *    fails we report an `ai_outage` and degrade to a real "browse the right
 *    range" CTA into the store, so the buyer always has a next step.
 *  - The LLM pick is bounded + caught. On failure we report an `ai_outage` and
 *    degrade to the top real search result — still a genuine product with a buy
 *    CTA, never a dead end.
 *  - "Email me this" uses the STABLE mail bridge (src/lib/stable/email). If the
 *    bridge is down the send is parked in the offline queue and retried later.
 *
 * This file compiles standalone and is NOT wired into any page here.
 */

import { useState } from 'react';
import { Check, Sparkles, Loader2, ArrowRight, Mail, Store } from 'lucide-react';

import AIFeature from '@/components/ai/AIFeature';
import { chat, LLMError } from '@/lib/llm';
import { checkCodex } from '@/lib/health';
import { track, reportAiOutage } from '@/lib/stable/analytics';
import { sendEmail, type SendEmailArgs } from '@/lib/stable/email';
import { enqueue, registerProcessor } from '@/lib/offlineQueue';
import type { Product, SearchResponse } from '@/lib/api';

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

const FEATURE = 'license-advisor';
const EMAIL_QUEUE_KIND = 'license_advice_email';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5051';
const SEARCH_TIMEOUT_MS = 6000;
const MAX_CANDIDATES = 8;

// Drain queued recommendation emails once the mail bridge recovers, so a lead
// captured during an outage is never silently lost.
registerProcessor<SendEmailArgs>(EMAIL_QUEUE_KIND, async (args) => {
  await sendEmail(args);
});

// ── The 3 simple questions ───────────────────────────────────────────────────
// Q1 (need) is the primary driver: each option carries a catalog search query
// plus plain-English copy used when we have to fall back to a "browse the range"
// recommendation.

interface NeedInfo {
  /** Catalog search terms that surface real candidate editions. */
  query: string;
  /** Human name of the range, for fallback copy. */
  label: string;
  /** One-line plain-English blurb, used as a fallback reason. */
  blurb: string;
}

const NEEDS: Record<string, NeedInfo> = {
  design: {
    query: 'AutoCAD Revit Fusion design CAD',
    label: 'design & CAD',
    blurb: 'Industry-standard design and CAD tools like AutoCAD, Revit and Fusion.',
  },
  office: {
    query: 'Microsoft Office 365 productivity',
    label: 'Office & productivity',
    blurb: 'Everyday productivity — Word, Excel, Teams and Microsoft 365.',
  },
  server: {
    query: 'Windows Server infrastructure',
    label: 'servers & IT infrastructure',
    blurb: 'Server and infrastructure licensing for your IT backbone.',
  },
  rendering: {
    query: 'V-Ray Corona rendering visualization',
    label: 'rendering & visualisation',
    blurb: 'Photorealistic rendering engines like V-Ray and Corona.',
  },
};

const DEFAULT_NEED = 'office';

function needFor(answers: Answers): NeedInfo {
  return NEEDS[answers.need ?? ''] ?? NEEDS[DEFAULT_NEED];
}

interface QuestionOption {
  value: string;
  label: string;
}

interface Question {
  id: 'need' | 'teamSize' | 'buying';
  prompt: string;
  options: QuestionOption[];
}

const QUESTIONS: Question[] = [
  {
    id: 'need',
    prompt: 'What do you need the software for?',
    options: [
      { value: 'design', label: 'Design, CAD & 3D modelling' },
      { value: 'office', label: 'Office & everyday productivity' },
      { value: 'server', label: 'Servers & IT infrastructure' },
      { value: 'rendering', label: 'Photorealistic rendering & visuals' },
    ],
  },
  {
    id: 'teamSize',
    prompt: 'How many people will use it?',
    options: [
      { value: 'solo', label: 'Just me' },
      { value: 'small', label: 'A small team (2–20)' },
      { value: 'large', label: 'A whole company (20+)' },
    ],
  },
  {
    id: 'buying',
    prompt: 'How would you like to pay?',
    options: [
      { value: 'subscription', label: 'Yearly subscription' },
      { value: 'perpetual', label: 'One-time / own it outright' },
      { value: 'unsure', label: "Not sure — recommend for me" },
    ],
  },
];

type Answers = Partial<Record<Question['id'], string>>;

function answerLabel(qid: Question['id'], value?: string): string {
  const q = QUESTIONS.find((x) => x.id === qid);
  return q?.options.find((o) => o.value === value)?.label ?? 'no preference';
}

interface Recommendation {
  /** The real chosen product, or null when we degrade to a range CTA. */
  product: Product | null;
  headline: string;
  reasons: string[];
  priceLabel: string;
  /** Deep-link into the store for the buy CTA. */
  buyHref: string;
  ctaLabel: string;
  /** How this recommendation was produced (telemetry). */
  source: 'ai' | 'top-result' | 'range';
}

// ── Live catalog search (UNSTABLE VPS) — bounded + tolerant ──────────────────

async function searchCatalog(query: string): Promise<Product[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`search HTTP ${res.status}`);
    const data = (await res.json()) as SearchResponse;
    return Array.isArray(data.products) ? data.products.slice(0, MAX_CANDIDATES) : [];
  } finally {
    clearTimeout(timer);
  }
}

function priceLabel(p: Product): string {
  const raw = (p.price ?? '').toString().trim();
  return raw && raw.toLowerCase() !== 'variable' ? raw : 'Contact for pricing';
}

function buyHref(p: Product): string {
  return `/store?product=${encodeURIComponent(String(p.id))}`;
}

// ── LLM-powered pick from the REAL candidates ────────────────────────────────

interface LlmPick {
  productId?: string | number;
  headline?: string;
  reasons?: string[];
}

function candidateLine(p: Product): string {
  const parts = [`id="${p.id}"`, p.name];
  parts.push(`price: ${priceLabel(p)}`);
  if (p.licenseType) parts.push(`license: ${p.licenseType}`);
  if (p.category) parts.push(`category: ${p.category}`);
  if (p.description) parts.push(`about: ${p.description.slice(0, 160)}`);
  return `- ${parts.join(' | ')}`;
}

function buildMessages(answers: Answers, candidates: Product[]) {
  const said = QUESTIONS.map((q) => `${q.prompt} → ${answerLabel(q.id, answers[q.id])}`).join('\n');
  const catalog = candidates.map(candidateLine).join('\n');

  const system =
    'You are a friendly DSM sales advisor helping a NON-TECHNICAL buyer pick the exact ' +
    'software edition to buy from a software & IT licensing store. Speak in warm, plain ' +
    'English — confident, concise, no jargon. You MUST choose exactly ONE product by its ' +
    'id from the candidate list; never invent products, prices, or features. Match the ' +
    "edition to the buyer's team size (prefer solo/single-user editions for one person, " +
    'multi-user or volume editions for larger teams) and how they prefer to pay. ' +
    'Reply with ONLY a JSON object, no markdown, shaped like: ' +
    '{"productId":"<one id from the candidates>","headline":"<short benefit-led headline>",' +
    '"reasons":["<plain-English reason>","<plain-English reason>"]}. ' +
    'Give 2–3 reasons, each one short sentence, focused on what the buyer gets.';

  const user = `Candidate editions:\n${catalog}\n\nThe buyer told us:\n${said}\n\nRecommend the single best-fit edition.`;

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

function parseLlmPick(raw: string): LlmPick | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    return JSON.parse(raw.slice(start, end + 1)) as LlmPick;
  } catch {
    return null;
  }
}

function cleanReasons(reasons: unknown, product: Product): string[] {
  if (Array.isArray(reasons)) {
    const cleaned = reasons
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim())
      .slice(0, 3);
    if (cleaned.length) return cleaned;
  }
  const desc = (product.description ?? '').trim();
  return desc ? [desc] : ['A great fit for what you described.'];
}

/** Wrap a real product as a recommendation (used for AI + top-result paths). */
function fromProduct(product: Product, source: Recommendation['source'], pick?: LlmPick): Recommendation {
  return {
    product,
    headline: pick?.headline?.trim() || `${product.name} is your best fit`,
    reasons: cleanReasons(pick?.reasons, product),
    priceLabel: priceLabel(product),
    buyHref: buyHref(product),
    ctaLabel: 'View & buy',
    source,
  };
}

/** Last-resort real destination when the live catalog is unreachable. */
function rangeFallback(answers: Answers): Recommendation {
  const need = needFor(answers);
  return {
    product: null,
    headline: `Explore our ${need.label} range`,
    reasons: [
      need.blurb,
      "Our catalog is refreshing right now — browse the range or ask our team for a tailored quote.",
    ],
    priceLabel: 'See live pricing',
    buyHref: `/store?q=${encodeURIComponent(need.query)}`,
    ctaLabel: 'Browse the range',
    source: 'range',
  };
}

async function recommend(answers: Answers): Promise<Recommendation> {
  const need = needFor(answers);

  // 1. Pull real candidate editions from the live catalog (unstable VPS).
  let candidates: Product[] = [];
  try {
    candidates = await searchCatalog(need.query);
  } catch (err) {
    reportAiOutage('vps', FEATURE, err);
  }
  if (candidates.length === 0) return rangeFallback(answers);

  // 2. Ask the LLM to pick the single best real product. Belt-and-suspenders
  //    codex probe so a proxy that died since mount degrades instantly.
  const health = await checkCodex();
  if (!health.ok) {
    reportAiOutage('codex', FEATURE, health.error);
    return fromProduct(candidates[0], 'top-result');
  }

  try {
    const text = await chat(buildMessages(answers, candidates), { temperature: 0.4, maxTokens: 400 });
    const pick = parseLlmPick(text);
    const product =
      pick?.productId != null
        ? candidates.find((p) => String(p.id) === String(pick.productId))
        : undefined;
    if (!product) return fromProduct(candidates[0], 'top-result', pick ?? undefined);
    return fromProduct(product, 'ai', pick);
  } catch (err) {
    reportAiOutage('codex', FEATURE, err instanceof LLMError ? err.message : err);
    return fromProduct(candidates[0], 'top-result');
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
      metadata: { productId: result.product?.id ?? null, source: result.source },
    });
  }

  function onBuy() {
    if (!rec) return;
    track({
      event: 'license_advisor_buy_click',
      eventType: 'click',
      elementText: rec.ctaLabel,
      metadata: { productId: rec.product?.id ?? null, source: rec.source },
    });
    // Drop a durable lead so sales can follow up even if the buyer bounces
    // before checkout. Fire-and-forget; never blocks navigation.
    enqueue('license_lead', {
      productId: rec.product?.id ?? null,
      productName: rec.product?.name ?? null,
      answers,
      email: email || undefined,
      at: Date.now(),
    });
  }

  async function onEmailRecommendation() {
    if (!rec || !email.trim()) return;
    setEmailState('sending');

    const title = rec.product?.name ?? rec.headline;
    const subject = `Your DSM recommendation: ${title}`;
    const body = [
      `Hi,`,
      ``,
      `Based on your answers, we recommend ${title} (${rec.priceLabel}).`,
      ``,
      rec.headline,
      ...rec.reasons.map((r) => `• ${r}`),
      ``,
      rec.product ? `See it here: ${rec.buyHref}` : `Browse the range: ${rec.buyHref}`,
      ``,
      `Ready when you are — reply to this email and we'll get you set up.`,
      `— The DSM Team`,
    ].join('\n');

    const args: SendEmailArgs = { to: email.trim(), subject, body };
    try {
      await sendEmail(args);
      setEmailState('sent');
      track({ event: 'license_advisor_email_sent', eventType: 'ai', metadata: { productId: rec.product?.id ?? null } });
    } catch {
      // Mail bridge down → park it for retry so the lead is never lost.
      enqueue(EMAIL_QUEUE_KIND, args);
      setEmailState('queued');
      track({ event: 'license_advisor_email_queued', eventType: 'ai', metadata: { productId: rec.product?.id ?? null } });
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
            Find your perfect edition
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
                  <span className="text-sm font-semibold text-muted-foreground">{rec.priceLabel}</span>
                </div>
                <CardTitle className="text-xl">{rec.product?.name ?? rec.headline}</CardTitle>
                {rec.product && <CardDescription>{rec.headline}</CardDescription>}
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
                  <a href={rec.buyHref} onClick={onBuy}>
                    {rec.product ? <ArrowRight className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                    {rec.ctaLabel}
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
    <AIFeature backend="codex" feature={FEATURE} fallback={null}>
      <LicenseAdvisorInner />
    </AIFeature>
  );
}
