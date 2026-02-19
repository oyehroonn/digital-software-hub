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

const Index = () => {
  return (
    <>
      <GrainOverlay />
      <AnnouncementBar />
      <Header />
      <main>
        <Hero />
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
