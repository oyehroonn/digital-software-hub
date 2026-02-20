import { CheckCircle, Star, Sparkles } from 'lucide-react';
import { Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import ProductModelViewer from './ProductModelViewer';
import { Badge } from './ui/badge';

interface ProductCardProps {
  product: Product;
  viewMode?: 'grid' | 'list';
  onClick?: () => void;
}

export default function ProductCard({ product, viewMode = 'grid', onClick }: ProductCardProps) {
  const { openProductAIChat } = useApp();

  const handleAIClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openProductAIChat(product);
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className="group flex gap-4 p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:border-crimson/30 hover:bg-white/[0.04] transition-all cursor-pointer"
      >
        {/* Image/Model */}
        <div className="w-32 h-32 flex-shrink-0 rounded-md overflow-hidden bg-secondary">
          {product.link ? (
            <ProductModelViewer
              glbSrc={product.link}
              fallbackIcon={
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-2xl font-serif text-[#FEFEFE]/30">
                    {product.name.charAt(0)}
                  </span>
                </div>
              }
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-2xl font-serif text-[#FEFEFE]/30">{product.name.charAt(0)}</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="text-[10px] uppercase">
                {product.brand}
              </Badge>
              <Badge className="bg-crimson/10 text-crimson text-[10px]">{product.category}</Badge>
            </div>
            <h3 className="font-medium text-[#FEFEFE] text-sm mb-1 group-hover:text-crimson transition-colors">
              {product.name}
            </h3>
            <p className="text-xs text-[#B1B2B3]/70 mb-2">{product.description}</p>
            <div className="flex items-center gap-2 text-[10px] text-[#B1B2B3]">
              <CheckCircle className="w-3 h-3 text-emerald-500" />
              <span>Official Partner</span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-2">
            <div className="font-serif text-lg text-[#FEFEFE] mb-1">{product.price}</div>
            <div className="text-xs text-[#B1B2B3]/50">{product.licenseType}</div>
            <button
              onClick={handleAIClick}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-crimson/10 text-crimson border border-crimson/20 rounded-full hover:bg-crimson/20 transition-all"
              title="Ask AI about this product"
            >
              <Sparkles className="w-3 h-3" />
              Ask AI
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      onClick={onClick}
      className="group relative cursor-pointer"
    >
      <div className="relative aspect-[3/4] bg-white/[0.02] border border-white/[0.06] rounded-md overflow-hidden mb-4 shadow-[0_1px_3px_hsl(0_0%_0%/0.04),0_4px_16px_hsl(0_0%_0%/0.03)] transition-all duration-500 group-hover:shadow-[0_2px_6px_hsl(0_0%_0%/0.06),0_12px_40px_hsl(0_0%_0%/0.08)] group-hover:border-crimson/30">
        {/* Badges */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
          <Badge className="bg-crimson/10 text-crimson text-[10px] uppercase">
            {product.brand}
          </Badge>
        </div>

        {/* 3D Model */}
        {product.link ? (
          <ProductModelViewer
            glbSrc={product.link}
            fallbackIcon={
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-20 h-20 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                  <span className="text-2xl font-serif text-[#FEFEFE]/30">
                    {product.name.charAt(0)}
                  </span>
                </div>
              </div>
            }
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-secondary">
            <div className="w-20 h-20 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <span className="text-2xl font-serif text-[#FEFEFE]/30">{product.name.charAt(0)}</span>
            </div>
          </div>
        )}

        {/* AI Button (top-right, always visible on hover) */}
        <button
          onClick={handleAIClick}
          className="absolute top-3 right-3 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-crimson/80 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-crimson hover:scale-110 shadow-lg"
          title="Ask AI about this product"
        >
          <Sparkles className="w-3.5 h-3.5" />
        </button>

        {/* Hover Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#060708]/95 via-[#060708]/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col gap-2 z-20">
          <div className="flex items-center gap-2 text-[10px] text-[#B1B2B3]/70">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Official Partner</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-magnetic flex-1 py-2 bg-crimson text-[#FEFEFE] text-xs font-medium rounded-sm hover:bg-crimson-dark transition-all duration-300">
              View Details
            </button>
            <button
              onClick={handleAIClick}
              className="py-2 px-3 bg-white/[0.06] border border-white/[0.1] text-[#FEFEFE] text-xs font-medium rounded-sm hover:bg-crimson/20 hover:border-crimson/30 transition-all duration-300 flex items-center gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              AI
            </button>
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="space-y-1">
        <h3 className="font-medium text-[#FEFEFE] text-sm mb-1 group-hover:text-crimson transition-colors line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xs text-[#B1B2B3]/70 line-clamp-1">{product.description}</p>
        <div className="flex items-center justify-between mt-2">
          <Badge variant="outline" className="text-[10px] text-[#B1B2B3]">
            {product.category}
          </Badge>
          <span className="font-serif text-sm text-[#FEFEFE]">{product.price}</span>
        </div>
      </div>
    </div>
  );
}

