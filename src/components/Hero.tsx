import { useState, useEffect, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowDown, Check, Zap, Shield } from "lucide-react";
import { useHeroReveal, useCursorGlow } from "@/hooks/useScrollAnimation";
import MagnifyText from "./MagnifyText";
import type { MeshAccent } from "./HeroMesh";

// three.js (+ postprocessing) is the heaviest client dependency. Lazy-load the
// canvas so it downloads as its own chunk AFTER the hero text paints, keeping it
// out of the initial bundle (AL2 / AL10 — defer heavy canvas on slow mobile).
const HeroMesh = lazy(() => import("./HeroMesh"));

const Hero = () => {
  const ref = useHeroReveal();
  const { containerRef, glowRef } = useCursorGlow();
  const [meshAccent, setMeshAccent] = useState<MeshAccent>("red");

  // Defer the WebGL hero until the browser is idle. three.js + UnrealBloom init
  // is a long main-thread task; mounting it after first paint / interactivity
  // slashes Total Blocking Time (the page is usable before the mesh appears).
  const [showMesh, setShowMesh] = useState(false);
  useEffect(() => {
    const ric: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
        ? (cb) => (window as unknown as { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback(cb, { timeout: 2500 })
        : (cb) => window.setTimeout(cb, 1200);
    const id = ric(() => setShowMesh(true));
    return () => {
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cic ? cic(id) : clearTimeout(id);
    };
  }, []);

  return (
    <section
      ref={containerRef}
      className="cursor-glow relative min-h-screen flex items-center justify-center pt-28 overflow-hidden bg-[#030305]"
    >
      {/* Three.js interactive mesh background — deferred to browser idle so it
          doesn't block first paint / interactivity (see showMesh above). An
          instant CSS gradient stands in until it mounts. */}
      <div className="absolute inset-0 w-full h-full z-0">
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{ background: "radial-gradient(120% 90% at 50% 15%, hsl(4 70% 30% / 0.35) 0%, #0a0406 45%, #030305 100%)", opacity: showMesh ? 0 : 1 }}
        />
        {showMesh && (
          <Suspense fallback={null}>
            <HeroMesh accent={meshAccent} />
          </Suspense>
        )}
      </div>

      {/* Ambient orbs — layered above mesh, below text (radial gradients, no blur) */}
      <div className="absolute inset-0 z-[1] overflow-hidden pointer-events-none">
        <div
          className="absolute top-1/3 left-1/4 w-[50vw] h-[50vw] rounded-full"
          style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.08) 0%, transparent 70%)", animation: "orbFloat 12s ease-in-out infinite, orbColorCrimson 8s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-[35vw] h-[35vw] rounded-full"
          style={{ background: "radial-gradient(circle, hsl(43 87% 60% / 0.05) 0%, transparent 70%)", animation: "orbFloat 15s ease-in-out infinite reverse, orbColorGold 10s ease-in-out infinite" }}
        />
        <div
          className="absolute top-1/2 right-1/3 w-[25vw] h-[25vw] rounded-full"
          style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.05) 0%, transparent 70%)", animation: "orbFloat 18s ease-in-out infinite, orbColorAzure 12s ease-in-out infinite" }}
        />
      </div>

      {/* Cursor spotlight - above orbs, below content */}
      <div ref={glowRef} className="cursor-glow-dot z-[2]" />

      <div ref={ref} className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center">

        {/* Headline */}
        <div className="hero-reveal w-full text-center font-sans leading-[0.9] tracking-[0.04em] font-bold uppercase text-[#FEFEFE] mb-8 whitespace-nowrap" style={{ fontSize: "clamp(1.2rem, 4.8vw, 4rem)" }}>
          <MagnifyText text="DIGITAL SOFTWARE MARKET" />
        </div>

        {/* Subheadline */}
        <div className="hero-reveal text-base md:text-lg font-medium text-[#FEFEFE] max-w-2xl mx-auto leading-relaxed mb-14 [text-shadow:0_1px_10px_rgba(0,0,0,0.45)]">
          <MagnifyText text="The premium destination for genuine software licensing. Instant delivery, concierge support, and enterprise-grade security for teams of all sizes." />
        </div>

        {/* CTAs */}
        <div className="hero-reveal flex items-center gap-6 justify-center">
          <Link
            to="/support"
            className="btn-magnetic px-10 py-4 bg-[hsl(0_0%_100%/0.06)] border border-[hsl(0_0%_100%/0.15)] backdrop-blur-md text-[#FEFEFE] text-xs font-semibold uppercase tracking-[0.18em] rounded-sm hover:bg-azure/[0.12] hover:border-azure/40 hover:text-azure hover:shadow-azure-glow text-center flex items-center justify-center gap-3 group transition-all duration-400"
            onMouseEnter={() => setMeshAccent("azure")}
            onMouseLeave={() => setMeshAccent("red")}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-crimson group-hover:bg-azure transition-colors duration-300" />
            Talk to a Specialist
            <ArrowRight className="w-3.5 h-3.5 opacity-50 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/store"
            className="text-xs font-medium text-[#FEFEFE]/85 uppercase tracking-[0.14em] hover:text-crimson flex items-center gap-1.5 group transition-colors duration-300"
          >
            Shop Licenses
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="hero-reveal mt-14 flex items-center gap-6 text-xs text-[#FEFEFE]/85 justify-center">
          <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-crimson" /> 100% Genuine</span>
          <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-crimson" /> Instant Digital Delivery</span>
          <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-crimson" /> Lifetime Warranty</span>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10">
        <span className="text-[10px] text-[#B1B2B3]/50 uppercase tracking-[0.2em]">Scroll</span>
        <ArrowDown className="w-4 h-4 text-crimson/60 animate-bounce" strokeWidth={1.5} />
      </div>
    </section>
  );
};

export default Hero;
