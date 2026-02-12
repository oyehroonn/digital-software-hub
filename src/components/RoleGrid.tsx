import { ArrowRight, ArrowUpRight, GraduationCap } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

const RoleGrid = () => {
  return (
    <section className="py-32 bg-background">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16">
          <div>
            <h2 className="font-serif text-4xl md:text-5xl text-foreground mb-4 tracking-tight">Curated by Role</h2>
            <p className="text-muted-foreground font-light max-w-sm">Software solutions tailored to your specific professional needs.</p>
          </div>
          <a href="#" className="hidden md:flex items-center gap-2 text-sm font-medium text-foreground border-b border-border pb-1 hover:border-cobalt transition-colors">
            View All Collections <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 grid-rows-2 gap-4 h-[800px] md:h-[600px]">
          {/* Enterprise - Large */}
          <AnimatedCard className="group relative col-span-1 md:col-span-2 row-span-2 overflow-hidden bg-stone-200 rounded-sm cursor-pointer">
            <img src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?q=80&w=2000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Enterprise" />
            <div className="absolute inset-0 bg-stone-900/20 group-hover:bg-stone-900/10 transition-colors" />
            <div className="absolute bottom-0 left-0 p-8 w-full">
              <span className="text-xs font-semibold text-white uppercase tracking-widest mb-2 block opacity-80">For Teams</span>
              <h3 className="text-3xl font-serif text-white mb-2">Enterprise & IT</h3>
              <p className="text-white/80 text-sm font-light mb-6 opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-500">Scalable volume licensing for Microsoft 365, Server, and Security.</p>
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur text-white group-hover:bg-cobalt transition-colors"><ArrowUpRight className="w-5 h-5" /></span>
            </div>
          </AnimatedCard>

          {/* Creative Studio */}
          <AnimatedCard className="group relative col-span-1 md:col-span-2 row-span-1 overflow-hidden bg-stone-200 rounded-sm cursor-pointer">
            <img src="https://images.unsplash.com/photo-1558655146-d09347e0b7a9?q=80&w=1000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Creative" />
            <div className="absolute inset-0 bg-stone-900/20" />
            <div className="absolute bottom-0 left-0 p-8 w-full flex justify-between items-end">
              <div>
                <span className="text-xs font-semibold text-white uppercase tracking-widest mb-1 block opacity-80">For Designers</span>
                <h3 className="text-2xl font-serif text-white">Creative Studio</h3>
              </div>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/20 backdrop-blur text-white group-hover:bg-cobalt transition-colors"><ArrowRight className="w-4 h-4" /></span>
            </div>
          </AnimatedCard>

          {/* AEC & BIM */}
          <AnimatedCard className="group relative col-span-1 row-span-1 overflow-hidden bg-stone-200 rounded-sm cursor-pointer">
            <img src="https://images.unsplash.com/photo-1531403009284-440f080d1e12?q=80&w=1000&auto=format&fit=crop" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Architecture" />
            <div className="absolute inset-0 bg-stone-900/30" />
            <div className="absolute bottom-0 left-0 p-6 w-full">
              <h3 className="text-xl font-serif text-white">AEC & BIM</h3>
              <p className="text-white/70 text-xs mt-1">Autodesk & V-Ray</p>
            </div>
          </AnimatedCard>

          {/* Education */}
          <AnimatedCard className="group relative col-span-1 row-span-1 overflow-hidden bg-stone-800 rounded-sm cursor-pointer flex items-center justify-center">
            <div className="text-center p-6">
              <div className="w-12 h-12 rounded-full border border-stone-600 flex items-center justify-center mx-auto mb-4 text-stone-300 group-hover:border-cobalt group-hover:text-cobalt transition-colors">
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-serif text-white mb-1">Education</h3>
              <p className="text-stone-400 text-xs">Special pricing for students & faculty.</p>
            </div>
          </AnimatedCard>
        </div>
      </div>
    </section>
  );
};

export default RoleGrid;
