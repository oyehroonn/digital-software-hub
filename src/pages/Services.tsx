import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import DSMAILabLoader from '../components/DSMAILabLoader';
import Footer from '../components/Footer';
import TalkingAdvisor from '@/components/ai/TalkingAdvisor';
import SmartCallback from '@/components/ai/SmartCallback';
import OwnProductBoxes from '@/components/OwnProductBoxes';

const Services = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isContentReady, setIsContentReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeLoad = useCallback(() => {
    // AL2: content is ready as soon as the iframe loads — no extra 1s gate,
    // so the boot loader can clear well within the ≤2s budget.
    setIsContentReady(true);
  }, []);

  const handleLoadComplete = useCallback(() => {
    setIsLoading(false);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#030305]">
      {/* Always-available way back to the main DSM landing page (the AI Lab is a
          full-viewport iframe with no DSM chrome, so without this you're stuck). */}
      <Link
        to="/"
        aria-label="Back to the DSM home page"
        className="fixed left-5 top-5 z-[10000] inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-md transition-colors hover:border-crimson/60 hover:text-crimson"
      >
        <span aria-hidden className="text-base leading-none">&larr;</span> DSM Store
      </Link>
      {isLoading && (
        <DSMAILabLoader
          onLoadComplete={handleLoadComplete}
          isContentReady={isContentReady}
        />
      )}

      {/* The AI Lab experience (external interactive page) as a full-viewport hero. */}
      <div className="relative h-screen w-full">
        <iframe
          ref={iframeRef}
          src="/services/dsmAIFinal.html"
          title="DSM AI Lab Services"
          className="h-full w-full border-0"
          style={{
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 500ms ease-out',
          }}
          onLoad={handleIframeLoad}
          allowFullScreen
        />
      </div>

      {/*
        AI Lab live tools (features 07 + 10). Each obeys the resilience contract:
        - TalkingAdvisor renders the Simli avatar only when Simli is healthy and
          otherwise degrades to the text Sales Concierge (never a broken widget).
        - SmartCallback renders nothing when the codex-proxy is down.
        Placed below the lab hero so the whole page scrolls to reach them.
      */}
      <section className="relative z-10 border-t border-white/[0.06] bg-[#030305] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crimson">
              Talk to DSM
            </span>
            <h2 className="mt-2 font-serif text-3xl text-[#FEFEFE] sm:text-4xl">
              Meet your AI IT advisor
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#B1B2B3]">
              Ask anything about licensing, compliance, or which edition keeps you
              audit-safe — face to face, in plain English. Prefer a human? Book a
              free 30-minute call and we&apos;ll come prepared.
            </p>
          </div>

          <div className="space-y-12">
            <TalkingAdvisor />
            <div className="mx-auto max-w-2xl">
              <SmartCallback />
            </div>
          </div>
        </div>
      </section>

      {/*
        Own-product showcase — features OUR products as DSM-style 3D boxes in
        the fixed priority order (DSM first). Pure CSS 3D so it renders with no
        backend and stays light on mobile; each box links to that product.
      */}
      <section className="relative z-10 border-t border-white/[0.06] bg-[#050507] px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crimson">
              Built by DSM
            </span>
            <h2 className="mt-2 font-serif text-3xl text-[#FEFEFE] sm:text-4xl">
              Our product studio
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#B1B2B3]">
              The same team behind this AI Lab ships real products. Explore the
              stack — hover any box to bring it forward, click to open it.
            </p>
          </div>
          <OwnProductBoxes variant="grid" />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Services;
