import AnnouncementBar from "@/components/AnnouncementBar";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import LogoStrip from "@/components/LogoStrip";
import RoleGrid from "@/components/RoleGrid";
import StatsStatement from "@/components/StatsStatement";
import EditorialSpotlight from "@/components/EditorialSpotlight";
import ProductGrid from "@/components/ProductGrid";
import WhyDSM from "@/components/WhyDSM";
import BrandSpotlight from "@/components/BrandSpotlight";
import PopularProducts from "@/components/PopularProducts";
import TrustSection from "@/components/TrustSection";
import Footer from "@/components/Footer";
import FloatingChatButton from "@/components/FloatingChatButton";
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
        <ProductGrid />
        <WhyDSM />
        <BrandSpotlight />
        <PopularProducts />
        <TrustSection />
      </main>
      <Footer />
      <FloatingChatButton />
    </>
  );
};

export default Index;
