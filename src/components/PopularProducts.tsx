import { ArrowRight, CheckCircle, Star } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useState } from "react";
import ProductModelViewer from "./ProductModelViewer";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

interface PopularProduct {
  name: string;
  category: string;
  price: string;
  oldPrice?: string;
  badge?: string;
  badgeColor?: string;
  mfr?: string;
  rating?: number;
  glbSrc?: string;
}

const popularProducts: PopularProduct[] = [
  {
    name: "Microsoft Office 2024 Professional Plus",
    category: "Microsoft Office",
    price: "AED 730.83",
    badge: "Lifetime",
    badgeColor: "bg-crimson/20 text-crimson",
    mfr: "AAA-03509-CCF",
    glbSrc: "/models/Microsoft_Office_2024_Lifetime.glb",
  },
  {
    name: "V-Ray 3D Rendering Software by Chaos",
    category: "SketchUp & V-Ray",
    price: "AED 1,465.33",
    badge: "Popular",
    badgeColor: "bg-gold/20 text-gold",
    rating: 5,
    glbSrc: "/models/V_Ray_3D_Rendering_Software.glb",
  },
  {
    name: "AutoCAD 2026 — Yearly Subscription",
    category: "Autodesk",
    price: "AED 4,403.33",
    badge: "New",
    badgeColor: "bg-azure/20 text-azure",
    glbSrc: "/models/AutoCAD_2026.glb",
  },
  {
    name: "Microsoft Visio Plan 2 Professional",
    category: "Microsoft Office",
    price: "AED 624.00",
    mfr: "VISIOCLIENT",
  },
  {
    name: "Revit 2026 — BIM Software",
    category: "Autodesk",
    price: "AED 6,607.00",
    badge: "Enterprise",
    badgeColor: "bg-crimson/20 text-crimson",
    glbSrc: "/models/Revit_2026_BIM_Software.glb",
  },
  {
    name: "Microsoft SQL Server 2025 Standard",
    category: "SQL Server",
    price: "AED 4,403.33",
    mfr: "AAA-03701-CCF",
    glbSrc: "/models/SQL_Server_2025_Standard.glb",
  },
  {
    name: "Windows 11 Enterprise",
    category: "Microsoft Windows",
    price: "AED 499.00",
    mfr: "FQC-10572",
    glbSrc: "/models/Windows_11_Enterprise.glb",
  },
  {
    name: "Adobe Creative Cloud All Apps",
    category: "Adobe",
    price: "AED 1,499.00",
    oldPrice: "AED 2,399.00",
    badge: "-38%",
    badgeColor: "bg-crimson/20 text-crimson",
    rating: 5,
    glbSrc: "/models/Adobe_Creative_Cloud_1yr.glb",
  },
  {
    name: "Microsoft 365 Business Premium",
    category: "Microsoft Office 365",
    price: "AED 2,934.33",
    mfr: "T5D-03489",
    glbSrc: "/models/Microsoft_365_Business_Premium.glb",
  },
  {
    name: "Planner and Project Plan 3",
    category: "Microsoft Project",
    price: "AED 1,098.00",
    oldPrice: "AED 1,299.00",
    badge: "-15%",
    badgeColor: "bg-gold/20 text-gold",
    glbSrc: "/models/MS_Project_Plan_3.glb",
  },
  {
    name: "Microsoft 365 E3 (100 Users)",
    category: "Enterprise",
    price: "AED 36,721.33",
    badge: "Volume",
    badgeColor: "bg-azure/20 text-azure",
    mfr: "CFQ7TTC0LF8R-0020",
    glbSrc: "/models/Microsoft_365_E3_100_Users.glb",
  },
  {
    name: "Microsoft 365 E5 Subscription",
    category: "Enterprise",
    price: "AED 70,000.00",
    badge: "Premium",
    badgeColor: "bg-gold/20 text-gold",
    mfr: "AAD-34688-PKG-12MO",
    glbSrc: "/models/Microsoft_365_E5_Subscription.glb",
  },
];

const ProductCard = ({ product }: { product: PopularProduct }) => {
  return (
    <div className="group relative">
      {/* Card container */}
      <div 
        className="relative aspect-[3/4] bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-4 transition-all duration-500 group-hover:border-crimson/30 group-hover:bg-white/[0.04] group-hover:shadow-[0_0_40px_rgba(200,50,50,0.08)]"
        style={{ perspective: "1000px" }}
      >
        {/* Badge */}
        {product.badge && (
          <div className="absolute top-3 left-3 z-10">
            <span className={`px-2.5 py-1 ${product.badgeColor} text-[10px] uppercase font-semibold tracking-[0.08em] rounded-sm backdrop-blur-sm`}>
              {product.badge}
            </span>
          </div>
        )}

        {/* Product visual area */}
        {product.glbSrc ? (
          <ProductModelViewer
            glbSrc={product.glbSrc}
            fallbackIcon={
              <div className="w-20 h-20 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <span className="text-2xl font-bold text-[#FEFEFE]/20">{product.name.charAt(0)}</span>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8 bg-gradient-to-br from-white/[0.02] to-transparent">
            <div className="w-24 h-24 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center group-hover:border-crimson/20 group-hover:bg-crimson/[0.04] transition-all duration-500">
              <span className="text-3xl font-serif text-[#FEFEFE]/30 group-hover:text-crimson/60 transition-colors duration-500">
                {product.name.charAt(0)}
              </span>
            </div>
          </div>
        )}

        {/* Hover overlay with action */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#060708]/95 via-[#060708]/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col gap-3 z-20">
          <div className="flex items-center gap-2 text-[10px] text-[#B1B2B3]/70">
            <CheckCircle className="w-3 h-3 text-emerald-500" /> Official Partner
          </div>
          <button className="btn-magnetic w-full py-2.5 bg-crimson text-[#FEFEFE] text-xs font-medium tracking-wide rounded-sm hover:bg-crimson-dark transition-all duration-300">
            Add to Cart
          </button>
        </div>
      </div>

      {/* Product info */}
      <div className="space-y-2">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-[#FEFEFE] text-sm mb-1 truncate group-hover:text-crimson transition-colors duration-300">
              {product.name}
            </h3>
            <p className="text-[#B1B2B3]/50 text-[11px] uppercase tracking-[0.1em]">{product.category}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {product.rating && (
              <div className="flex items-center gap-0.5">
                {Array.from({ length: product.rating }).map((_, i) => (
                  <Star key={i} className="w-3 h-3 fill-gold text-gold" />
                ))}
              </div>
            )}
            {product.mfr && (
              <span className="text-[10px] text-[#B1B2B3]/30 font-mono">{product.mfr}</span>
            )}
          </div>
          <div className="text-right">
            {product.oldPrice && (
              <span className="text-xs text-[#B1B2B3]/40 line-through mr-2">{product.oldPrice}</span>
            )}
            <span className="font-serif text-sm text-[#FEFEFE]">{product.price}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const PopularProducts = () => {
  const headingAnim = useScrollAnimation();
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? popularProducts : popularProducts.slice(0, 8);

  return (
    <section className="py-32 bg-surface-dark relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 section-divider-red" />

      {/* Ambient glow effects */}
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />
      <div className="absolute top-1/3 left-0 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.02) 0%, transparent 70%)" }} />

      <div className="max-w-[1600px] mx-auto px-6 relative z-10">
        {/* Header */}
        <div ref={headingAnim.ref} className={`flex flex-col md:flex-row justify-between items-start md:items-end mb-16 gap-6 ${headingAnim.className}`}>
          <div>
            <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-4">
              Browse Our Collection
            </span>
            <h2 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] tracking-tight">
              Popular Products
            </h2>
          </div>
          <a
            href="#"
            className="inline-flex items-center gap-2 text-xs font-medium text-[#B1B2B3]/50 uppercase tracking-[0.12em] border-b border-white/[0.06] pb-1 hover:text-crimson hover:border-crimson transition-all duration-300 group"
          >
            View Full Catalog
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>

        {/* Product grid - 4 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 stagger-children">
          {displayed.map((product) => (
            <AnimatedCard key={product.name}>
              <ProductCard product={product} />
            </AnimatedCard>
          ))}
        </div>

        {/* Show more / Show less */}
        {popularProducts.length > 8 && (
          <div className="mt-16 text-center">
            {!showAll ? (
              <button
                onClick={() => setShowAll(true)}
                className="btn-magnetic px-8 py-3 bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-[#B1B2B3]/60 uppercase tracking-[0.14em] rounded-sm hover:bg-crimson/[0.06] hover:border-crimson/20 hover:text-crimson transition-all duration-400"
              >
                Show All Products ({popularProducts.length})
              </button>
            ) : (
              <button
                onClick={() => setShowAll(false)}
                className="group inline-flex items-center gap-2 text-xs font-medium text-[#B1B2B3]/50 uppercase tracking-[0.12em] hover:text-crimson transition-all duration-300"
              >
                <span className="w-8 h-px bg-white/[0.1] group-hover:bg-crimson/40 transition-colors duration-300" />
                Show Less
                <span className="w-8 h-px bg-white/[0.1] group-hover:bg-crimson/40 transition-colors duration-300" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default PopularProducts;
