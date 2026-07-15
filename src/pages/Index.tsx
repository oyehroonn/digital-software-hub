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
import InstantQuote from "@/components/ai/InstantQuote";
import SavingsCalculator from "@/components/ai/SavingsCalculator";

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
            <InstantQuote />
            <SavingsCalculator />
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
      </main>
      <Footer />
    </>
  );
};

export default Index;
