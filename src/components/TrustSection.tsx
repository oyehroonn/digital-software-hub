import { ShieldCheck, Clock, Headphones, CreditCard, ArrowRight } from "lucide-react";
import { useCursorGlow } from "@/hooks/useScrollAnimation";

const features = [
  {
    icon: ShieldCheck,
    title: "Certified Authenticity",
    desc: "Direct partner status with Microsoft, Adobe, and Autodesk ensures 100% genuine keys that pass every audit.",
    accent: "text-gold",
    glow: "group-hover:shadow-[0_0_20px_hsl(43_87%_60%/0.1)]",
  },
  {
    icon: Clock,
    title: "Instant Concierge Delivery",
    desc: "No waiting. Receive your license keys and installation guides securely via email seconds after purchase.",
    accent: "text-crimson",
    glow: "group-hover:shadow-[0_0_20px_hsl(4_65%_54%/0.1)]",
  },
  {
    icon: Headphones,
    title: "Technical Setup Support",
    desc: "Our specialists don't just sell; they help you install, activate, and troubleshoot deployment issues.",
    accent: "text-azure",
    glow: "group-hover:shadow-[0_0_20px_hsl(204_61%_51%/0.1)]",
  },
  {
    icon: CreditCard,
    title: "Secure Transactions",
    desc: "Encrypted checkout with purchase protection and full VAT invoicing for corporate compliance.",
    accent: "text-gold",
    glow: "group-hover:shadow-[0_0_20px_hsl(43_87%_60%/0.1)]",
  },
];

const TrustSection = () => {
  const { containerRef, glowRef } = useCursorGlow();

  return (
    <section
      ref={containerRef}
      className="cursor-glow py-28 bg-[#060708] relative overflow-hidden"
    >
      <div ref={glowRef} className="cursor-glow-dot" />

      {/* Gold divider at top */}
      <div className="absolute top-0 left-0 right-0 section-divider-gold" />

      <div className="max-w-[1600px] mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          <div className="lg:col-span-5">
            <h2 className="font-serif text-4xl mb-6 text-[#FEFEFE]">
              Why the world's leading<br />companies trust <span className="text-gold">DSM.</span>
            </h2>
            <p className="text-[#B1B2B3] font-light leading-relaxed mb-8">
              We aren't just a marketplace; we are your licensing compliance partner. From audit support to volume discounts, we handle the complexities of software procurement so you can focus on building.
            </p>
            <a href="#" className="text-sm font-medium text-gold border-b border-gold/30 pb-1 hover:border-gold transition-colors inline-flex items-center gap-2 group">
              Read our story <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
            {features.map((f) => (
              <div key={f.title} className={`group flex gap-4 p-4 -m-4 rounded-lg transition-all duration-500 ${f.glow}`}>
                <div className={`w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center flex-shrink-0 ${f.accent} group-hover:border-current/30 transition-all duration-300`}>
                  <f.icon className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <div>
                  <h4 className="font-medium text-[#FEFEFE] mb-2">{f.title}</h4>
                  <p className="text-sm text-[#B1B2B3]/80 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
