import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import LogoStrip from "@/components/LogoStrip";
import RoleGrid from "@/components/RoleGrid";
import StatsStatement from "@/components/StatsStatement";
import EditorialSpotlight from "@/components/EditorialSpotlight";
import TopProducts from "@/components/TopProducts";
import PopularProducts from "@/components/PopularProducts";
import WhyDSM from "@/components/WhyDSM";
import BrandSpotlight from "@/components/BrandSpotlight";
import TrustSection from "@/components/TrustSection";
import Footer from "@/components/Footer";
import GrainOverlay from "@/components/GrainOverlay";
import OwnProductBoxes from "@/components/OwnProductBoxes";
import AIFeature from "@/components/ai/AIFeature";
import { Sparkles } from "lucide-react";
import { lazy, Suspense } from "react";

// Home-hero AI tools (features 01 + 05) are lazy-loaded so their LLM/quote code
// stays out of the landing chunk; AIFeature still gates each on proxy health.
const InstantQuote = lazy(() => import("@/components/ai/InstantQuote"));
const SavingsCalculator = lazy(() => import("@/components/ai/SavingsCalculator"));

/**
 * PricingBand — the framed home pricing section that holds the two lead tools.
 *
 * Both tools need codex-proxy, so the ENTIRE band (eyebrow, heading, ambient
 * glow and the two cards) is itself wrapped in <AIFeature backend="codex">. When
 * the proxy is down the whole section unmounts — no dangling empty header — and
 * the stable page below simply flows up. When it is healthy the header renders
 * and each card still runs its own health re-check as it mounts.
 */
const PricingBand = ({ children }: { children: React.ReactNode }) => (
  <AIFeature backend="codex" feature="pricing-band" recheckMs={60000}>
    <section
      id="instant-quote"
      className="relative z-10 -mt-px overflow-hidden bg-[#030305] px-6 py-24 md:py-32"
    >
      {/* Ambient crimson wash — matches the language of the sections below. */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(ellipse, hsl(4 65% 54% / 0.08) 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 h-[360px] w-[360px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.04) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 mx-auto max-w-[1160px]">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-crimson/25 bg-crimson/[0.06] px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-crimson">
            <Sparkles className="size-3.5" aria-hidden />
            Instant Pricing
          </span>
          <h2 className="mt-6 font-serif text-4xl leading-[1.05] tracking-tight text-[#FEFEFE] sm:text-5xl">
            Know your price before you talk to anyone
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base font-light leading-relaxed text-[#B1B2B3]/70">
            Two AI-powered tools, one honest number in seconds. Describe your team
            for a tailored quote, or tell us what you spend today and watch the
            savings add up — no forms, no sales call required.
          </p>
        </div>

        {/* The two lead cards — equal height, cohesive dark-crimson shells. */}
        <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:items-stretch">
          {children}
        </div>
      </div>
    </section>
  </AIFeature>
);

const Index = () => {
  return (
    <>
      <GrainOverlay />
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        {/*
          Home pricing band — the two lead-capture AI tools (features 01 + 05).
          Each is wrapped in <AIFeature backend="codex"> and renders NOTHING when
          the LLM proxy is down. If BOTH collapse the whole section — heading,
          glow and all — unmounts cleanly (see PricingBand), so the stable page
          is never left with a dangling, empty header.
        */}
        <PricingBand>
          <Suspense fallback={null}>
            <InstantQuote />
          </Suspense>
          <Suspense fallback={null}>
            <SavingsCalculator />
          </Suspense>
        </PricingBand>
        <LogoStrip />
        <RoleGrid />
        <StatsStatement />
        <EditorialSpotlight />
        <TopProducts />
        <WhyDSM />
        <BrandSpotlight />
        <PopularProducts />
        <TrustSection />
        {/*
          End-of-page scroll animation — our own products drift past in a
          fixed priority order. The row only
          animates once it scrolls into view and pauses on hover; pure CSS 3D
          keeps it smooth on mobile. Each box links to that product.
        */}
        <section className="relative z-10 overflow-hidden border-t border-white/[0.06] bg-[#050507] py-24">
          <div className="mb-12 px-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-crimson">
              The DSM Family
            </span>
            <h2 className="mt-2 font-serif text-3xl text-[#FEFEFE] sm:text-4xl">
              More than a marketplace
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-[#B1B2B3]">
              Products built by the DSM team. Hover to pause, then select a
              product to explore.
            </p>
          </div>
          <OwnProductBoxes variant="marquee" />
        </section>
      </main>
      <Footer />
    </>
  );
};

export default Index;
