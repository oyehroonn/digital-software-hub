import { ArrowRight, ArrowUpRight, Star } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useRef, useState, useCallback, useEffect } from "react";

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
}

const popularProducts: PopularProduct[] = [
  {
    name: "Microsoft Office 2024 Professional Plus",
    category: "Microsoft Office",
    price: "AED 730.83",
    badge: "Lifetime",
    badgeColor: "bg-crimson/10 text-crimson",
    mfr: "AAA-03509-CCF",
  },
  {
    name: "V-Ray 3D Rendering Software by Chaos",
    category: "SketchUp & V-Ray",
    price: "AED 1,465.33",
    badge: "Popular",
    badgeColor: "bg-gold/10 text-gold",
    rating: 5,
  },
  {
    name: "AutoCAD 2026 — Yearly Subscription",
    category: "Autodesk",
    price: "AED 4,403.33",
    badge: "New",
    badgeColor: "bg-azure/10 text-azure",
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
    badgeColor: "bg-crimson/10 text-crimson",
  },
  {
    name: "Microsoft SQL Server 2025 Standard",
    category: "SQL Server",
    price: "AED 4,403.33",
    mfr: "AAA-03701-CCF",
  },
  {
    name: "Windows 11 Enterprise",
    category: "Microsoft Windows",
    price: "AED 499.00",
    mfr: "FQC-10572",
  },
  {
    name: "Adobe Creative Cloud All Apps",
    category: "Adobe",
    price: "AED 1,499.00",
    oldPrice: "AED 2,399.00",
    badge: "-38%",
    badgeColor: "bg-crimson/10 text-crimson",
    rating: 5,
  },
  {
    name: "Microsoft 365 Business Premium",
    category: "Microsoft Office 365",
    price: "AED 2,934.33",
    mfr: "T5D-03489",
  },
  {
    name: "Planner and Project Plan 3",
    category: "Microsoft Project",
    price: "AED 1,098.00",
    oldPrice: "AED 1,299.00",
    badge: "-15%",
    badgeColor: "bg-gold/10 text-gold",
  },
  {
    name: "Microsoft 365 E3 (100 Users)",
    category: "Enterprise",
    price: "AED 36,721.33",
    badge: "Volume",
    badgeColor: "bg-azure/10 text-azure",
    mfr: "CFQ7TTC0LF8R-0020",
  },
  {
    name: "Microsoft 365 E5 Subscription",
    category: "Enterprise",
    price: "AED 70,000.00",
    badge: "Premium",
    badgeColor: "bg-gold/10 text-gold",
    mfr: "AAD-34688-PKG-12MO",
  },
];

const ProductRow = ({ product }: { product: PopularProduct }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative grid grid-cols-12 items-center gap-4 py-5 px-4 -mx-4 rounded-lg transition-all duration-400 hover:bg-white/[0.015]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Product info */}
      <div className="col-span-6 md:col-span-5 flex items-center gap-4">
        <div className="w-10 h-10 rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center flex-shrink-0 group-hover:border-crimson/20 transition-all duration-400">
          <span className="text-xs font-bold text-[#FEFEFE]/40 group-hover:text-crimson transition-colors duration-300">
            {product.name.charAt(0)}
          </span>
        </div>
        <div className="min-w-0">
          <h4 className="text-sm text-[#FEFEFE] font-medium truncate group-hover:text-crimson transition-colors duration-300">
            {product.name}
          </h4>
          <span className="text-[10px] text-[#B1B2B3]/40 uppercase tracking-[0.1em]">
            {product.category}
          </span>
        </div>
      </div>

      {/* Badge + MFR */}
      <div className="col-span-3 md:col-span-3 hidden md:flex items-center gap-3">
        {product.badge && (
          <span className={`px-2 py-0.5 ${product.badgeColor} text-[9px] uppercase font-semibold tracking-[0.06em] rounded-sm`}>
            {product.badge}
          </span>
        )}
        {product.mfr && (
          <span className="text-[10px] text-[#B1B2B3]/30 font-mono">
            {product.mfr}
          </span>
        )}
        {product.rating && (
          <div className="flex items-center gap-0.5">
            {Array.from({ length: product.rating }).map((_, i) => (
              <Star key={i} className="w-2.5 h-2.5 fill-gold text-gold" />
            ))}
          </div>
        )}
      </div>

      {/* Price */}
      <div className="col-span-4 md:col-span-2 text-right flex items-center justify-end gap-2">
        {product.oldPrice && (
          <span className="text-xs text-[#B1B2B3]/30 line-through">{product.oldPrice}</span>
        )}
        <span className="font-serif text-sm text-[#FEFEFE]">{product.price}</span>
      </div>

      {/* Action */}
      <div className="col-span-2 flex justify-end">
        <span
          className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-400 ${
            hovered
              ? "bg-crimson border-crimson text-[#FEFEFE] scale-100"
              : "bg-transparent border-white/[0.06] text-[#B1B2B3]/30 scale-90"
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </span>
      </div>

      {/* Bottom border */}
      <div className="absolute bottom-0 left-4 right-4 h-px bg-white/[0.03]" />
    </div>
  );
};

const PopularProducts = () => {
  const headingAnim = useScrollAnimation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);

  const displayed = showAll ? popularProducts : popularProducts.slice(0, 8);

  return (
    <section className="py-32 bg-[#060708] relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 section-divider-red" />

      {/* Ambient */}
      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />

      <div className="max-w-[1200px] mx-auto px-6 relative z-10">
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

        {/* Table header */}
        <div className="grid grid-cols-12 items-center gap-4 px-4 mb-2 text-[9px] text-[#B1B2B3]/30 uppercase tracking-[0.14em] font-semibold">
          <div className="col-span-6 md:col-span-5">Product</div>
          <div className="col-span-3 hidden md:block">Details</div>
          <div className="col-span-4 md:col-span-2 text-right">Price</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mb-2" />

        {/* Product list */}
        <div ref={scrollRef}>
          {displayed.map((product) => (
            <AnimatedCard key={product.name}>
              <ProductRow product={product} />
            </AnimatedCard>
          ))}
        </div>

        {/* Show more */}
        {!showAll && popularProducts.length > 8 && (
          <div className="mt-10 text-center">
            <button
              onClick={() => setShowAll(true)}
              className="btn-magnetic px-8 py-3 bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-[#B1B2B3]/60 uppercase tracking-[0.14em] rounded-sm hover:bg-crimson/[0.06] hover:border-crimson/20 hover:text-crimson transition-all duration-400"
            >
              Show All Products ({popularProducts.length})
            </button>
          </div>
        )}
      </div>
    </section>
  );
};

export default PopularProducts;
