import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const EditorialSpotlight = () => {
  const fadeRight = useScrollAnimation("animate-fade-right");
  const scaleIn = useScrollAnimation("animate-scale-in");

  return (
    <section className="py-32 bg-stone-900 text-stone-100 overflow-hidden relative">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-900/20 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <div ref={fadeRight.ref} className={`order-2 lg:order-1 ${fadeRight.className}`}>
          <span className="text-cobalt font-medium text-sm mb-6 block tracking-widest uppercase">Spotlight</span>
          <h2 className="font-serif text-5xl md:text-7xl leading-[0.9] mb-8 tracking-tighter">
            Windows 11 <br />
            <span className="text-stone-500 italic font-light">Professional</span>
          </h2>
          <p className="text-stone-400 text-lg font-light leading-relaxed max-w-md mb-10">
            Designed for hybrid work. Powerful for employees. Consistent for IT. Secure for all. Experience the most secure Windows ever built.
          </p>
          <div className="flex items-center gap-8 border-t border-stone-800 pt-8">
            <div>
              <span className="block text-3xl font-serif">AED 199</span>
              <span className="text-xs text-stone-500 uppercase tracking-wider">Starting Price</span>
            </div>
            <div className="h-10 w-[1px] bg-stone-800" />
            <button className="px-8 py-3 bg-white text-stone-900 hover:bg-cobalt hover:text-white transition-colors text-sm font-medium rounded-sm">
              Configure License
            </button>
          </div>
        </div>

        <div ref={scaleIn.ref} className={`order-1 lg:order-2 relative ${scaleIn.className}`}>
          <div className="aspect-[4/5] relative bg-gradient-to-br from-stone-800 to-black rounded-lg overflow-hidden shadow-2xl border border-stone-800">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-3/4 h-3/4 bg-gradient-to-b from-[#e6f4f1] to-[#87a9e0] rounded opacity-90 blur-xl" />
              <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/Windows_11_logo.svg" alt="Windows 11" className="w-32 h-32 relative z-10 drop-shadow-2xl" />
            </div>
            <div className="absolute bottom-6 left-6 right-6 p-4 bg-white/10 backdrop-blur-md border border-white/10 rounded flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold">Retail License</p>
                <p className="text-[10px] text-stone-300">Lifetime Validity</p>
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
