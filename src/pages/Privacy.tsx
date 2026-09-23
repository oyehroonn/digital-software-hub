/**
 * Privacy — /privacy
 * ------------------------------------------------------------------------------
 * DSM's Privacy Policy. The overall structure, company info, and stated rights
 * are adapted from the real Privacy Policy published on the previous DSM
 * WooCommerce site (digitalsoftwaremarkett.com/privacy-policy, last updated
 * June 2026). The "what we actually collect" sections below have been rewritten
 * to match THIS site's real behavior rather than carried over verbatim:
 *
 *  - Tracking is `src/lib/track.ts` + `src/lib/stable/analytics.ts` — a
 *    self-hosted DSM Analytics API (no Google Analytics / ad pixels). It logs
 *    page views, clicks (position + element identity, never form values),
 *    scroll depth/dwell, and a cursor attention heatmap, keyed to a per-tab
 *    session id and a durable anonymous id stored in the browser (see Cookie
 *    Policy) — not to your name or email unless you separately submit a form.
 *  - Lead capture (`src/lib/captureLead.ts`) records the email + source
 *    whenever you submit one on-site: newsletter, account sign-in, reseller
 *    registration, a quote, a savings estimate, or a callback booking.
 *  - Checkout (`src/pages/Checkout.tsx`) collects the email/phone you provide
 *    and your order details, then emails you purchase links or a booking link.
 *    DSM does not collect or store payment card details directly on this
 *    site — payment is completed with our licensed store/checkout partner.
 *
 * Resilience: same posture as About/Support — static content + SPA links only.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, LifeBuoy, Shield } from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';

const LAST_UPDATED = 'September 2026';

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: 'Introduction',
    body: (
      <>
        <p>
          Digital Software Market (&ldquo;DSM&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;)
          respects your privacy. This Privacy Policy explains how we collect, use, store, disclose, and
          safeguard information when you visit our website, purchase products or services, communicate with
          our team, or interact with our digital platforms.
        </p>
        <p>By using our website and services, you agree to the practices described here.</p>
      </>
    ),
  },
  {
    heading: 'Information you give us',
    body: (
      <>
        <p>
          When you sign in, check out, subscribe to our newsletter, register as a reseller, request a quote or
          savings estimate, or book a callback, we collect what you enter into that form — typically your
          name, email address, and sometimes phone number, company, or a free-text note about what you need.
          Every email address submitted anywhere on the site is recorded as a lead, tagged with where it came
          from, so our team can follow up and it appears in our customer records.
        </p>
        <p>
          At checkout we collect your email, optional phone number, and your order details (products,
          quantities, licensing questions), then email you your purchase links or a booking link.{' '}
          <strong>DSM does not collect or store your payment card details directly on this site</strong> —
          purchases are completed through our licensed store/checkout partner, and any account or business
          information you provide there (billing details, tax/VAT information, license assignment) is
          collected by that partner under their own terms.
        </p>
      </>
    ),
  },
  {
    heading: 'Information we collect automatically',
    body: (
      <>
        <p>
          Our site runs a lightweight, self-hosted analytics layer (no third-party ad trackers or Google
          Analytics). While you browse, it automatically records:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Page views — the page, referrer, viewport size, language, and rough timestamp.</li>
          <li>
            Clicks — the clicked element&rsquo;s identity and visible text (never the contents of an input,
            textarea, or password field) and its position on screen, to understand which parts of a page get
            used.
          </li>
          <li>Scroll depth and dwell time per section of a page.</li>
          <li>
            A cursor attention heatmap (time spent hovering different regions of a page), sampled and flushed
            periodically.
          </li>
        </ul>
        <p>
          Each of these is tied to a per-tab session identifier and a longer-lived anonymous visitor
          identifier generated in your browser (see our{' '}
          <Link to="/cookies" className="text-crimson hover:underline">
            Cookie Policy
          </Link>{' '}
          for exactly how those are stored) — not to your name or email, unless you separately submit one of
          the forms above. We also log standard technical data any web server sees: IP address, browser type,
          device/OS, and general usage patterns, mainly for security and to keep the site working.
        </p>
      </>
    ),
  },
  {
    heading: 'How we use your information',
    body: (
      <p>
        We use the information above to process orders, deliver digital licenses and software products,
        verify customer identity, provide technical support, respond to inquiries, manage accounts, improve
        our products and site, send order confirmations and service updates, prevent fraud, comply with legal
        obligations, and — where you&rsquo;ve opted in — send marketing communications.
      </p>
    ),
  },
  {
    heading: 'Marketing communications',
    body: (
      <p>
        If you subscribe or otherwise opt in, we may send product updates, renewal reminders, promotional
        offers, and service announcements. You can unsubscribe at any time using the link in any marketing
        email or by contacting us directly.
      </p>
    ),
  },
  {
    heading: 'How we share information',
    body: (
      <>
        <p>We do not sell personal information. We may share it with:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Technology partners</strong> — the software vendors and distributors whose licenses we
            sell (Microsoft, Autodesk, Adobe, and other authorized publishers), where necessary for license
            provisioning, activation, validation, or support.
          </li>
          <li>
            <strong>Service providers</strong> — trusted third parties who help us with payment processing,
            website hosting, email delivery, customer support, analytics infrastructure, and cloud hosting.
          </li>
          <li>
            <strong>Legal requirements</strong> — where disclosure is required by applicable law, government
            authorities, court order, or regulation.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: 'International data transfers',
    body: (
      <p>
        DSM serves customers globally. Your information may be processed or stored in countries outside your
        place of residence where our partners, vendors, or service providers operate. We take reasonable
        measures to keep personal information protected regardless of where it is processed.
      </p>
    ),
  },
  {
    heading: 'Data security',
    body: (
      <p>
        We implement technical, administrative, and organizational safeguards designed to protect personal
        information against unauthorized access, alteration, disclosure, misuse, or loss. No internet
        transmission or storage system can be guaranteed as completely secure, but we work to keep ours safe.
      </p>
    ),
  },
  {
    heading: 'Data retention',
    body: (
      <p>
        We retain personal information only as long as necessary to provide our services, maintain business
        records, meet legal obligations, resolve disputes, and enforce agreements. When information is no
        longer required, it is deleted or anonymized.
      </p>
    ),
  },
  {
    heading: 'Your privacy rights',
    body: (
      <p>
        Depending on your location and applicable law, you may have the right to access, correct, or request
        deletion of your personal information, restrict or object to certain processing, withdraw consent, or
        request a copy of your data. To exercise any of these rights, contact us using the details below.
      </p>
    ),
  },
  {
    heading: "Children's privacy",
    body: (
      <p>
        Our products and services are intended for businesses and adults. We do not knowingly collect personal
        information from children under the age required by applicable law.
      </p>
    ),
  },
  {
    heading: 'Third-party links',
    body: (
      <p>
        Our website may link to third-party websites, software vendors, and partner services — including the
        licensed store/checkout partner used to complete purchases. DSM is not responsible for the privacy
        practices of external sites; please review their policies directly.
      </p>
    ),
  },
  {
    heading: 'Changes to this policy',
    body: (
      <p>
        We may update this Privacy Policy from time to time. Changes are posted on this page with an updated
        revision date — continued use of our services after a change is posted constitutes acceptance of the
        revised policy.
      </p>
    ),
  },
  {
    heading: 'Contact us',
    body: (
      <div className="space-y-1">
        <p>Digital Software Market (DSM)</p>
        <p>Address: Building Number 1, Baniyas West Fourth, Baniyas, Abu Dhabi, UAE</p>
        <p>Phone: +971 2 58 444 33</p>
        <p>Email: info@digitalsoftwaremarket.com</p>
      </div>
    ),
  },
];

const Privacy = () => {
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
            <Shield className="h-3.5 w-3.5" strokeWidth={2} />
            Legal
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            What we collect, why, and the controls you have — described the way this site actually behaves,
            not generic boilerplate.
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-[#B1B2B3]/50">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto max-w-[900px] space-y-10">
          {SECTIONS.map((s) => (
            <div key={s.heading}>
              <h2 className="font-serif text-xl text-[#FEFEFE] sm:text-2xl">{s.heading}</h2>
              <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-crimson/[0.05] to-transparent p-8 text-center">
          <h3 className="font-serif text-2xl text-[#FEFEFE]">Want a copy of your data, or to opt out?</h3>
          <p className="max-w-md text-sm font-light text-[#B1B2B3]">
            Reach out and our support team will help with any privacy request.
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
              to="/cookies"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:border-crimson/50 hover:text-crimson"
            >
              Read the Cookie Policy
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Privacy;
