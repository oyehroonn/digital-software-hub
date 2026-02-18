import { ArrowRight } from "lucide-react";
import { useScrollAnimation, useCursorGlow } from "@/hooks/useScrollAnimation";

const autodesk2026Img = "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?q=80&w=2000&auto=format&fit=crop";

const BrandSpotlight = () => {
  const fadeRight = useScrollAnimation("animate-fade-right");
  const scaleIn = useScrollAnimation("animate-scale-in");
  const { containerRef, glowRef } = useCursorGlow();

  return (
    <section
      ref={containerRef}
      className="cursor-glow relative py-32 md:py-40 overflow-hidden bg-[#060708]"
    >
      <div ref={glowRef} className="cursor-glow-dot" />

      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.05) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] rounded-full" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Image / Visual */}
          <div ref={scaleIn.ref} className={`relative ${scaleIn.className}`}>
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-white/[0.04] group">
              <img
                src={autodesk2026Img}
                alt="Autodesk 2026 Collection"
                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/20 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#060708]/60 to-transparent" />

              {/* Floating badge */}
              <div className="absolute top-6 left-6 px-3 py-1.5 bg-white/[0.06] backdrop-blur-md border border-white/[0.08] rounded-sm text-[10px] font-semibold text-[#FEFEFE] uppercase tracking-[0.14em]">
                Brand Collection
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-1">
                    {["AutoCAD", "Revit", "Civil 3D", "3ds Max"].map((name) => (
                      <div
                        key={name}
                        className="w-8 h-8 rounded-full bg-white/[0.08] backdrop-blur border border-white/[0.1] flex items-center justify-center text-[8px] font-bold text-[#FEFEFE]/80"
                      >
                        {name.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <span className="text-[10px] text-[#B1B2B3]/50">+12 more products</span>
                </div>
              </div>
            </div>

            {/* Decorative corner frame */}
            <div className="absolute -top-3 -left-3 w-12 h-12 border-t border-l border-crimson/20 rounded-tl-sm pointer-events-none" />
            <div className="absolute -bottom-3 -right-3 w-12 h-12 border-b border-r border-crimson/20 rounded-br-sm pointer-events-none" />
          </div>

          {/* Copy */}
          <div ref={fadeRight.ref} className={fadeRight.className}>
            <span className="inline-block text-[10px] font-semibold text-azure uppercase tracking-[0.2em] mb-6">
              Featured Partner
            </span>
            <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#FEFEFE] leading-[0.95] tracking-tight mb-6">
              Autodesk<br />
              <span className="text-[#B1B2B3]/40 italic font-light">2026 Collection</span>
            </h2>
            <p className="text-base text-[#B1B2B3]/60 font-light leading-relaxed mb-8 max-w-md">
              The complete AEC toolkit for architecture, engineering, and construction professionals. AutoCAD, Revit, Civil 3D, and more — all with exclusive DSM pricing and instant deployment.
            </p>

            {/* Features list */}
            <div className="space-y-4 mb-10 border-t border-white/[0.04] pt-8">
              {[
                "Industry-leading BIM & CAD tools",
                "Flexible yearly & 3-year subscriptions",
                "Complimentary installation support",
                "Enterprise volume licensing available",
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-sm text-[#B1B2B3]/70 font-light">
                  <span className="w-1 h-1 rounded-full bg-crimson flex-shrink-0" />
                  {feature}
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-6">
              <a
                href="#"
                className="btn-magnetic cta-red-sheen inline-flex items-center gap-2 px-8 py-4 bg-crimson text-[#FEFEFE] text-xs font-semibold uppercase tracking-[0.14em] rounded-sm hover:bg-crimson-dark hover:shadow-crimson-glow transition-all duration-400 group"
              >
                Explore Collection
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
              </a>
              <a
                href="#"
                className="text-xs font-medium text-[#B1B2B3]/50 uppercase tracking-[0.12em] hover:text-azure transition-colors duration-300"
              >
                View Pricing
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default BrandSpotlight;
