/**
 * Support — /support
 * ------------------------------------------------------------------------------
 * A real, on-brand DSM support hub. Its jobs, in order:
 *  1. Route buyers to the right help topic (Activation, Delivery, Licensing,
 *     Refunds) fast.
 *  2. Give a clear way to reach a human — the support inbox — AND the always-on
 *     AI Sales Concierge (the floating bubble mounted site-wide) plus the
 *     face-to-face AI IT Advisor on the AI Lab.
 *  3. Answer the questions we get most, in a searchable FAQ accordion.
 *  4. Link out to order tracking / the account area so people can self-serve.
 *
 * Resilience: this page rides ONLY on STABLE ground. It renders entirely from
 * static content + SPA links + a mailto — no VPS / LLM / avatar calls are made
 * here, so it can never spin, time out, or break. The AI concierge it points to
 * already degrades gracefully on its own (see SalesConcierge). Every meaningful
 * interaction fires a fire-and-forget telemetry event to the STABLE analytics
 * backend so support demand shows up in the admin funnel.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  ChevronDown,
  Clock,
  KeyRound,
  LifeBuoy,
  Mail,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  User,
} from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';
import { track, trackClick } from '@/lib/stable/analytics';

const SUPPORT_EMAIL = 'support@digitalsoftwaremarkett.com';

// ── Help topics ──────────────────────────────────────────────────────────────
// Four buyer-facing categories. Each scrolls to its band in the FAQ so the
// "topic → answers" path is one click. Icons echo the crimson accent on hover.

interface Topic {
  id: string;
  icon: typeof KeyRound;
  title: string;
  blurb: string;
  anchor: string;
}

const TOPICS: Topic[] = [
  {
    id: 'activation',
    icon: KeyRound,
    title: 'Activation',
    blurb: 'Redeem your key, activate a product, and fix "already in use" errors.',
    anchor: '#faq-activation',
  },
  {
    id: 'delivery',
    icon: Truck,
    title: 'Delivery',
    blurb: 'When and where your license and download links arrive after checkout.',
    anchor: '#faq-delivery',
  },
  {
    id: 'licensing',
    icon: ShieldCheck,
    title: 'Licensing',
    blurb: 'Editions, seats, subscription vs perpetual, transfers and compliance.',
    anchor: '#faq-licensing',
  },
  {
    id: 'refunds',
    icon: RefreshCw,
    title: 'Refunds',
    blurb: 'Our guarantee, what qualifies, and how long a refund takes to land.',
    anchor: '#faq-refunds',
  },
];

// ── FAQ content ──────────────────────────────────────────────────────────────
// Grouped by topic so each help card anchors straight to its questions. Answers
// are plain-English and sales-safe (never invent prices or promise discounts).

interface QA {
  q: string;
  a: string;
}

interface FaqGroup {
  id: string;
  anchorId: string;
  icon: typeof KeyRound;
  title: string;
  items: QA[];
}

const FAQ_GROUPS: FaqGroup[] = [
  {
    id: 'activation',
    anchorId: 'faq-activation',
    icon: KeyRound,
    title: 'Activation',
    items: [
      {
        q: 'How do I activate my software after buying?',
        a: "Every order includes a genuine license key and a step-by-step activation guide delivered to your email. In most cases you install the product, choose “enter a product key” during setup or from the Help / Account menu, paste the key we sent, and you’re activated. If a product needs an online account (like Microsoft 365 or Adobe), the guide walks you through linking the key to it.",
      },
      {
        q: 'My key says it’s “already in use” or won’t activate — what now?',
        a: 'Most activation errors come from a typo, a leftover trial, or activating on more seats than the license covers. Copy and paste the key exactly (no spaces), remove any expired trial of the same product, and confirm you’re within your seat count. If it still won’t take, email support@digitalsoftwaremarkett.com with your order number and a screenshot of the error — a specialist will re-issue or re-validate the key for you.',
      },
      {
        q: 'Can I move my license to a new computer?',
        a: 'For most perpetual licenses, yes — you deactivate the product on the old machine (or simply retire it), then activate on the new one with the same key. Subscription products follow you by signing into your account on the new device. If a product needs a manual transfer, our team can reset the activation for you — just reach out with your order number.',
      },
    ],
  },
  {
    id: 'delivery',
    anchorId: 'faq-delivery',
    icon: Truck,
    title: 'Delivery',
    items: [
      {
        q: 'When do I receive my license and download?',
        a: 'DSM delivers digitally. For the vast majority of orders your license key and download links arrive by email within minutes of a successful checkout — there’s nothing to ship and no waiting on a courier. A small number of orders are held briefly for a routine fraud / genuineness check; if yours is, you’ll still typically have everything within a few hours.',
      },
      {
        q: 'I didn’t get my email — where is it?',
        a: 'First check your spam / promotions folder and search for “DSM” or “Digital Software Market.” Confirm the email address you used at checkout was correct. If it’s still missing after a few minutes, email support@digitalsoftwaremarkett.com (or use the concierge below) with your order number and we’ll resend your license straight away.',
      },
      {
        q: 'Where can I re-download my files later?',
        a: 'Your delivery email contains permanent download links, and signed-in members can find their past orders in the Account area. If a link ever expires or you’ve changed devices, contact us and we’ll refresh it — your entitlement doesn’t disappear.',
      },
    ],
  },
  {
    id: 'licensing',
    anchorId: 'faq-licensing',
    icon: ShieldCheck,
    title: 'Licensing',
    items: [
      {
        q: 'Are DSM licenses genuine?',
        a: 'Yes. DSM has sold genuine, fully-licensed software since 1994. Every license is authentic and backed by real specialist support, so you stay compliant and covered — not exposed like you would be with grey-market keys.',
      },
      {
        q: 'What’s the difference between editions, seats and subscriptions?',
        a: 'An edition (e.g. Standard vs Professional) sets which features you get. Seats are how many people or devices may use the license at once. A subscription renews on a term (monthly or yearly) and includes updates for that period, while a perpetual license is a one-time purchase you keep. Not sure which fits? The License Advisor and our concierge can point you to the exact edition in a couple of questions.',
      },
      {
        q: 'Do you sell for teams or in volume?',
        a: 'Yes — DSM supports business and volume orders with tailored pricing. Tell our concierge how many seats and which products you need, or email us, and a specialist will put together a formal multi-product quote. You can also explore enterprise licensing from the store.',
      },
    ],
  },
  {
    id: 'refunds',
    anchorId: 'faq-refunds',
    icon: RefreshCw,
    title: 'Refunds',
    items: [
      {
        q: 'What is your refund policy?',
        a: 'If a product won’t activate and our team can’t make it right, you’re covered — we’ll replace the license or refund the order. Because licenses are delivered digitally, we handle refunds case by case and always work with you first to get the software running, since that’s usually a quick fix.',
      },
      {
        q: 'How do I request a refund?',
        a: 'Email support@digitalsoftwaremarkett.com with your order number and a short description of the issue (a screenshot of any error helps). A specialist will review it and, where a refund applies, process it back to your original payment method.',
      },
      {
        q: 'How long does a refund take?',
        a: 'Once approved, refunds are issued to your original payment method. The funds typically appear within a few business days, depending on your bank or card provider’s processing time.',
      },
    ],
  },
];

// ── FAQ accordion item ───────────────────────────────────────────────────────

function FaqRow({
  item,
  isOpen,
  onToggle,
}: {
  item: QA;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.06] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="group flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span
          className={`text-[15px] font-medium leading-snug transition-colors duration-300 ${
            isOpen ? 'text-crimson' : 'text-[#FEFEFE] group-hover:text-crimson'
          }`}
        >
          {item.q}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-all duration-300 ${
            isOpen ? 'rotate-180 text-crimson' : 'text-[#B1B2B3] group-hover:text-crimson'
          }`}
          strokeWidth={2}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pr-8 text-sm font-light leading-relaxed text-[#B1B2B3]">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

const Support = () => {
  // A single open key across all groups keeps the accordion tidy (one answer at
  // a time). Key format: `${groupId}:${index}`.
  const [openKey, setOpenKey] = useState<string | null>('activation:0');
  const [query, setQuery] = useState('');

  // Live client-side filter over every question + answer. Purely local; no
  // backend. Empty query shows the full grouped FAQ.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_GROUPS;
    return FAQ_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const onTopicClick = (topic: Topic) => {
    trackClick('support_topic', {
      elementId: `support-topic-${topic.id}`,
      elementText: topic.title,
      metadata: { feature: 'support', topic: topic.id },
    });
  };

  const onEmailClick = () => {
    trackClick('support_email', {
      elementId: 'support-email',
      elementText: SUPPORT_EMAIL,
      metadata: { feature: 'support' },
    });
  };

  const onConciergeHint = () => {
    track({
      event: 'support_concierge_hint',
      eventType: 'ai',
      metadata: { feature: 'support' },
    });
  };

  return (
    <div className="relative min-h-screen bg-surface-dark text-[#FEFEFE]">
      <GrainOverlay />
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-48 pb-20">
        {/* Crimson aura */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-crimson/[0.08] blur-[140px]" />
        </div>

        <div className="mx-auto max-w-[1100px] px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-crimson">
            <LifeBuoy className="h-3.5 w-3.5" strokeWidth={2} />
            Support Center
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl md:text-6xl">
            How can we help?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            Answers on activation, delivery, licensing and refunds — plus a real specialist
            team and an always-on AI concierge whenever you need a hand. Genuine licenses,
            trusted since 1994.
          </p>

          {/* FAQ search */}
          <div className="mx-auto mt-9 flex max-w-xl items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 focus-within:border-crimson/50 focus-within:ring-1 focus-within:ring-crimson/40">
            <Search className="h-5 w-5 shrink-0 text-[#B1B2B3]/70" strokeWidth={1.75} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help — e.g. “activate my key” or “refund”"
              aria-label="Search support articles"
              className="w-full bg-transparent text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* ── Help topics ──────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-4">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TOPICS.map((topic) => (
            <a
              key={topic.id}
              href={topic.anchor}
              onClick={() => onTopicClick(topic)}
              className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-crimson/30 hover:bg-white/[0.035]"
            >
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-[#B1B2B3] transition-colors duration-300 group-hover:border-crimson/30 group-hover:bg-crimson/[0.08] group-hover:text-crimson">
                <topic.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="text-base font-semibold text-[#FEFEFE]">{topic.title}</h3>
              <p className="mt-2 flex-1 text-sm font-light leading-relaxed text-[#B1B2B3]">
                {topic.blurb}
              </p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-xs font-medium text-crimson">
                View answers
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Self-serve rail: order tracking + account ────────────────────── */}
      <section className="relative px-6 py-14">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 md:grid-cols-2">
          <Link
            to="/account"
            onClick={() =>
              trackClick('support_track_order', {
                elementId: 'support-track-order',
                metadata: { feature: 'support' },
              })
            }
            className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.03] to-transparent p-6 transition-all duration-300 hover:border-crimson/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-crimson/[0.08] text-crimson">
              <Package className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-[#FEFEFE]">Track an order</span>
              <span className="mt-1 block text-sm font-light text-[#B1B2B3]">
                Find your license keys, downloads and order history in your account.
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#B1B2B3] transition-all duration-300 group-hover:translate-x-1 group-hover:text-crimson" />
          </Link>

          <Link
            to="/account"
            onClick={() =>
              trackClick('support_account', {
                elementId: 'support-account',
                metadata: { feature: 'support' },
              })
            }
            className="group flex items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-white/[0.03] to-transparent p-6 transition-all duration-300 hover:border-crimson/30"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-crimson/[0.08] text-crimson">
              <User className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-[#FEFEFE]">Your account</span>
              <span className="mt-1 block text-sm font-light text-[#B1B2B3]">
                Manage details, re-download software and view past purchases.
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-[#B1B2B3] transition-all duration-300 group-hover:translate-x-1 group-hover:text-crimson" />
          </Link>
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 py-14">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crimson">
              Get in touch
            </span>
            <h2 className="mt-2 font-serif text-3xl text-[#FEFEFE] sm:text-4xl">
              Talk to a real person, or our AI concierge
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-light text-[#B1B2B3]">
              Pick whatever’s fastest for you — email a specialist, chat with the 24/7
              concierge, or go face-to-face with our AI IT advisor.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Email support */}
            <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-crimson/[0.08] text-crimson">
                <Mail className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="text-lg font-semibold text-[#FEFEFE]">Email support</h3>
              <p className="mt-2 flex-1 text-sm font-light leading-relaxed text-[#B1B2B3]">
                Send us your order number and a short description — a specialist replies with
                a fix, a resend, or a tailored quote.
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=DSM%20Support%20Request`}
                onClick={onEmailClick}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-crimson px-5 py-2.5 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
              >
                <Mail className="h-4 w-4" strokeWidth={2} />
                {SUPPORT_EMAIL}
              </a>
            </div>

            {/* AI concierge */}
            <div className="flex flex-col rounded-2xl border border-crimson/25 bg-gradient-to-br from-crimson/[0.06] to-transparent p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-crimson/[0.12] text-crimson">
                <Sparkles className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-[#FEFEFE]">
                24/7 AI concierge
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> Online
                </span>
              </h3>
              <p className="mt-2 flex-1 text-sm font-light leading-relaxed text-[#B1B2B3]">
                Instant answers on licensing, editions and pricing, day or night. Look for the
                <MessageCircle className="mx-1 inline h-3.5 w-3.5 text-crimson" /> chat bubble in
                the bottom-right corner to start.
              </p>
              <button
                type="button"
                onClick={onConciergeHint}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-crimson/40 bg-crimson/[0.08] px-5 py-2.5 text-sm font-medium text-crimson transition-colors hover:bg-crimson/[0.16]"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
                Chat with the concierge
              </button>
            </div>

            {/* AI IT advisor */}
            <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-7">
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-crimson/[0.08] text-crimson">
                <Bot className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="text-lg font-semibold text-[#FEFEFE]">AI IT advisor</h3>
              <p className="mt-2 flex-1 text-sm font-light leading-relaxed text-[#B1B2B3]">
                Prefer face-to-face? Talk to our AI IT advisor in the AI Lab, or book a free
                30-minute call with a human specialist.
              </p>
              <Link
                to="/services"
                onClick={() =>
                  trackClick('support_ai_advisor', {
                    elementId: 'support-ai-advisor',
                    metadata: { feature: 'support' },
                  })
                }
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-[#FEFEFE] transition-colors hover:border-crimson/40 hover:text-crimson"
              >
                Meet the advisor
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </div>
          </div>

          {/* Response-time reassurance strip */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] px-6 py-5 text-sm text-[#B1B2B3]">
            <span className="inline-flex items-center gap-2">
              <Clock className="h-4 w-4 text-crimson" strokeWidth={1.75} /> Digital delivery in
              minutes
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-crimson" strokeWidth={1.75} /> Genuine licenses
              since 1994
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-crimson" strokeWidth={1.75} /> Backed by real
              specialist support
            </span>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-24 pt-8">
        <div className="mx-auto max-w-[860px]">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crimson">
              Answers
            </span>
            <h2 className="mt-2 font-serif text-3xl text-[#FEFEFE] sm:text-4xl">
              Frequently asked questions
            </h2>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
              <p className="text-sm text-[#B1B2B3]">
                No articles match “{query}”. Try a different word, or{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}?subject=DSM%20Support%20Request`}
                  onClick={onEmailClick}
                  className="text-crimson hover:text-crimson-dark"
                >
                  email our team
                </a>{' '}
                and we’ll help directly.
              </p>
            </div>
          ) : (
            <div className="space-y-12">
              {filteredGroups.map((group) => (
                <div key={group.id} id={group.anchorId} className="scroll-mt-40">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-crimson/[0.08] text-crimson">
                      <group.icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <h3 className="text-lg font-semibold text-[#FEFEFE]">{group.title}</h3>
                  </div>
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-6">
                    {group.items.map((item, i) => {
                      const key = `${group.id}:${i}`;
                      return (
                        <FaqRow
                          key={key}
                          item={item}
                          isOpen={openKey === key}
                          onToggle={() => setOpenKey((prev) => (prev === key ? null : key))}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Still stuck CTA */}
          <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-crimson/[0.05] to-transparent p-8 text-center">
            <h3 className="font-serif text-2xl text-[#FEFEFE]">Still stuck?</h3>
            <p className="max-w-md text-sm font-light text-[#B1B2B3]">
              Our specialists sort out activation, delivery and licensing every day. Send us the
              details and we’ll get you running.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=DSM%20Support%20Request`}
              onClick={onEmailClick}
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
            >
              <Mail className="h-4 w-4" strokeWidth={2} />
              Contact support
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Support;
