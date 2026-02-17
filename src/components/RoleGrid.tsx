import { ArrowRight, ArrowUpRight, GraduationCap } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
const creativeStudioImg = "https://images.unsplash.com/photo-1561070791-2526d30994b5?q=80&w=2000&auto=format&fit=crop";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

const RoleGrid = () => {
  return (
    <section className="py-32 bg-[#060708] relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-crimson/[0.03] rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto px-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16">
          <div>
            <h2 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] mb-4 tracking-tight">
              <span className="gold-line-reveal">Curated by Role</span>
            </h2>
            <p className="text-[#B1B2B3] font-light max-w-sm">Software solutions tailored to your specific professional needs.</p>
          </div>
          <a href="#" className="hidden md:flex items-center gap-2 text-sm font-medium text-[#B1B2B3] border-b border-white/10 pb-1 hover:border-crimson hover:text-crimson transition-all duration-300">
            View All Collections <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-4 h-[800px] md:h-[600px] stagger-children">
          {/* Enterprise - Large */}
          <AnimatedCard className="group relative col-span-1 md:col-span-2 row-span-2 overflow-hidden rounded-md cursor-pointer border border-white/[0.04]">
            <img src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=2000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Enterprise" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 w-full z-10">
              <span className="text-[10px] font-semibold text-crimson uppercase tracking-[0.14em] mb-2 block">For Teams</span>
              <h3 className="text-3xl font-serif text-[#FEFEFE] mb-2">Enterprise & IT</h3>
              <p className="text-[#B1B2B3] text-sm font-light mb-6 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">Scalable volume licensing for Microsoft 365, Server, and Security.</p>
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.08] backdrop-blur text-[#FEFEFE] group-hover:bg-crimson group-hover:text-[#FEFEFE] transition-all duration-300"><ArrowUpRight className="w-5 h-5" /></span>
            </div>
          </AnimatedCard>

          {/* Creative Studio */}
          <AnimatedCard className="group relative col-span-1 md:col-span-2 row-span-1 overflow-hidden rounded-md cursor-pointer border border-white/[0.04]">
            <img src={creativeStudioImg} className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Creative Studio" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/30 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 w-full flex justify-between items-end z-10">
              <div>
                <span className="text-[10px] font-semibold text-gold uppercase tracking-[0.14em] mb-1 block">For Designers</span>
                <h3 className="text-2xl font-serif text-[#FEFEFE]">Creative Studio</h3>
              </div>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.08] backdrop-blur text-[#FEFEFE] group-hover:bg-gold group-hover:text-[#060708] transition-all duration-300"><ArrowRight className="w-4 h-4" /></span>
            </div>
          </AnimatedCard>

          {/* AEC & BIM */}
          <AnimatedCard className="group relative col-span-1 row-span-1 overflow-hidden rounded-md cursor-pointer border border-white/[0.04]">
            <img src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=1000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Architecture" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060708] via-[#060708]/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 w-full z-10">
              <span className="text-[10px] font-semibold text-azure uppercase tracking-[0.14em] mb-1 block">CAD & BIM</span>
              <h3 className="text-xl font-serif text-[#FEFEFE]">AEC & BIM</h3>
              <p className="text-[#B1B2B3]/70 text-xs mt-1">Autodesk & V-Ray</p>
            </div>
          </AnimatedCard>

          {/* Education */}
          <AnimatedCard className="group relative col-span-1 row-span-1 overflow-hidden bg-[#0a0b0d] rounded-md cursor-pointer flex items-center justify-center border border-white/[0.04] hover:border-crimson/20 transition-all duration-500">
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-full border border-[#B1B2B3]/20 flex items-center justify-center mx-auto mb-4 text-[#B1B2B3] group-hover:border-crimson group-hover:text-crimson group-hover:shadow-crimson-glow transition-all duration-500">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif text-[#FEFEFE] mb-1">Education</h3>
              <p className="text-[#B1B2B3]/60 text-xs">Special pricing for students & faculty.</p>
            </div>
          </AnimatedCard>
        </div>
      </div>
    </section>
  );
};

export default RoleGrid;
