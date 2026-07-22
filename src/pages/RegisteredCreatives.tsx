import { ArrowUpRight, BadgeCheck, Palette, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Footer from "@/components/Footer";
import GrainOverlay from "@/components/GrainOverlay";
import Header from "@/components/Header";
import ProductModelViewer from "@/components/ProductModelViewer";
import { DSM_CHOICES, dsmChoiceGlb } from "@/data/dsmChoices";

type CreativeModel = { id: number; name: string; link: string; folder: string };
const API = "https://dsm-api.techrealm.ai/models";
const fallbackModels: CreativeModel[] = DSM_CHOICES.map((choice) => ({ id: choice.id, name: choice.name, link: dsmChoiceGlb(choice), folder: choice.modelFolder }));

/** Public gallery for the verified DSM Creative Studio product-box collection. */
export default function RegisteredCreatives() {
  const [creativeModels, setCreativeModels] = useState<CreativeModel[]>(fallbackModels);

  useEffect(() => {
    fetch(API)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("creative catalogue unavailable")))
      .then((payload) => {
        const imported = (payload.models as CreativeModel[]).filter((model) => Number(model.id) >= 99001 && Number(model.id) < 99200);
        if (imported.length) setCreativeModels(imported);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="min-h-screen bg-[#060708] text-[#FEFEFE]">
      <GrainOverlay />
      <Header />
      <main className="relative overflow-hidden pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(200,50,50,0.16),transparent_66%)]" />
        <section className="relative mx-auto max-w-[1400px] px-6 pb-20 pt-20 md:pb-28 md:pt-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-crimson/30 bg-crimson/[0.08] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-crimson">
              <Palette className="size-3.5" aria-hidden /> Registered creatives
            </span>
            <h1 className="mt-7 font-serif text-5xl leading-[0.94] tracking-tight sm:text-6xl md:text-7xl">Boxes made to hold attention.</h1>
            <p className="mt-6 max-w-2xl text-base font-light leading-relaxed text-[#B1B2B3]/75 md:text-lg">A living collection of product packaging from the supplied Creative Studio archives. Each box is a real thin-carton GLB asset, not a mock-up.</p>
          </div>
          <div className="mt-12 flex flex-wrap gap-3 text-xs text-[#B1B2B3]/70">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2"><BadgeCheck className="size-3.5 text-emerald-400" /> {creativeModels.length} imported creative boxes</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2"><Sparkles className="size-3.5 text-azure" /> Thin-carton GLB standard</span>
          </div>
        </section>

        <section className="relative border-y border-white/[0.07] bg-[#090b0e]/80 py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-6">
            <div className="grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {creativeModels.map((product) => {
                return (
                  <Link key={product.id} to="/store" className="group block">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-white/[0.09] bg-gradient-to-b from-white/[0.035] to-transparent transition duration-300 group-hover:-translate-y-1 group-hover:border-crimson/40 group-hover:shadow-[0_18px_55px_rgba(0,0,0,0.34)]">
                      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
                        <span className="rounded-full border border-white/10 bg-[#060708]/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#B1B2B3] backdrop-blur">DSM Creative Studio</span>
                        <ArrowUpRight className="size-4 text-[#B1B2B3]/50 transition group-hover:text-crimson" aria-hidden />
                      </div>
                      <ProductModelViewer glbSrc={product.link} fallbackIcon={<span className="font-serif text-4xl text-white/20">DSM</span>} className="[&_model-viewer]:scale-[0.94]" />
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-base font-medium text-[#FEFEFE] transition group-hover:text-crimson">{product.name}</h2>
                        <p className="mt-1 text-sm font-light leading-relaxed text-[#B1B2B3]/60">Approved Creative Studio packaging</p>
                      </div>
                      <span className="text-[10px] font-semibold tracking-[0.14em] text-[#B1B2B3]/40">{product.id}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1400px] px-6 py-20 md:py-28">
          <div className="flex flex-col justify-between gap-8 border-l-2 border-crimson pl-6 md:flex-row md:items-end">
            <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-crimson">Creative registry</p><h2 className="mt-3 font-serif text-3xl tracking-tight md:text-4xl">Want a box in the collection?</h2><p className="mt-3 text-sm leading-relaxed text-[#B1B2B3]/70">New creator work is added only after its source files, approval, product link, and contributor credit are recorded in the box handover.</p></div>
            <Link to="/reseller" className="inline-flex items-center gap-2 self-start rounded-sm border border-crimson/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-crimson transition hover:bg-crimson hover:text-white md:self-auto">Partner with DSM <ArrowUpRight className="size-3.5" /></Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
