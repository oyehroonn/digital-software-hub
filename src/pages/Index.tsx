import Header from "@/components/Header";
import Hero from "@/components/Hero";
import LogoStrip from "@/components/LogoStrip";
import RoleGrid from "@/components/RoleGrid";
import EditorialSpotlight from "@/components/EditorialSpotlight";
import ProductGrid from "@/components/ProductGrid";
import TrustSection from "@/components/TrustSection";
import Footer from "@/components/Footer";
import FloatingChatButton from "@/components/FloatingChatButton";
import GrainOverlay from "@/components/GrainOverlay";

const Index = () => {
  return (
    <>
      <GrainOverlay />
      <Header />
      <main>
        <Hero />
        <LogoStrip />
        <RoleGrid />
        <EditorialSpotlight />
        <ProductGrid />
        <TrustSection />
      </main>
      <Footer />
      <FloatingChatButton />
    </>
  );
};

export default Index;
