import { ArrowRight, ArrowDown, Check, Zap, Shield } from "lucide-react";
import { useHeroReveal } from "@/hooks/useScrollAnimation";

const Hero = () => {
  const ref = useHeroReveal();

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0 bg-stone-100">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] bg-stone-200 rounded-full blur-[120px] opacity-60 mix-blend-multiply animate-pulse" style={{ animationDuration: "5s" }} />
        <img
          src="https://images.unsplash.com/photo-1497215728101-856f4ea42174?q=80&w=2000&auto=format&fit=crop"
          className="absolute inset-0 w-full h-full object-cover opacity-20 grayscale mix-blend-overlay"
          alt="Minimal Office"
        />
      </div>

      <div ref={ref} className="relative z-10 w-full max-w-[1600px] mx-auto px-6 grid grid-cols-12 gap-6 items-center">
        <div className="col-span-12 lg:col-span-8 lg:col-start-2 text-center lg:text-left">
          {/* Trust Badge */}
          <div className="hero-reveal mb-6 flex justify-center lg:justify-start">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 border border-border rounded-full bg-white/50 backdrop-blur-sm text-xs font-medium text-muted-foreground uppercase tracking-widest">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Official Certified Reseller
            </span>
          </div>

          {/* Headline */}
          <h1 className="hero-reveal font-serif text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tight text-foreground mb-8">
            Digital <br />
            <span className="italic font-light text-muted-foreground">Architecture</span> <br />
            For Creators.
          </h1>

          {/* Subheadline */}
          <p className="hero-reveal text-lg md:text-xl font-light text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed mb-10">
            The premium destination for genuine software licensing.
            Instant delivery, concierge support, and enterprise-grade security for teams of all sizes.
          </p>

          {/* CTAs */}
          <div className="hero-reveal flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
            <a href="#" className="px-8 py-4 bg-foreground text-background text-sm font-medium tracking-wide rounded-sm hover:bg-cobalt transition-colors duration-300 w-full sm:w-auto text-center flex items-center justify-center gap-2 group">
              Shop Licenses <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a href="#" className="px-8 py-4 bg-transparent border border-border text-foreground text-sm font-medium tracking-wide rounded-sm hover:border-foreground transition-colors duration-300 w-full sm:w-auto text-center">
              Talk to a Specialist
            </a>
          </div>

          {/* Trust indicators */}
          <div className="hero-reveal mt-8 flex items-center gap-6 text-xs text-muted-foreground justify-center lg:justify-start">
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3" /> 100% Genuine</span>
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Instant Digital Delivery</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3" /> Lifetime Warranty</span>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
        <ArrowDown className="w-5 h-5 text-muted-foreground" strokeWidth={1} />
      </div>
    </section>
  );
};

export default Hero;
