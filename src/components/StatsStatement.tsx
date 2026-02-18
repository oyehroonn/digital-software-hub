import { useEffect, useRef, useState, useCallback } from "react";
import { useCursorGlow } from "@/hooks/useScrollAnimation";

interface StatItem {
  value: number;
  suffix: string;
  label: string;
  sublabel: string;
}

const STATS: StatItem[] = [
  { value: 1994, suffix: "", label: "Trusted Since", sublabel: "Over 30 years of excellence in digital licensing" },
  { value: 16, suffix: "k+", label: "Clients Served", sublabel: "Across enterprise, public & private sectors" },
  { value: 100, suffix: "+", label: "Countries Covered", sublabel: "Supplying licenses across East Africa, Asia & beyond" },
  { value: 100, suffix: "%", label: "Certified Genuine", sublabel: "Every product is authentic and original" },
];

function useCountUp(target: number, duration: number, started: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!started) return;
    let raf: number;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setCount(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, started]);

  return count;
}

const StatCard = ({ stat, index, started }: { stat: StatItem; index: number; started: boolean }) => {
  const count = useCountUp(stat.value, 2200 + index * 200, started);

  return (
    <div
      className="group relative text-center px-6 py-10 transition-all duration-500"
      style={{ animationDelay: `${index * 120}ms` }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-lg bg-crimson/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <span className="relative block font-serif text-5xl md:text-6xl lg:text-7xl text-[#FEFEFE] mb-3 tracking-tight">
        {stat.value === 1994 ? (
          <span className="tabular-nums">{count}</span>
        ) : (
          <>
            <span className="tabular-nums">{count}</span>
            <span className="text-crimson">{stat.suffix}</span>
          </>
        )}
      </span>
      <span className="relative block text-xs font-semibold text-[#FEFEFE]/90 uppercase tracking-[0.16em] mb-2">
        {stat.label}
      </span>
      <span className="relative block text-xs text-[#B1B2B3]/50 font-light max-w-[200px] mx-auto leading-relaxed">
        {stat.sublabel}
      </span>
    </div>
  );
};

const StatsStatement = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const { containerRef, glowRef } = useCursorGlow();

  const handleIntersect = useCallback(([entry]: IntersectionObserverEntry[]) => {
    if (entry.isIntersecting) setStarted(true);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(handleIntersect, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [handleIntersect]);

  return (
    <section
      ref={(el) => {
        sectionRef.current = el;
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className="cursor-glow relative py-32 md:py-40 bg-[#060708] overflow-hidden"
    >
      <div ref={glowRef} className="cursor-glow-dot" />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full" style={{ background: "radial-gradient(ellipse, hsl(4 65% 54% / 0.05) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6">
        {/* Headline */}
        <div className="text-center mb-20">
          <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-6">
            Our Impact
          </span>
          <h2 className="font-serif text-4xl md:text-5xl lg:text-6xl text-[#FEFEFE] leading-[1] tracking-tight mb-6">
            We Don't Just Sell Software
            <br />
            <span className="text-[#B1B2B3]/40 italic font-light">We Power Businesses.</span>
          </h2>
          <p className="text-base text-[#B1B2B3]/60 font-light max-w-xl mx-auto leading-relaxed">
            Since 1994, DSM has helped over 15,000 businesses secure genuine Microsoft, Autodesk, and Adobe licenses — faster, smarter, and with confidence.
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-white/[0.04] rounded-lg overflow-hidden">
          {STATS.map((stat, i) => (
            <div key={stat.label} className={`${i < STATS.length - 1 ? "md:border-r md:border-white/[0.04]" : ""} ${i < 2 ? "border-b md:border-b-0 border-white/[0.04]" : ""}`}>
              <StatCard stat={stat} index={i} started={started} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsStatement;
