/**
 * Terms — /terms
 * ------------------------------------------------------------------------------
 * DSM's Terms of Service. Adapted from the real Terms & Conditions published on
 * the previous DSM WooCommerce site (digitalsoftwaremarkett.com/terms-and-conditions,
 * last updated June 2026) rather than written from scratch — same governing
 * structure, licensing/refund/liability posture, and contact details, ported to
 * this SPA's design system and trimmed of storefront chrome.
 *
 * A couple of fields (trade license / VAT TRN) aren't verifiable from any
 * source in this repo and are called out as explicit placeholders below rather
 * than invented.
 *
 * Resilience: same posture as About/Support — static content + SPA links only.
 */

import { Link } from 'react-router-dom';
import { ArrowRight, FileText, LifeBuoy, Sparkles } from 'lucide-react';

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
          Welcome to Digital Software Market (&ldquo;DSM&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or
          &ldquo;us&rdquo;). These Terms of Service govern your access to and use of our website, products,
          services, software licenses, and digital solutions.
        </p>
        <p>
          By accessing our website or purchasing any product or service from DSM, you agree to be bound by
          these Terms. If you do not agree, please do not use our website or services.
        </p>
      </>
    ),
  },
  {
    heading: 'Eligibility',
    body: (
      <p>
        By using our website or purchasing from DSM, you represent that you are at least 18 years old, that
        you have the authority to enter into legally binding agreements, and that any information you provide
        to DSM is accurate and complete.
      </p>
    ),
  },
  {
    heading: 'Products and services',
    body: (
      <p>
        DSM provides software licenses, cloud subscriptions, SaaS products, digital downloads, license
        renewals, technical support services, consulting and implementation services, and managed software
        solutions. All products are subject to availability and the licensing terms of the underlying
        publisher.
      </p>
    ),
  },
  {
    heading: 'Software licensing',
    body: (
      <>
        <p>
          All software products sold by DSM are subject to the licensing terms and agreements of the
          respective software publisher — examples include Microsoft, Autodesk, Adobe, Corel, Kaspersky, and
          other vendors we carry.
        </p>
        <p>
          Purchasing a license from DSM does not transfer ownership of the software itself. You receive the
          right to use the software in accordance with the publisher&rsquo;s End User License Agreement (EULA),
          and you are responsible for complying with all applicable licensing requirements.
        </p>
      </>
    ),
  },
  {
    heading: 'Pricing and payments',
    body: (
      <p>
        All prices displayed are subject to change without notice. DSM reserves the right to modify pricing,
        correct pricing errors, and cancel orders resulting from an incorrect price. Payments are made through
        the approved payment methods available at checkout, and orders are not processed until payment has
        been received and verified.
      </p>
    ),
  },
  {
    heading: 'Digital delivery',
    body: (
      <>
        <p>
          Most DSM products are delivered electronically — license keys, subscription activation, account
          provisioning, download instructions, or vendor portal access. Delivery timeframes vary by product and
          vendor requirements.
        </p>
        <p>
          DSM is not responsible for delays caused by vendor verification processes, incorrect information
          provided by the customer, third-party service interruptions, or force majeure events.
        </p>
      </>
    ),
  },
  {
    heading: 'Order verification',
    body: (
      <p>
        To prevent fraud and unauthorized transactions, DSM reserves the right to verify customer identity,
        request additional documentation, delay fulfillment pending verification, and reject suspicious
        transactions. Failure to provide requested information may result in order cancellation.
      </p>
    ),
  },
  {
    heading: 'Refunds',
    body: (
      <>
        <p>
          Given the nature of digital products and software licenses, delivered license keys, activated
          subscriptions, downloaded software, provisioned cloud services, and already-processed renewals are
          generally non-refundable.
        </p>
        <p>
          Refunds may be considered where an order is duplicated, a product cannot be delivered, DSM is unable
          to fulfill the order, or a refund is required under applicable consumer-protection law. Approved
          refunds are processed to the original payment method wherever possible. See our{' '}
          <Link to="/support#faq-refunds" className="text-crimson hover:underline">
            full refund policy
          </Link>{' '}
          for details on eligibility and how to request one.
        </p>
      </>
    ),
  },
  {
    heading: 'Customer responsibilities',
    body: (
      <p>
        You agree to provide accurate information, maintain account security, comply with software licensing
        terms, use products legally and ethically, and keep your login credentials confidential. You are
        responsible for all activity conducted under your account.
      </p>
    ),
  },
  {
    heading: 'Intellectual property',
    body: (
      <p>
        All content on the DSM website — logos, graphics, text, website design, documentation, and marketing
        materials — is protected by intellectual property law. No content may be copied, reproduced,
        distributed, or used without prior written permission from DSM or the applicable rights holder.
      </p>
    ),
  },
  {
    heading: 'Prohibited activities',
    body: (
      <p>
        You may not attempt unauthorized access to our systems, distribute malware or harmful code, interfere
        with website functionality, reverse-engineer proprietary systems, violate software licensing
        agreements, or use our services for unlawful purposes. DSM reserves the right to suspend or terminate
        access for violations.
      </p>
    ),
  },
  {
    heading: 'Technical support',
    body: (
      <p>
        DSM may provide technical assistance for eligible products. Support availability can vary by product
        type, vendor policy, subscription status, and service agreement — we do not guarantee uninterrupted
        support availability.
      </p>
    ),
  },
  {
    heading: 'Third-party products',
    body: (
      <p>
        Many products sold through DSM are provided by third-party vendors. DSM is not responsible for vendor
        product changes, feature modifications, service outages, or vendor policy or licensing decisions —
        customers remain subject to the terms of the respective software publisher.
      </p>
    ),
  },
  {
    heading: 'Disclaimer of warranties',
    body: (
      <p>
        Products and services are provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. DSM
        makes no warranties, express or implied, including merchantability, fitness for a particular purpose,
        non-infringement, or uninterrupted availability, to the maximum extent permitted by law.
      </p>
    ),
  },
  {
    heading: 'Limitation of liability',
    body: (
      <p>
        To the fullest extent permitted by law, DSM is not liable for indirect, consequential, or incidental
        damages, including loss of profits, loss of data, business interruption, or revenue loss.
        DSM&rsquo;s total liability for any claim shall not exceed the amount you paid for the specific
        product or service giving rise to that claim.
      </p>
    ),
  },
  {
    heading: 'Indemnification',
    body: (
      <p>
        You agree to indemnify and hold harmless DSM, its directors, employees, affiliates, and partners from
        claims, liabilities, damages, losses, or expenses arising from your use of our services, your
        violation of these Terms, your violation of applicable law, or your violation of third-party rights.
      </p>
    ),
  },
  {
    heading: 'Termination',
    body: (
      <p>
        DSM may suspend or terminate access to its website or services at any time if these Terms are
        violated, fraudulent activity is suspected, or termination is required by law. Termination does not
        affect rights or obligations that accrued before it.
      </p>
    ),
  },
  {
    heading: 'Governing law',
    body: (
      <p>
        These Terms are governed by and interpreted in accordance with the laws applicable in the jurisdiction
        where DSM operates (United Arab Emirates). Disputes arising from these Terms are subject to the
        exclusive jurisdiction of the competent courts in that jurisdiction.
      </p>
    ),
  },
  {
    heading: 'Changes to these Terms',
    body: (
      <p>
        DSM may update or modify these Terms at any time. Changes take effect upon publication on this page —
        continued use of our services after a change is posted constitutes acceptance of the revised Terms.
      </p>
    ),
  },
  {
    heading: 'Contact',
    body: (
      <div className="space-y-1">
        <p>Digital Software Market (DSM)</p>
        <p>Address: Building Number 1, Baniyas West Fourth, Baniyas, Abu Dhabi, UAE</p>
        <p>Phone: +971 2 58 444 33</p>
        <p>Email: info@digitalsoftwaremarket.com</p>
        <p className="mt-3 text-xs text-[#B1B2B3]/60">
          Trade license / VAT TRN: <span className="italic">[insert DSM&rsquo;s UAE trade license and VAT TRN here — not verifiable from available records]</span>
        </p>
      </div>
    ),
  },
];

const Terms = () => {
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
            <FileText className="h-3.5 w-3.5" strokeWidth={2} />
            Legal
          </span>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-[#FEFEFE] sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]">
            The rules that govern using DSM and buying genuine software licenses through us — plain enough to
            actually read.
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
          <h3 className="font-serif text-2xl text-[#FEFEFE]">Questions about these Terms?</h3>
          <p className="max-w-md text-sm font-light text-[#B1B2B3]">
            Our support team can walk you through licensing, refunds, or anything else in this document.
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

export default Terms;
