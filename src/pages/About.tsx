/**
 * About — /about
 * ------------------------------------------------------------------------------
 * "Who we are & what we do" — the page the Header's Company > About link used to
 * mis-point at /services (the standalone DSM AI Lab microsite, dsmAIFinal.html).
 * That meant a shopper looking for company info landed on an unrelated AI-product
 * pitch. This page gives About its own real destination instead.
 *
 * Resilience: same posture as Support — static content + SPA links only, no
 * VPS / LLM calls, so it can never spin or break regardless of backend health.
 */

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  Box,
  LifeBuoy,
  Sparkles,
  Users,
} from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';

const PILLARS = [
  {
    icon: BadgeCheck,
    title: 'Genuine licenses only',
    blurb:
      'Every key sold through DSM is a genuine, traceable license from an official partner channel — Microsoft, Autodesk, Adobe, Corel, Kaspersky and more.',
  },
  {
    icon: Box,
    title: 'See it before you buy',
    blurb:
      'Interactive 3D packaging and detailed product pages replace guesswork, so what you see on the shelf is what lands in your inbox.',
  },
  {
    icon: Bot,
    title: 'AI-assisted shopping',
    blurb:
      'An always-on concierge and a face-to-face AI IT Advisor help buyers compare editions, size licenses correctly, and get straight answers.',
  },
  {
    icon: Users,
    title: 'Built for every buyer',
    blurb:
      'A consumer storefront, an Exclusive Members program, and a dedicated reseller portal with wholesale pricing and deal registration.',
  },
];

const About = () => {
  return (
    <div className="relative min-h-screen bg-surface-dark text-[#FEFEFE]">
      <GrainOverlay />
      <Header />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-48 pb-20">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-crimson/[0.08] blur-[140px]" />
        </div>

        <div className="mx-auto max-w-[1100px] px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-crimson">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} />
            About DSM
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl md:text-6xl">
            Who we are & what we do
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            Digital Software Market is a digital showroom for genuine software licensing —
            empowering creators, businesses and enterprises since 1994. We pair official
            partner channels with an AI-assisted, 3D-first buying experience so getting the
            right license is fast, transparent and trustworthy.
          </p>
        </div>
      </section>

      {/* ── Pillars ──────────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-4">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-crimson/30"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-crimson/[0.08] text-crimson">
                <p.icon className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <h3 className="mt-4 font-serif text-lg text-[#FEFEFE]">{p.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-[#B1B2B3]">{p.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── What we do ───────────────────────────────────────────────────── */}
      <section className="relative px-6 py-20">
        <div className="mx-auto max-w-[900px]">
          <h2 className="font-serif text-2xl text-[#FEFEFE] sm:text-3xl">What we do</h2>
          <div className="mt-6 space-y-5 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
            <p>
              We sell genuine software licenses — operating systems, productivity suites, CAD
              and engineering tools, creative and design software, security and utility
              products — sourced through official partner channels and delivered with a real
              license key, not a grey-market key of unknown origin.
            </p>
            <p>
              Every product page carries an interactive 3D model of its packaging so you can
              confirm exactly what you're buying before checkout, alongside AI tools that help
              compare editions, size license counts and answer product questions in real time.
            </p>
            <p>
              Beyond the storefront, DSM runs an Exclusive Members program for individual
              buyers, a reseller portal for partners who need wholesale pricing and deal
              registration, and a support desk staffed by people — backed by an always-on AI
              concierge — for activation, delivery and licensing questions.
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative px-6 pb-24">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-crimson/[0.05] to-transparent p-8 text-center">
          <h3 className="font-serif text-2xl text-[#FEFEFE]">Questions before you buy?</h3>
          <p className="max-w-md text-sm font-light text-[#B1B2B3]">
            Our support team and AI concierge are here for licensing, activation and delivery
            questions — every day.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/support"
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
            >
              <LifeBuoy className="h-4 w-4" strokeWidth={2} />
              Visit support
            </Link>
            <Link
              to="/store"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:border-crimson/50 hover:text-crimson"
            >
              Browse the store
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
