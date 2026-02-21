import { ArrowRight, CheckCircle, Search, X } from "lucide-react";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ProductModelViewer from "./ProductModelViewer";
import { useApp } from "@/contexts/AppContext";
import { getProducts, Product } from "@/lib/api";

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

const ProductCard = ({ product, onClick }: { product: Product; onClick: () => void }) => {
  return (
    <div className="group relative cursor-pointer" onClick={onClick}>
      <div 
        className="relative aspect-[3/4] bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden mb-4 transition-all duration-500 group-hover:border-crimson/30 group-hover:bg-white/[0.04] group-hover:shadow-[0_0_40px_rgba(200,50,50,0.08)]"
        style={{ perspective: "1000px" }}
      >
        <div className="absolute top-3 left-3 z-10">
          <span className="px-2.5 py-1 bg-crimson/20 text-crimson text-[10px] uppercase font-semibold tracking-[0.08em] rounded-sm backdrop-blur-sm">
            {product.brand}
          </span>
        </div>

        {product.link ? (
          <ProductModelViewer
            glbSrc={product.link}
            fallbackIcon={
              <div className="w-20 h-20 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                <span className="text-2xl font-bold text-[#FEFEFE]/20">{product.name.charAt(0)}</span>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="w-20 h-20 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-2xl font-bold text-[#FEFEFE]/20">{product.name.charAt(0)}</span>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#060708]/95 via-[#060708]/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col gap-3 z-20">
          <div className="flex items-center gap-2 text-[10px] text-[#B1B2B3]/70">
            <CheckCircle className="w-3 h-3 text-emerald-500" /> Official Partner
          </div>
          <button className="btn-magnetic w-full py-2.5 bg-crimson text-[#FEFEFE] text-xs font-medium tracking-wide rounded-sm hover:bg-crimson-dark transition-all duration-300">
            View Details
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-[#FEFEFE] text-sm mb-1 truncate group-hover:text-crimson transition-colors duration-300">
              {product.name}
            </h3>
            <p className="text-[#B1B2B3]/50 text-[11px] uppercase tracking-[0.1em] truncate">{product.category}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-end">
          <span className="font-serif text-sm text-[#FEFEFE]">{product.price}</span>
        </div>
      </div>
    </div>
  );
};

const PRODUCTS_PER_PAGE = 8;

const PopularProducts = () => {
  const headingAnim = useScrollAnimation();
  const navigate = useNavigate();
  const { openProduct } = useApp();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PRODUCTS_PER_PAGE);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    getProducts({ limit: 200 })
      .then((data) => setAllProducts(data.products))
      .catch((err) => console.error("Failed to load products:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return allProducts;
    const query = searchQuery.toLowerCase();
    return allProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.brand.toLowerCase().includes(query)
    );
  }, [searchQuery, allProducts]);

  const displayedProducts = filteredProducts.slice(0, visibleCount);
  const remainingCount = filteredProducts.length - visibleCount;
  const canShowMore = visibleCount < filteredProducts.length;
  const canShowLess = visibleCount > PRODUCTS_PER_PAGE;

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + PRODUCTS_PER_PAGE, filteredProducts.length));
  };

  const handleShowLess = () => {
    setVisibleCount((prev) => Math.max(prev - PRODUCTS_PER_PAGE, PRODUCTS_PER_PAGE));
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setVisibleCount(PRODUCTS_PER_PAGE);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setVisibleCount(PRODUCTS_PER_PAGE);
  };

  return (
    <section className="py-32 bg-surface-dark relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 section-divider-red" />

      <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.04) 0%, transparent 70%)" }} />
      <div className="absolute top-1/3 left-0 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, hsl(4 65% 54% / 0.02) 0%, transparent 70%)" }} />

      <div className="max-w-[1600px] mx-auto px-6 relative z-10">
        <div ref={headingAnim.ref} className={`flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 ${headingAnim.className}`}>
          <div>
            <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-4">
              Browse Our Collection
            </span>
            <h2 className="font-serif text-4xl md:text-5xl text-[#FEFEFE] tracking-tight">
              Product Catalogue
            </h2>
          </div>
          <button
            onClick={() => navigate('/store')}
            className="inline-flex items-center gap-2 text-xs font-medium text-[#B1B2B3]/50 uppercase tracking-[0.12em] border-b border-white/[0.06] pb-1 hover:text-crimson hover:border-crimson transition-all duration-300 group"
          >
            View Full Catalog
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-10">
          <div className="relative max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B2B3]/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search products..."
              className="w-full pl-11 pr-10 py-3 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/40 focus:outline-none focus:border-crimson/50 focus:bg-white/[0.05] transition-all"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B1B2B3]/50 hover:text-[#FEFEFE] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-3 text-xs text-[#B1B2B3]/60">
              Found {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} matching "{searchQuery}"
            </p>
          )}
        </div>

        {/* Product Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[3/4] bg-white/[0.04] rounded-lg mb-4" />
                <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-2" />
                <div className="h-3 bg-white/[0.04] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : displayedProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-10 stagger-children">
            {displayedProducts.map((product) => (
              <AnimatedCard key={product.id}>
                <ProductCard
                  product={product}
                  onClick={() => openProduct(String(product.id))}
                />
              </AnimatedCard>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-[#B1B2B3]/60 text-sm">No products found matching your search.</p>
          </div>
        )}

        {/* Show More / Show Less */}
        {filteredProducts.length > PRODUCTS_PER_PAGE && (
          <div className="mt-16 flex flex-col items-center gap-4">
            {canShowMore && (
              <button
                onClick={handleShowMore}
                className="btn-magnetic px-8 py-3 bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-[#B1B2B3]/60 uppercase tracking-[0.14em] rounded-sm hover:bg-crimson/[0.06] hover:border-crimson/20 hover:text-crimson transition-all duration-400"
              >
                Show More ({remainingCount} remaining)
              </button>
            )}
            {canShowLess && (
              <button
                onClick={handleShowLess}
                className="group inline-flex items-center gap-2 text-xs font-medium text-[#B1B2B3]/50 uppercase tracking-[0.12em] hover:text-crimson transition-all duration-300"
              >
                <span className="w-8 h-px bg-white/[0.1] group-hover:bg-crimson/40 transition-colors duration-300" />
                Show Less
                <span className="w-8 h-px bg-white/[0.1] group-hover:bg-crimson/40 transition-colors duration-300" />
              </button>
            )}
          </div>
        )}

        {/* Product Count */}
        <div className="mt-8 text-center">
          <p className="text-[10px] text-[#B1B2B3]/40 uppercase tracking-[0.1em]">
            Showing {displayedProducts.length} of {filteredProducts.length} products
          </p>
        </div>
      </div>
    </section>
  );
};

export default PopularProducts;
