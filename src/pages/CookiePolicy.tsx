/**
 * CookiePolicy — /cookies
 * ------------------------------------------------------------------------------
 * Unlike Terms/Privacy, there was no real "Cookie Policy" page to adapt from
 * the old WooCommerce site (only a passing mention inside its Privacy Policy) —
 * this page is written from scratch, but describes exactly what this codebase
 * actually does, verified directly against source:
 *
 *  - `src/lib/stable/analytics.ts` stores a per-tab `dsm.sessionId`
 *    (sessionStorage) and a durable `dsm.anonymousId` (localStorage) used to
 *    tie analytics events together. It does NOT use `document.cookie`.
 *  - `src/lib/track.ts` is the passive analytics layer riding on top of that
 *    (page views, clicks, scroll depth, attention heatmap) — see Privacy Policy.
 *  - `src/contexts/AppContext.tsx` persists cart contents (`dsm-cart`) and site
 *    preferences (`dsm-preferences`) in localStorage so they survive a refresh.
 *  - `src/components/account/AccountPrompt.tsx` remembers a localStorage flag
 *    if you dismiss the account prompt.
 *  - `src/lib/offlineQueue.ts` queues unsent analytics/lead events in
 *    localStorage so nothing is lost if you're offline.
 *  - A grep of the whole frontend for `document.cookie` turns up exactly one
 *    hit, in the shared shadcn `ui/sidebar` component (a collapsible-sidebar
 *    state cookie) — that component is not currently mounted anywhere in this
 *    consumer site, so no tracking or functional cookie is set by DSM today.
 *  - Our checkout redirects to a separate licensed store/checkout partner to
 *    take payment; that partner's own site may set its own cookies under its
 *    own policy, which this page can't speak for.
 *
 * Resilience: same posture as About/Support — static content + SPA links only.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Cookie, LifeBuoy } from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';

const LAST_UPDATED = 'September 2026';

const STORAGE_ITEMS = [
  {
    key: 'dsm.sessionId',
    where: 'sessionStorage',
    purpose: 'A random per-tab identifier used to group your analytics events (page views, clicks, scroll) together for the session. Cleared when you close the tab.',
  },
  {
    key: 'dsm.anonymousId',
    where: 'localStorage',
    purpose: 'A random, durable identifier (not your name or email) used so analytics can tell repeat visits from a new visitor. Persists across sessions until you clear site data.',
  },
  {
    key: 'dsm-cart',
    where: 'localStorage',
    purpose: 'Your cart contents, so items you’ve added survive a page refresh.',
  },
  {
    key: 'dsm-preferences',
    where: 'localStorage',
    purpose: 'Lightweight site preferences (e.g. display/UI settings) tied to your browser.',
  },
  {
    key: 'account prompt dismissal flag',
    where: 'localStorage',
    purpose: 'Remembers that you dismissed the sign-in prompt so it doesn’t reappear every visit.',
  },
  {
    key: 'offline analytics/lead queue',
    where: 'localStorage',
    purpose: 'Analytics or lead-capture events that failed to send (e.g. you were offline) are queued here and retried automatically once you’re back online.',
  },
];

const CookiePolicy = () => {
  return (
    <div className="relative min-h-screen bg-surface-dark text-[#FEFEFE]">
      <GrainOverlay />
      <Header />

      <section className="relative overflow-hidden pt-48 pb-16">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-24 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-crimson/[0.08] blur-[140px]" />
        </div>

        <div className="mx-auto max-w-[900px] px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/[0.06] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-crimson">
            <Cookie className="h-3.5 w-3.5" strokeWidth={2} />
            Legal
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl">
            Cookie Policy
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            A short, accurate answer: this site doesn&rsquo;t use tracking cookies today. Here&rsquo;s exactly
            what it does use instead, and why.
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[#B1B2B3]/50">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-16">
        <div className="mx-auto max-w-[900px] space-y-10">
          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">Cookies vs. what we actually use</h2>
            <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
              <p>
                A &ldquo;cookie&rdquo; is a small file a site asks your browser to store and send back on every
                request. We don&rsquo;t set any first-party tracking cookies. Instead, this site uses your
                browser&rsquo;s <strong>localStorage</strong> and <strong>sessionStorage</strong> — similar in
                spirit (small pieces of data your browser holds for us) but never automatically sent over the
                network; our code has to explicitly read and transmit them, and only to our own analytics
                endpoint.
              </p>
              <p>
                We don&rsquo;t use Google Analytics, ad-network pixels, or any third-party advertising cookies.
                Our analytics runs on our own self-hosted DSM Analytics API — see our{' '}
                <Link to="/privacy" className="text-crimson hover:underline">
                  Privacy Policy
                </Link>{' '}
                for what it records (page views, clicks, scroll depth, an on-page attention heatmap).
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">What&rsquo;s stored in your browser</h2>
            <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] bg-white/[0.02] text-xs uppercase tracking-[0.1em] text-[#B1B2B3]/70">
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Storage</th>
                    <th className="px-4 py-3 font-semibold">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {STORAGE_ITEMS.map((item, i) => (
                    <tr
                      key={item.key}
                      className={i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.015]'}
                    >
                      <td className="px-4 py-3 align-top font-mono text-xs text-[#FEFEFE]">{item.key}</td>
                      <td className="px-4 py-3 align-top text-xs text-crimson">{item.where}</td>
                      <td className="px-4 py-3 align-top font-light text-[#B1B2B3]">{item.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs font-light text-[#B1B2B3]/70">
              None of this reads your name, email, or anything you type into a form field — click tracking
              explicitly skips input, textarea, and select elements.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">Our checkout partner</h2>
            <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
              <p>
                Completing a purchase takes you to our licensed store/checkout partner to pay. That site is
                operated separately and may set its own cookies under its own cookie and privacy policy, which
                this page doesn&rsquo;t control or speak for.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">Your controls</h2>
            <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
              <p>
                You can clear localStorage/sessionStorage at any time from your browser&rsquo;s site data
                settings (this will empty your cart, reset your anonymous analytics id, and clear queued
                offline events). Blocking cookies in your browser won&rsquo;t affect anything on this site,
                since we don&rsquo;t rely on them — but it may still affect our checkout partner&rsquo;s site.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">Changes to this policy</h2>
            <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
              <p>
                If we start using cookies or additional storage for tracking, advertising, or any new purpose,
                we&rsquo;ll update this page with a new revision date before we do.
              </p>
            </div>
          </div>

          <div>
            <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">Contact</h2>
            <div className="mt-3 space-y-1 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
              <p>Digital Software Market (DSM)</p>
              <p>Email: info@digitalsoftwaremarket.com</p>
              <p>Phone: +971 2 58 444 33</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-crimson/[0.05] to-transparent p-8 text-center">
          <h3 className="font-serif text-2xl text-[#FEFEFE]">Want the full data picture?</h3>
          <p className="max-w-md text-sm font-light text-[#B1B2B3]">
            Read the Privacy Policy for exactly what our analytics records and how it&rsquo;s used.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/privacy"
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
            >
              Read the Privacy Policy
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
            <Link
              to="/support"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:border-crimson/50 hover:text-crimson"
            >
              <LifeBuoy className="h-4 w-4" strokeWidth={2} />
              Visit support
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default CookiePolicy;
