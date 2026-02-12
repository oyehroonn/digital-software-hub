import { CheckCircle } from "lucide-react";
import { useState } from "react";

interface Product {
  name: string;
  subtitle: string;
  price: string;
  oldPrice?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  hoverLabel: string;
  hoverAction: string;
  category: string;
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
  <div className="w-20 h-20 bg-gradient-to-br from-stone-800 to-stone-600 rounded-xl shadow-lg flex items-center justify-center">
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

const products: Product[] = [
  {
    name: "Office 2021 Pro Plus",
    subtitle: "For 1 PC • Lifetime",
    price: "AED 120",
    badge: "Best Value",
    badgeColor: "bg-stone-100 text-stone-600",
    icon: <OfficeIcon />,
    hoverLabel: "Instant Delivery",
    hoverAction: "Add to Cart",
    category: "Office",
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
    badgeColor: "bg-green-100 text-green-700",
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
    <section className="py-32 bg-background">
      <div className="max-w-[1600px] mx-auto px-6">
        <div className="flex justify-between items-end mb-12">
          <h2 className="font-serif text-3xl text-foreground">Bestselling Essentials</h2>
          <div className="hidden md:flex gap-6 text-sm">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`transition-colors ${
                  activeFilter === f
                    ? "text-foreground font-medium border-b border-foreground pb-1"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
          {filteredProducts.map((product) => (
            <div key={product.name} className="group relative">
              <div className="relative aspect-[3/4] bg-white border border-border rounded-sm overflow-hidden mb-4 shadow-sm transition-all duration-300 group-hover:shadow-lg" style={{ perspective: "1000px" }}>
                {product.badge && (
                  <div className="absolute top-3 left-3 z-10">
                    <span className={`px-2 py-1 ${product.badgeColor} text-[10px] uppercase font-bold tracking-wider rounded-sm`}>
                      {product.badge}
                    </span>
                  </div>
                )}
                <div className="w-full h-full flex items-center justify-center p-8 bg-stone-50 group-hover:bg-white transition-colors">
                  <div className="product-3d-card">
                    {product.icon}
                    {/* Shine overlay */}
                    <div className="product-shine" />
                  </div>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-white/90 backdrop-blur border-t border-stone-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out flex flex-col gap-2 z-20">
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <CheckCircle className="w-3 h-3 text-green-600" /> {product.hoverLabel}
                  </div>
                  <button className="w-full py-2 bg-foreground text-background text-xs font-medium rounded-sm hover:bg-cobalt transition-colors">
                    {product.hoverAction}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium text-foreground text-sm mb-1 group-hover:underline decoration-stone-300 underline-offset-4">{product.name}</h3>
                  <p className="text-muted-foreground text-xs">{product.subtitle}</p>
                </div>
                {product.oldPrice ? (
                  <div className="flex flex-col text-right">
                    <span className="font-serif text-sm text-red-600">{product.price}</span>
                    <span className="text-xs text-muted-foreground line-through">{product.oldPrice}</span>
                  </div>
                ) : (
                  <span className="font-serif text-sm">{product.price}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ProductGrid;
