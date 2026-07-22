import { ArrowRight, BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ProductModelViewer from "@/components/ProductModelViewer";
import { DSM_CHOICES, dsmChoiceGlb } from "@/data/dsmChoices";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

/** The home priority shelf: approved creative packaging, not API popularity. */
export default function TopProducts() {
  const navigate = useNavigate();
  const headingAnim = useScrollAnimation();

  return (
    <section className="section-light py-32">
      <div className="max-w-[1600px] mx-auto px-6">
        <div ref={headingAnim.ref} className={`flex flex-col justify-between gap-6 md:flex-row md:items-end mb-12 ${headingAnim.className}`}>
          <div>
            <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-4">Digital Software Market Choice</span>
            <h2 className="font-serif text-3xl md:text-4xl text-[hsl(220_10%_4%)]">Designed boxes. Chosen software.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-black/55">Priority products selected by DSM and presented in their approved Creative Studio packaging.</p>
          </div>
          <button onClick={() => navigate("/store")} className="hidden md:inline-flex items-center gap-2 self-start rounded-sm border border-[hsl(40_8%_88%)] px-4 py-2.5 text-sm font-medium text-[hsl(220_10%_4%)] transition hover:border-crimson hover:bg-crimson hover:text-white md:self-auto">
            Browse catalogue <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
          {DSM_CHOICES.map((product) => (
            <article key={product.id} className="group cursor-pointer" onClick={() => navigate("/store")}>
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[hsl(40_8%_88%)] bg-[hsl(40_25%_99%)] transition duration-300 group-hover:-translate-y-1 group-hover:border-crimson/50 group-hover:shadow-xl">
                <div className="absolute left-3 top-3 z-10 rounded-full border border-black/[0.08] bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-black/60 backdrop-blur">DSM Choice</div>
                <ProductModelViewer glbSrc={dsmChoiceGlb(product)} fallbackIcon={<span className="font-serif text-3xl text-black/20">DSM</span>} className="bg-transparent" />
              </div>
              <div className="mt-4 flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-crimson" aria-hidden />
                <div>
                  <h3 className="text-sm font-semibold text-[hsl(220_10%_4%)] transition group-hover:text-crimson">{product.name}</h3>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-black/45">{product.category}</p>
                  <p className="mt-2 text-sm leading-relaxed text-black/55">{product.description}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
