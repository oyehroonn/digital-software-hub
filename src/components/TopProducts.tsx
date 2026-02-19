import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTopProducts, Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import ProductCard from './ProductCard';
import { Button } from './ui/button';
import { ArrowRight } from 'lucide-react';
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

const AnimatedCard = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const { ref, className: animClass } = useScrollAnimation();
  return <div ref={ref} className={`${animClass} ${className ?? ""}`}>{children}</div>;
};

export default function TopProducts() {
  const { openProduct } = useApp();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const headingAnim = useScrollAnimation();

  useEffect(() => {
    getTopProducts(10)
      .then((data) => {
        setProducts(data.products);
      })
      .catch((error) => {
        console.error('Failed to load top products:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  return (
    <section className="section-light py-32">
      <div className="max-w-[1600px] mx-auto px-6">
        <div ref={headingAnim.ref} className={`flex justify-between items-end mb-12 ${headingAnim.className}`}>
          <div>
            <span className="inline-block text-[10px] font-semibold text-crimson uppercase tracking-[0.2em] mb-4">
              Curated Selection
            </span>
            <h2 className="font-serif text-3xl md:text-4xl text-[hsl(220_10%_4%)]">
              Top Products
            </h2>
          </div>
          <Button
            onClick={() => navigate('/store')}
            variant="outline"
            className="hidden md:flex items-center gap-2 border-[hsl(40_8%_88%)] text-[hsl(220_10%_4%)] hover:bg-crimson hover:text-[#FEFEFE] hover:border-crimson transition-all"
          >
            View More
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[3/4] bg-[hsl(40_25%_99%)] border border-[hsl(40_8%_88%)] rounded-md animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 stagger-children">
              {products.map((product) => (
                <AnimatedCard key={product.id}>
                  <ProductCard
                    product={product}
                    onClick={() => openProduct(product)}
                  />
                </AnimatedCard>
              ))}
            </div>

            {/* Mobile View More Button */}
            <div className="mt-12 text-center md:hidden">
              <Button
                onClick={() => navigate('/store')}
                className="bg-crimson hover:bg-crimson-dark text-[#FEFEFE]"
              >
                View More Products
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

