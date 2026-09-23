/**
 * ResellerCertificate — /reseller-certificate
 * ------------------------------------------------------------------------------
 * Different in kind from Terms/Privacy/Cookies: a credential page, not a policy
 * page. No real reseller-certificate document (PDF, certificate number, or
 * scanned image) exists anywhere in this repo, in Cherry notes, or on the old
 * WooCommerce site — a targeted search turned up nothing but unrelated agency
 * portfolio "certificate" images from an unrelated template folder.
 *
 * Rather than fabricate a certificate number or issuing body, this page states
 * DSM's actual, already-public partner/certification claims verbatim from
 * where they're published elsewhere on the site:
 *   - About.tsx: "genuine, traceable license from an official partner channel
 *     — Microsoft, Autodesk, Adobe, Corel, Kaspersky and more."
 *   - ResellerPortal.tsx: the "{tier} Partner" copy shown to reseller-program
 *     members.
 *   - DSMAILABPAGES/offerings.html (the DSM AI Labs microsite): "ISO 27001 &
 *     9001" and "Official Microsoft, Adobe & Autodesk partner."
 * A visitor asking for "proof" gets DSM's real, sourced positioning — not an
 * invented certificate graphic or a fake registration number.
 *
 * Resilience: same posture as About/Support — static content + SPA links only.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, BadgeCheck, LifeBuoy, ShieldCheck } from 'lucide-react';

import Header from '@/components/Header';
import Footer from '@/components/Footer';
import GrainOverlay from '@/components/GrainOverlay';

const PARTNERS = [
  {
    name: 'Microsoft',
    detail: 'Official licensing partner — Windows, Microsoft 365, Server & Azure products.',
  },
  {
    name: 'Adobe',
    detail: 'Official licensing partner — Creative Cloud and Adobe business products.',
  },
  {
    name: 'Autodesk',
    detail: 'Official licensing partner — AutoCAD and Autodesk design/engineering products.',
  },
  {
    name: 'Corel & Kaspersky',
    detail: 'Additional official partner channels for creative and security software.',
  },
];

const CERTIFICATIONS = [
  {
    name: 'ISO 27001',
    detail: 'Information security management — carried by the DSM AI Labs division alongside our software-licensing business.',
  },
  {
    name: 'ISO 9001',
    detail: 'Quality management systems certification.',
  },
];

const ResellerCertificate = () => {
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
            <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />
            Reseller Certificate
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl">
            Authorized reseller, verified in the open
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            DSM doesn&rsquo;t have a single scanned certificate to hand you — what we have is real partner
            standing with the publishers whose licenses we sell. Here it is, stated plainly.
          </p>
        </div>
      </section>

      <section className="relative px-6 pb-4">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="font-serif text-2xl text-[#FEFEFE] sm:text-3xl">Official licensing partners</h2>
          <p className="mt-3 max-w-2xl text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
            Every license DSM sells is genuine and traceable to an official partner channel — not a grey-market
            key of unknown origin.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {PARTNERS.map((p) => (
              <div
                key={p.name}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-crimson/30"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-crimson/[0.08] text-crimson">
                  <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 font-serif text-lg text-[#FEFEFE]">{p.name}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-[#B1B2B3]">{p.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 py-20">
        <div className="mx-auto max-w-[1000px]">
          <h2 className="font-serif text-2xl text-[#FEFEFE] sm:text-3xl">Certifications</h2>
          <p className="mt-3 max-w-2xl text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
            DSM&rsquo;s certification standing, as published on our services division&rsquo;s site.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {CERTIFICATIONS.map((c) => (
              <div
                key={c.name}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6 transition-colors duration-300 hover:border-crimson/30"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-crimson/[0.08] text-crimson">
                  <BadgeCheck className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 font-serif text-lg text-[#FEFEFE]">{c.name}</h3>
                <p className="mt-2 text-sm font-light leading-relaxed text-[#B1B2B3]">{c.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-20">
        <div className="mx-auto max-w-[900px]">
          <h2 className="font-serif text-2xl text-[#FEFEFE] sm:text-3xl">Want it in writing?</h2>
          <div className="mt-6 space-y-5 text-sm font-light leading-relaxed text-[#B1B2B3] sm:text-base">
            <p>
              We don&rsquo;t have a single downloadable reseller-certificate PDF live on this site yet. If your
              procurement or compliance team needs a formal letter of authorization, a specific partner
              reference number, or documentation for a particular publisher, our support team can put you in
              touch with the right paperwork for your order.
            </p>
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="mx-auto flex max-w-[900px] flex-col items-center gap-4 rounded-2xl border border-white/[0.07] bg-gradient-to-br from-crimson/[0.05] to-transparent p-8 text-center">
          <h3 className="font-serif text-2xl text-[#FEFEFE]">Need formal reseller documentation?</h3>
          <p className="max-w-md text-sm font-light text-[#B1B2B3]">
            Contact support and we&rsquo;ll get you what your procurement team needs for a specific order or
            publisher.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/support"
              className="inline-flex items-center gap-2 rounded-full bg-crimson px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:bg-crimson-dark"
            >
              <LifeBuoy className="h-4 w-4" strokeWidth={2} />
              Contact support
            </Link>
            <Link
              to="/reseller"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-[#FEFEFE] transition-colors hover:border-crimson/50 hover:text-crimson"
            >
              Visit the reseller portal
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default ResellerCertificate;
