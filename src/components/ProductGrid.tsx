import { CheckCircle, Star } from "lucide-react";
import { useState } from "react";
import ProductModelViewer from "./ProductModelViewer";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

interface Product {
  name: string;
  subtitle: string;
  price: string;
  priceRange?: string;
  oldPrice?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  glbSrc?: string;
  hoverLabel: string;
  hoverAction: string;
  category: string;
  rating?: number;
}

const OfficeIcon = () => (
  <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-400 rounded-xl shadow-lg flex items-center justify-center">
    <svg viewBox="0 0 48 48" className="w-10 h-10">
      <rect x="8" y="6" width="32" height="36" rx="2" fill="white" opacity="0.9"/>
      <rect x="12" y="14" width="16" height="2" rx="1" fill="#2563eb"/>
      <rect x="12" y="20" width="24" height="2" rx="1" fill="#2563eb" opacity="0.6"/>
      <rect x="12" y="26" width="20" height="2" rx="1" fill="#2563eb" opacity="0.4"/>
      <rect x="12" y="32" width="22" height="2" rx="1" fill="#2563eb" opacity="0.3"/>
      <text x="24" y="12" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#1d4ed8">O</text>
    </svg>
  </div>
);

const AcrobatIcon = () => (
  <div className="w-20 h-20 bg-gradient-to-br from-red-600 to-orange-500 rounded-xl shadow-lg flex items-center justify-center">
    <svg viewBox="0 0 48 48" className="w-10 h-10">
      <path d="M24 8L36 40H12L24 8z" fill="white" opacity="0.9"/>
      <path d="M24 16L31 36H17L24 16z" fill="#dc2626"/>
      <circle cx="24" cy="28" r="3" fill="white"/>
    </svg>
  </div>
);

const AutoCADIcon = () => (
  <div className="w-20 h-20 bg-gradient-to-br from-neutral-800 to-neutral-600 rounded-xl shadow-lg flex items-center justify-center">
    <svg viewBox="0 0 48 48" className="w-10 h-10">
      <polygon points="24,6 42,18 42,36 24,42 6,36 6,18" fill="none" stroke="white" strokeWidth="1.5" opacity="0.8"/>
      <polygon points="24,12 36,20 36,32 24,38 12,32 12,20" fill="none" stroke="#22d3ee" strokeWidth="1.5"/>
      <line x1="24" y1="12" x2="24" y2="38" stroke="#22d3ee" strokeWidth="0.8" opacity="0.5"/>
      <line x1="12" y1="20" x2="36" y2="32" stroke="#22d3ee" strokeWidth="0.8" opacity="0.5"/>
      <line x1="36" y1="20" x2="12" y2="32" stroke="#22d3ee" strokeWidth="0.8" opacity="0.5"/>
    </svg>
  </div>
);

const KasperskyIcon = () => (
  <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-400 rounded-xl shadow-lg flex items-center justify-center">
    <svg viewBox="0 0 48 48" className="w-10 h-10">
      <path d="M24 4C16 4 8 10 8 20C8 32 24 44 24 44C24 44 40 32 40 20C40 10 32 4 24 4z" fill="white" opacity="0.9"/>
      <path d="M24 10C18 10 14 14 14 20C14 28 24 38 24 38C24 38 34 28 34 20C34 14 30 10 24 10z" fill="#16a34a"/>
      <path d="M20 20L23 24L30 16" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>
);

const SketchUpIcon = () => (
  <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-xl shadow-lg flex items-center justify-center">
    <svg viewBox="0 0 48 48" className="w-10 h-10">
      <rect x="10" y="16" width="28" height="20" rx="2" fill="white" opacity="0.9"/>
      <polygon points="24,8 34,16 14,16" fill="white" opacity="0.85"/>
      <rect x="16" y="22" width="6" height="8" rx="1" fill="#dc2626"/>
      <rect x="26" y="22" width="6" height="8" rx="1" fill="#dc2626" opacity="0.7"/>
    </svg>
  </div>
);

const products: Product[] = [
  {
    name: "SketchUp – 3D Modeling",
    subtitle: "Agencies & Freelancers",
    price: "AED 1,281.70",
    priceRange: "AED 1,281.70 – AED 2,199.83",
    badge: "Popular",
    badgeColor: "bg-crimson/10 text-crimson",
    icon: <SketchUpIcon />,
    glbSrc: "/models/Product_Sketch_UP.glb",
    hoverLabel: "Official Partner",
    hoverAction: "Select Options",
    category: "Design",
    rating: 5,
  },
  {
    name: "Acrobat Pro DC",
    subtitle: "1 Year Subscription",
    price: "AED 450",
    icon: <AcrobatIcon />,
    hoverLabel: "Official Partner",
    hoverAction: "Add to Cart",
    category: "Design",
  },
  {
    name: "AutoCAD 2024",
    subtitle: "For Windows & Mac",
    price: "AED 2,100",
    icon: <AutoCADIcon />,
    hoverLabel: "Educational",
    hoverAction: "View Options",
    category: "Design",
  },
  {
    name: "Kaspersky Total",
    subtitle: "3 Devices • 1 Year",
    price: "AED 85",
    oldPrice: "AED 150",
    badge: "Sale",
    badgeColor: "bg-gold/10 text-gold-hover",
    icon: <KasperskyIcon />,
    hoverLabel: "Instant Delivery",
    hoverAction: "Add to Cart",
    category: "Security",
  },
];

const filters = ["All", "Office", "Security", "Design"];

const ProductGrid = () => {
  const [activeFilter, setActiveFilter] = useState("All");

  const filteredProducts = activeFilter === "All" ? products : products.filter((p) => p.category === activeFilter);

  return (
    <section className="section-light py-32">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex justify-between items-end mb-12">
          <h2 className="font-serif text-3xl text-[hsl(220_10%_4%)]">Bestselling Essentials</h2>
          <div className="hidden md:flex gap-6 text-sm">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`transition-all duration-300 ${
                  activeFilter === f
                    ? "text-[hsl(220_10%_4%)] font-medium border-b border-crimson pb-1"
                    : "text-[hsl(220_3%_52%)] hover:text-crimson"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 stagger-children">
          {filteredProducts.map((product) => (
            <AnimatedCard key={product.name} className="group relative">
              <div className="relative aspect-[3/4] bg-[hsl(40_25%_99%)] border border-[hsl(40_8%_88%)] rounded-md overflow-hidden mb-4 shadow-[0_1px_3px_hsl(0_0%_0%/0.04),0_4px_16px_hsl(0_0%_0%/0.03)] transition-all duration-500 group-hover:shadow-[0_2px_6px_hsl(0_0%_0%/0.06),0_12px_40px_hsl(0_0%_0%/0.08)]" style={{ perspective: "1000px" }}>
                {product.badge && (
                  <div className="absolute top-3 left-3 z-10">
                    <span className={`px-2 py-1 ${product.badgeColor} text-[10px] uppercase font-semibold tracking-[0.08em] rounded-sm`}>
                      {product.badge}
                    </span>
                  </div>
                )}
                {product.glbSrc ? (
                  <ProductModelViewer
                    glbSrc={product.glbSrc}
                    fallbackIcon={product.icon}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-8 bg-[hsl(40_12%_96%)] group-hover:bg-[hsl(40_25%_99%)] transition-colors duration-500">
                    <div className="product-3d-card">
                      {product.icon}
                      <div className="product-shine" />
                    </div>
                  </div>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 bg-[hsl(40_25%_99%)/0.92] backdrop-blur-lg border-t border-[hsl(40_8%_88%)] translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col gap-2 z-20">
                  <div className="flex items-center gap-2 text-[10px] text-[hsl(220_3%_52%)]">
                    <CheckCircle className="w-3 h-3 text-green-600" /> {product.hoverLabel}
                  </div>
                  <button className="btn-magnetic w-full py-2 bg-crimson text-[#FEFEFE] text-xs font-medium rounded-sm hover:bg-crimson-dark transition-all duration-300">
                    {product.hoverAction}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-[hsl(220_10%_4%)] text-sm mb-1 group-hover:underline decoration-crimson/30 underline-offset-4">{product.name}</h3>
                  <p className="text-[hsl(220_3%_52%)] text-xs">{product.subtitle}</p>
                  {product.rating && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {Array.from({ length: product.rating }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-gold text-gold" />
                      ))}
                    </div>
                  )}
                </div>
                {product.priceRange ? (
                  <span className="font-serif text-sm text-right whitespace-nowrap text-[hsl(220_10%_4%)]">{product.priceRange}</span>
                ) : product.oldPrice ? (
                  <div className="flex flex-col text-right">
                    <span className="font-serif text-sm text-crimson">{product.price}</span>
                    <span className="text-xs text-[hsl(220_3%_52%)] line-through">{product.oldPrice}</span>
                  </div>
                ) : (
                  <span className="font-serif text-sm text-[hsl(220_10%_4%)]">{product.price}</span>
                )}
              </div>
            </AnimatedCard>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
