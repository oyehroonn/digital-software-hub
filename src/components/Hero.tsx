import { ArrowRight, ArrowDown, Check, Zap, Shield } from "lucide-react";
import { useHeroReveal, useCursorGlow } from "@/hooks/useScrollAnimation";

const Hero = () => {
  const ref = useHeroReveal();
  const { containerRef, glowRef } = useCursorGlow();

  return (
    <section
      ref={containerRef}
      className="cursor-glow relative min-h-screen flex items-center justify-center pt-20 overflow-hidden bg-[#060708]"
    >
      {/* Cursor glow */}
      <div ref={glowRef} className="cursor-glow-dot" />

      {/* Ambient orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute top-1/3 left-1/4 w-[50vw] h-[50vw] rounded-full blur-[200px] bg-[hsl(43_87%_60%)]"
          style={{ animation: "orbFloat 12s ease-in-out infinite, orbColorGold 8s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[35vw] h-[35vw] rounded-full blur-[180px] bg-[hsl(4_65%_54%)]"
          style={{ animation: "orbFloat 15s ease-in-out infinite reverse, orbColorCrimson 10s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-[25vw] h-[25vw] rounded-full blur-[160px] bg-[hsl(204_61%_51%)]"
          style={{ animation: "orbFloat 18s ease-in-out infinite, orbColorAzure 12s ease-in-out infinite" }}
        />
      </div>

      <div ref={ref} className="relative z-10 w-full max-w-[1600px] mx-auto px-6 grid grid-cols-12 gap-6 items-center">
        <div className="col-span-12 lg:col-span-8 lg:col-start-2 text-center lg:text-left">
          {/* Trust Badge */}
          <div className="hero-reveal mb-8 flex justify-center lg:justify-start">
            <span className="inline-flex items-center gap-2.5 px-4 py-2 border border-gold/20 rounded-full bg-gold/[0.05] backdrop-blur-sm text-xs font-medium text-gold uppercase tracking-[0.12em]">
              <span className="w-1.5 h-1.5 bg-gold rounded-full animate-pulse" />
              Official Certified Reseller
            </span>
          </div>

          {/* Headline */}
          <h1 className="hero-reveal font-serif text-5xl md:text-7xl lg:text-[5.5rem] leading-[0.88] tracking-tight text-[#FEFEFE] mb-8">
            Digital <br />
            <span className="italic font-light text-gold">Architecture</span> <br />
            For Creators.
          </h1>

          {/* Subheadline */}
          <p className="hero-reveal text-lg md:text-xl font-light text-[#B1B2B3] max-w-lg mx-auto lg:mx-0 leading-relaxed mb-12">
            The premium destination for genuine software licensing.
            Instant delivery, concierge support, and enterprise-grade security for teams of all sizes.
          </p>

          {/* CTAs */}
          <div className="hero-reveal flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
            <a
              href="#"
              className="btn-magnetic cta-gold-sheen px-8 py-4 bg-gold text-[#060708] text-sm font-semibold tracking-wide rounded-sm hover:bg-crimson hover:text-[#FEFEFE] hover:shadow-crimson-glow w-full sm:w-auto text-center flex items-center justify-center gap-2 group"
            >
              Shop Licenses <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#"
              className="btn-magnetic px-8 py-4 bg-transparent border border-gold/30 text-gold text-sm font-medium tracking-wide rounded-sm hover:bg-azure/[0.08] hover:border-azure hover:text-azure hover:shadow-azure-glow w-full sm:w-auto text-center transition-all duration-400"
            >
              Talk to a Specialist
            </a>
          </div>

          {/* Trust indicators */}
          <div className="hero-reveal mt-10 flex items-center gap-6 text-xs text-[#B1B2B3] justify-center lg:justify-start">
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-gold" /> 100% Genuine</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-gold" /> Instant Digital Delivery</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-gold" /> Lifetime Warranty</span>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        <span className="text-[10px] text-[#B1B2B3]/50 uppercase tracking-[0.2em]">Scroll</span>
        <ArrowDown className="w-4 h-4 text-gold/60 animate-bounce" strokeWidth={1.5} />
      </div>
    </section>
  );
};

export default Hero;
