import { ShieldCheck, BadgeDollarSign, Wrench, ArrowRight } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

const propositions = [
  {
    icon: ShieldCheck,
    number: "01",
    title: "All Software Licenses Are 100% Genuine",
    description: "We provide only fully authentic, original licenses — no cracked versions, no pirated keys, and absolutely no duplicates. Every product passes Microsoft, Adobe, and Autodesk verification.",
    accent: "crimson",
    gradient: "from-crimson/10 to-crimson/[0.02]",
  },
  {
    icon: BadgeDollarSign,
    number: "02",
    title: "Found a Better Price? We'll Beat It.",
    description: "Let us know and we'll beat that offer — no questions asked. We stand by our unbeatable value with a price-match guarantee on all genuine software licenses.",
    accent: "gold",
    gradient: "from-gold/10 to-gold/[0.02]",
  },
  {
    icon: Wrench,
    number: "03",
    title: "Complimentary Setup & Ongoing Support",
    description: "Enjoy hassle-free installation with our free setup assistance. Plus, our dedicated technical support team is here to help you every step of the way — from activation to deployment.",
    accent: "azure",
    gradient: "from-azure/10 to-azure/[0.02]",
  },
];

const WhyDSM = () => {
  const headingAnim = useScrollAnimation();

  return (
    <section className="py-32 md:py-40 bg-surface-dark relative overflow-hidden">
      {/* Ambient */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(204 61% 51% / 0.04) 0%, transparent 70%)" }} />

      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
        {/* Section header */}
        <div ref={headingAnim.ref} className={`text-center mb-20 ${headingAnim.className}`}>
          <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-6">
            The DSM Difference
          </span>
          <h2 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] leading-[1.05] tracking-tight mb-6">
            Why DSM<span className="text-crimson">?</span>
          </h2>
          <p className="text-base text-[#B1B2B3]/60 font-light max-w-lg mx-auto leading-relaxed">
            Three promises that define how we do business — and why thousands of companies trust us with their licensing.
          </p>
        </div>

        {/* Value proposition cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-children">
          {propositions.map((item) => (
            <AnimatedCard key={item.number} className="group relative">
              <div className={`relative h-full p-8 md:p-10 rounded-lg border border-white/[0.04] bg-gradient-to-b ${item.gradient} backdrop-blur-sm overflow-hidden transition-all duration-500 hover:border-${item.accent}/20 hover:shadow-[0_0_40px_hsl(var(--${item.accent})/0.06)]`}>
                {/* Hover shimmer */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                {/* Number watermark */}
                <span className="absolute top-6 right-8 font-serif text-7xl text-white/[0.02] group-hover:text-white/[0.04] transition-all duration-700 select-none">
                  {item.number}
                </span>

                <div className="relative z-10">
                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-full border border-white/[0.06] flex items-center justify-center mb-8 text-${item.accent} group-hover:border-${item.accent}/30 group-hover:bg-${item.accent}/[0.06] transition-all duration-500`}>
                    <item.icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>

                  {/* Content */}
                  <h3 className="font-serif text-xl text-[#FEFEFE] mb-4 leading-snug tracking-tight">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[#B1B2B3]/60 font-light leading-relaxed mb-8">
                    {item.description}
                  </p>

                  {/* Learn more link */}
                  <a href="#" className={`inline-flex items-center gap-2 text-xs font-medium text-${item.accent}/70 uppercase tracking-[0.1em] group-hover:text-${item.accent} transition-colors duration-300`}>
                    Learn More
                    <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyDSM;
