import { useState, useRef, useCallback } from 'react';
import DSMAILabLoader from '../components/DSMAILabLoader';
import Footer from '../components/Footer';
import TalkingAdvisor from '@/components/ai/TalkingAdvisor';
import SmartCallback from '@/components/ai/SmartCallback';

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

      <Footer />
    </div>
  );
};

export default Services;
