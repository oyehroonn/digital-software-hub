import { CheckCircle, Star } from 'lucide-react';
import { Product } from '@/lib/api';
import ProductModelViewer from './ProductModelViewer';
import { Badge } from './ui/badge';

interface ProductCardProps {
  product: Product;
  viewMode?: 'grid' | 'list';
  onClick?: () => void;
}

export default function ProductCard({ product, viewMode = 'grid', onClick }: ProductCardProps) {
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
          <div className="text-right">
            <div className="font-serif text-lg text-[#FEFEFE] mb-1">{product.price}</div>
            <div className="text-xs text-[#B1B2B3]/50">{product.licenseType}</div>
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

        {/* Hover Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#060708]/95 via-[#060708]/80 to-transparent translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out flex flex-col gap-2 z-20">
          <div className="flex items-center gap-2 text-[10px] text-[#B1B2B3]/70">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Official Partner</span>
          </div>
          <button className="btn-magnetic w-full py-2 bg-crimson text-[#FEFEFE] text-xs font-medium rounded-sm hover:bg-crimson-dark transition-all duration-300">
            View Details
          </button>
        </div>
      </div>

      {/* Product Info */}
      <div className="space-y-1">
        <h3 className="font-medium text-foreground text-sm mb-1 group-hover:text-crimson transition-colors line-clamp-2">
          {product.name}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-1">{product.description}</p>
        <div className="flex items-center justify-between mt-2">
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            {product.category}
          </Badge>
          <span className="font-serif text-sm text-foreground">{product.price}</span>
        </div>
      </div>
    </div>
  );
}

