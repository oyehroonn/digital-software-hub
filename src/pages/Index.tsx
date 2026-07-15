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
import { lazy, Suspense } from "react";

// Home-hero AI tools (features 01 + 05) are lazy-loaded so their LLM/quote code
// stays out of the landing chunk; AIFeature still gates each on proxy health.
const InstantQuote = lazy(() => import("@/components/ai/InstantQuote"));
const SavingsCalculator = lazy(() => import("@/components/ai/SavingsCalculator"));

const Index = () => {
  return (
    <>
      <GrainOverlay />
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
        {/*
          Home-hero AI tools (features 01 + 05). Each is wrapped in <AIFeature
          backend="codex"> and renders NOTHING when the LLM proxy is down, so
          this band silently collapses and the stable page is never blocked.
        */}
        <section
          id="instant-quote"
          className="relative z-10 bg-[#030305] px-6 pb-24 -mt-px"
        >
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2 md:items-start">
            <Suspense fallback={null}>
              <InstantQuote />
            </Suspense>
            <Suspense fallback={null}>
              <SavingsCalculator />
            </Suspense>
          </div>
        </section>
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
          End-of-page scroll animation — our own products drift past as
          DSM-style 3D boxes (fixed priority order, DSM first). The row only
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
              A studio of products built by the DSM team. Hover to pause, click
              any box to explore.
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
