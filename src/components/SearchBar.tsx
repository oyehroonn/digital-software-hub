import { Search, Sparkles, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { searchProducts, aiSearch, Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';

interface SearchBarProps {
  className?: string;
  onProductSelect?: (product: Product) => void;
}

export default function SearchBar({ className = '', onProductSelect }: SearchBarProps) {
  const { setSearchQuery, openProduct } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAISearch, setIsAISearch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setProductResults([]);
      setIsOpen(false);
      return;
    }

    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        // Try AI search first
        const aiResult = await aiSearch(query);
        setIsAISearch(true);
        setSuggestions(aiResult.suggestions || []);
        
        // Also do normal search for product results
        const searchResult = await searchProducts(query);
        setProductResults(searchResult.products.slice(0, 5));
        setSuggestions(prev => [...prev, ...searchResult.suggestions].slice(0, 8));
        
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
        // Fallback to normal search
        try {
          const searchResult = await searchProducts(query);
          setIsAISearch(false);
          setProductResults(searchResult.products.slice(0, 5));
          setSuggestions(searchResult.suggestions.slice(0, 8));
          setIsOpen(true);
        } catch (e) {
          console.error('Fallback search error:', e);
        }
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setSearchQuery(query);
    navigate('/store');
    setIsOpen(false);
  };

  const handleProductClick = (product: Product) => {
    if (onProductSelect) {
      onProductSelect(product);
    } else {
      openProduct(product);
    }
    setIsOpen(false);
    setQuery('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setSearchQuery(suggestion);
    navigate('/store');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B1B2B3]/50" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim() && setIsOpen(true)}
          placeholder="Search products, brands, or ask AI..."
          className="w-full pl-10 pr-10 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-sm text-sm text-[#FEFEFE] placeholder:text-[#B1B2B3]/50 focus:outline-none focus:border-crimson/50 focus:bg-white/[0.04] transition-all"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crimson animate-spin" />
        )}
        {!isLoading && query.trim() && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B1B2B3]/50 hover:text-[#FEFEFE]"
          >
            ×
          </button>
        )}
      </form>

      {/* Suggestions Popover */}
      {isOpen && (suggestions.length > 0 || productResults.length > 0) && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a0b0d] border border-white/[0.06] rounded-lg shadow-premium-lg z-50 max-h-96 overflow-y-auto">
          {/* AI Suggestions */}
          {isAISearch && suggestions.length > 0 && (
            <div className="p-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-crimson" />
                <span className="text-xs font-medium text-[#FEFEFE] uppercase tracking-wider">
                  AI Suggestions
                </span>
              </div>
              <div className="space-y-1">
                {suggestions.slice(0, 3).map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 text-sm text-[#B1B2B3] hover:bg-white/[0.04] hover:text-[#FEFEFE] rounded-sm transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Results */}
          {productResults.length > 0 && (
            <div className="p-3">
              <div className="text-xs font-medium text-[#B1B2B3]/70 uppercase tracking-wider mb-2 px-2">
                Products
              </div>
              <div className="space-y-1">
                {productResults.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="w-full text-left px-3 py-2 hover:bg-white/[0.04] rounded-sm transition-colors group"
                  >
                    <div className="text-sm text-[#FEFEFE] group-hover:text-crimson transition-colors">
                      {product.name}
                    </div>
                    <div className="text-xs text-[#B1B2B3]/50 mt-0.5">
                      {product.brand} • {product.category}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Regular Suggestions */}
          {!isAISearch && suggestions.length > 0 && (
            <div className="p-3 border-t border-white/[0.06]">
              <div className="text-xs font-medium text-[#B1B2B3]/70 uppercase tracking-wider mb-2 px-2">
                Suggestions
              </div>
              <div className="space-y-1">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full text-left px-3 py-2 text-sm text-[#B1B2B3] hover:bg-white/[0.04] hover:text-[#FEFEFE] rounded-sm transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

