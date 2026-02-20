import { ArrowRight } from "lucide-react";
import { useScrollAnimation, useCursorGlow } from "@/hooks/useScrollAnimation";
import ProductModelViewer from "./ProductModelViewer";

const BrandSpotlight = () => {
  const fadeRight = useScrollAnimation("animate-fade-right");
  const scaleIn = useScrollAnimation("animate-scale-in");
  const { containerRef, glowRef } = useCursorGlow();

  return (
    <section
      ref={containerRef}
      className="cursor-glow relative py-32 md:py-40 overflow-hidden bg-surface-dark"
    >
      <div ref={glowRef} className="cursor-glow-dot" />

      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] rounded-full" style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.05) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[300px] rounded-full" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* 3D Model Visual */}
          <div ref={scaleIn.ref} className={`relative ${scaleIn.className}`}>
            <div className="relative aspect-[4/5] rounded-lg overflow-hidden border border-azure/20 group bg-gradient-to-br from-[#0a0c10] via-[#0d1117] to-[#0a0c10] shadow-[0_0_80px_rgba(56,139,253,0.08)]">
              {/* Ambient glow behind model */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] rounded-full" style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.12) 0%, transparent 50%)" }} />
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[70%] h-[40%] rounded-full" style={{ background: "radial-gradient(ellipse, hsl(204 61% 51% / 0.08) 0%, transparent 60%)" }} />
                <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-[60%] h-[30%] rounded-full" style={{ background: "radial-gradient(ellipse, hsl(4 65% 54% / 0.08) 0%, transparent 70%)" }} />
              </div>

              {/* 3D Model - enlarged */}
              <div className="absolute inset-0 z-10 scale-110">
                <ProductModelViewer
                  glbSrc="/models/Autodesk_AEC_Collection_2026.glb"
                  fallbackIcon={
                    <div className="w-32 h-32 rounded-xl bg-azure/10 border border-azure/20 flex items-center justify-center">
                      <span className="text-4xl font-bold text-azure/40">A</span>
                    </div>
                  }
                />
              </div>

              {/* Top gradient overlay */}
              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#060708]/80 to-transparent z-20 pointer-events-none" />
              
              {/* Bottom gradient overlay */}
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#060708] via-[#060708]/80 to-transparent z-20 pointer-events-none" />

              {/* Floating badge */}
              <div className="absolute top-6 left-6 z-30 px-4 py-2 bg-azure/10 backdrop-blur-md border border-azure/30 rounded-sm text-[10px] font-semibold text-azure uppercase tracking-[0.14em] shadow-lg">
                Brand Collection
              </div>

              {/* Bottom bar */}
              <div className="absolute bottom-0 left-0 right-0 p-6 flex items-end justify-between z-30">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-1">
                    {["AutoCAD", "Revit", "Civil 3D", "3ds Max"].map((name) => (
                      <div
                        key={name}
                        className="w-9 h-9 rounded-full bg-azure/10 backdrop-blur border border-azure/30 flex items-center justify-center text-[9px] font-bold text-azure/90 shadow-md"
                      >
                        {name.charAt(0)}
                      </div>
                    ))}
                  </div>
                  <span className="text-[11px] text-[#B1B2B3]/60">+12 more products</span>
                </div>
              </div>
            </div>

            {/* Decorative corner frame - azure themed */}
            <div className="absolute -top-4 -left-4 w-16 h-16 border-t-2 border-l-2 border-azure/40 rounded-tl-sm pointer-events-none" />
            <div className="absolute -bottom-4 -right-4 w-16 h-16 border-b-2 border-r-2 border-crimson/30 rounded-br-sm pointer-events-none" />
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
