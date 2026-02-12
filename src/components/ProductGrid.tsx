import { CheckCircle } from "lucide-react";
import { useState } from "react";

interface Product {
  name: string;
  subtitle: string;
  price: string;
  oldPrice?: string;
  badge?: string;
  badgeColor?: string;
  gradient: string;
  letter: string;
  hoverLabel: string;
  hoverAction: string;
  category: string;
}

const products: Product[] = [
  {
    name: "Office 2021 Pro Plus",
    subtitle: "For 1 PC • Lifetime",
    price: "AED 120",
    badge: "Best Value",
    badgeColor: "bg-stone-100 text-stone-600",
    gradient: "from-blue-500 to-cyan-400",
    letter: "O",
    hoverLabel: "Instant Delivery",
    hoverAction: "Add to Cart",
    category: "Office",
  },
  {
    name: "Acrobat Pro DC",
    subtitle: "1 Year Subscription",
    price: "AED 450",
    gradient: "from-red-600 to-orange-500",
    letter: "A",
    hoverLabel: "Official Partner",
    hoverAction: "Add to Cart",
    category: "Design",
  },
  {
    name: "AutoCAD 2024",
    subtitle: "For Windows & Mac",
    price: "AED 2,100",
    gradient: "bg-stone-800",
    letter: "A",
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
    gradient: "from-green-500 to-emerald-400",
    letter: "K",
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
              <div className="relative aspect-[3/4] bg-white border border-border rounded-sm overflow-hidden mb-4 shadow-sm transition-all duration-300 group-hover:shadow-lg">
                {product.badge && (
                  <div className="absolute top-3 left-3 z-10">
                    <span className={`px-2 py-1 ${product.badgeColor} text-[10px] uppercase font-bold tracking-wider rounded-sm`}>
                      {product.badge}
                    </span>
                  </div>
                )}
                <div className="w-full h-full flex items-center justify-center p-8 bg-stone-50 group-hover:bg-white transition-colors">
                  <div className={`w-20 h-20 ${product.gradient.startsWith("from-") ? `bg-gradient-to-tr ${product.gradient}` : product.gradient} rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-2xl`}>
                    {product.letter}
                  </div>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-x-0 bottom-0 p-4 bg-white/90 backdrop-blur border-t border-stone-100 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out flex flex-col gap-2">
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
