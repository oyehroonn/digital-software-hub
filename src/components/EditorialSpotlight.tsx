import { useScrollAnimation } from "@/hooks/useScrollAnimation";
const windows11Bg = "https://images.unsplash.com/photo-1624571409412-1f253e1ecc89?q=80&w=2000&auto=format&fit=crop";

const EditorialSpotlight = () => {
  const fadeRight = useScrollAnimation("animate-fade-right");
  const scaleIn = useScrollAnimation("animate-scale-in");

  return (
    <section className="section-light py-32 overflow-hidden relative">
      <div className="max-w-[1600px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div ref={fadeRight.ref} className={`order-2 lg:order-1 ${fadeRight.className}`}>
          <span className="text-crimson font-medium text-sm mb-6 block tracking-[0.14em] uppercase">Spotlight</span>
          <h2 className="font-serif text-5xl md:text-7xl leading-[0.9] mb-8 tracking-tighter text-[hsl(220_10%_4%)]">
            Windows 11 <br />
            <span className="text-[hsl(220_3%_52%)] italic font-light">Professional</span>
          </h2>
          <p className="text-[hsl(220_3%_52%)] text-lg font-light leading-relaxed max-w-md mb-10">
            Designed for hybrid work. Powerful for employees. Consistent for IT. Secure for all. Experience the most secure Windows ever built.
          </p>
          <div className="flex items-center gap-8 border-t border-[hsl(40_8%_88%)] pt-8">
            <div>
              <span className="block text-3xl font-serif text-[hsl(220_10%_4%)]">AED 199</span>
              <span className="text-[10px] text-[hsl(220_3%_52%)] uppercase tracking-[0.14em]">Starting Price</span>
            </div>
            <div className="h-10 w-[1px] bg-[hsl(40_8%_88%)]" />
            <button className="btn-magnetic px-8 py-3 bg-crimson text-[#FEFEFE] hover:bg-crimson-dark hover:shadow-crimson-glow transition-all duration-400 text-sm font-medium rounded-sm">
              Configure License
            </button>
          </div>
        </div>

        <div ref={scaleIn.ref} className={`order-1 lg:order-2 relative ${scaleIn.className}`}>
          <div className="aspect-[4/5] relative bg-gradient-to-br from-[#0a0b0c] to-[#060708] rounded-lg overflow-hidden shadow-premium-lg border border-white/[0.06]">
            <div className="absolute inset-0">
              <img src={windows11Bg} alt="Windows 11 background" className="w-full h-full object-cover blur-xl scale-110 opacity-80" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 88 88" className="w-28 h-28 relative z-10 drop-shadow-2xl" fill="white">
                <path d="M0 12.402l35.687-4.86.016 34.423-35.67.203zm35.67 33.529l.028 34.453L.028 75.48.026 45.7zm4.326-39.025L87.314 0v41.527l-47.318.376zm47.329 39.349l-.011 41.34-47.318-6.678-.066-34.739z" />
              </svg>
            </div>
            <div className="absolute bottom-6 left-6 right-6 p-4 bg-white/[0.06] backdrop-blur-md border border-crimson/[0.1] rounded-md flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-[#FEFEFE]">Retail License</p>
                <p className="text-[10px] text-[#B1B2B3]">Lifetime Validity</p>
              </div>
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EditorialSpotlight;
