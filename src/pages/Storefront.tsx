import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getProducts, Product } from '@/lib/api';
import { useApp } from '@/contexts/AppContext';
import SearchBar from '@/components/SearchBar';
import ProductCard from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Filter, Grid, List, ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const BRANDS = ['Microsoft', 'Adobe', 'Autodesk', 'Chaos', 'SketchUp', 'Kaspersky'];
const CATEGORIES = ['Office', 'CAD & Engineering', 'Design & Creativity', 'Operating Systems', 'Security & Utility'];
const LICENSE_TYPES = ['Subscription', 'Lifetime', 'MAK', 'Device CAL'];
const SORT_OPTIONS = [
  { value: 'popular', label: 'Popular' },
  { value: 'price-low', label: 'Price: Low to High' },
  { value: 'price-high', label: 'Price: High to Low' },
  { value: 'name', label: 'Name A-Z' },
];

export default function Storefront() {
  const { state, setFilters, setSortBy, openProduct } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Sync URL params with state
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId) {
      openProduct(productId);
    }
  }, [searchParams, openProduct]);

  // Fetch products
  useEffect(() => {
    setIsLoading(true);
    getProducts({
      page,
      limit: 20,
      sort: state.sortBy,
      brand: state.filters.brand,
      category: state.filters.category,
      licenseType: state.filters.licenseType,
      q: state.searchQuery,
    })
      .then((data) => {
        setProducts(data.products);
        setTotalPages(data.totalPages || 1);
      })
      .catch((error) => {
        console.error('Failed to load products:', error);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [page, state.sortBy, state.filters, state.searchQuery]);

  const handleFilterChange = (key: 'brand' | 'category' | 'licenseType', value: string) => {
    const current = state.filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setFilters({ [key]: updated });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ brand: [], category: [], licenseType: [] });
    setPage(1);
  };

  const hasActiveFilters =
    state.filters.brand.length > 0 ||
    state.filters.category.length > 0 ||
    state.filters.licenseType.length > 0;

  return (
    <div className="min-h-screen bg-[#060708]">
      <Header />
      <main className="max-w-[1600px] mx-auto px-6 py-12">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="font-serif text-4xl text-[#FEFEFE] mb-4">Store</h1>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <SearchBar className="flex-1 max-w-md" />
            <div className="flex items-center gap-3">
              {/* View Mode Toggle (Desktop only) */}
              <div className="hidden md:flex items-center gap-1 bg-white/[0.02] border border-white/[0.06] rounded-sm p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-sm transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-crimson/20 text-crimson'
                      : 'text-[#B1B2B3] hover:text-[#FEFEFE]'
                  }`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-sm transition-colors ${
                    viewMode === 'list'
                      ? 'bg-crimson/20 text-crimson'
                      : 'text-[#B1B2B3] hover:text-[#FEFEFE]'
                  }`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>

              {/* Sort */}
              <Select value={state.sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40 bg-white/[0.02] border-white/[0.06] text-[#FEFEFE]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filter Button (Mobile) */}
              <Sheet open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    className="md:hidden border-white/[0.06] text-[#FEFEFE]"
                  >
                    <Filter className="w-4 h-4 mr-2" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="bg-[#0a0b0d] border-white/[0.06]">
                  <FilterPanel
                    filters={state.filters}
                    onFilterChange={handleFilterChange}
                    onClear={clearFilters}
                    hasActiveFilters={hasActiveFilters}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar Filters (Desktop) */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <FilterPanel
              filters={state.filters}
              onFilterChange={handleFilterChange}
              onClear={clearFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </aside>

          {/* Products Grid/List */}
          <div className="flex-1">
            {/* Active Filters */}
            {hasActiveFilters && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <span className="text-xs text-[#B1B2B3] uppercase tracking-wider">Active:</span>
                {state.filters.brand.map((b) => (
                  <Badge
                    key={b}
                    className="bg-crimson/10 text-crimson border-crimson/20 cursor-pointer"
                    onClick={() => handleFilterChange('brand', b)}
                  >
                    {b} ×
                  </Badge>
                ))}
                {state.filters.category.map((c) => (
                  <Badge
                    key={c}
                    className="bg-gold/10 text-gold border-gold/20 cursor-pointer"
                    onClick={() => handleFilterChange('category', c)}
                  >
                    {c} ×
                  </Badge>
                ))}
                {state.filters.licenseType.map((l) => (
                  <Badge
                    key={l}
                    className="bg-azure/10 text-azure border-azure/20 cursor-pointer"
                    onClick={() => handleFilterChange('licenseType', l)}
                  >
                    {l} ×
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs text-[#B1B2B3] hover:text-[#FEFEFE]"
                >
                  Clear all
                </Button>
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] bg-white/[0.02] border border-white/[0.06] rounded-md animate-pulse"
                  />
                ))}
              </div>
            )}

            {/* Products */}
            {!isLoading && (
              <>
                {products.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-[#B1B2B3] mb-4">No products found</p>
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="border-white/[0.06] text-[#FEFEFE]"
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <>
                    <div
                      className={
                        viewMode === 'grid'
                          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                          : 'space-y-4'
                      }
                    >
                      {products.map((product) => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          viewMode={viewMode}
                          onClick={() => openProduct(product)}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-center gap-2 mt-12">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1}
                          className="border-white/[0.06] text-[#FEFEFE]"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-sm text-[#B1B2B3] px-4">
                          Page {page} of {totalPages}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          disabled={page === totalPages}
                          className="border-white/[0.06] text-[#FEFEFE]"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

// Filter Panel Component
function FilterPanel({
  filters,
  onFilterChange,
  onClear,
  hasActiveFilters,
}: {
  filters: { brand: string[]; category: string[]; licenseType: string[] };
  onFilterChange: (key: 'brand' | 'category' | 'licenseType', value: string) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-[#FEFEFE] uppercase tracking-wider">Filters</h2>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs text-[#B1B2B3] hover:text-[#FEFEFE]"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Brand */}
      <div>
        <h3 className="text-xs font-medium text-[#B1B2B3] uppercase tracking-wider mb-3">Brand</h3>
        <div className="space-y-2">
          {BRANDS.map((brand) => (
            <label
              key={brand}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.brand.includes(brand)}
                onChange={() => onFilterChange('brand', brand)}
                className="w-4 h-4 rounded border-white/[0.06] bg-white/[0.02] text-crimson focus:ring-crimson/20"
              />
              <span className="text-sm text-[#B1B2B3] group-hover:text-[#FEFEFE] transition-colors">
                {brand}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <h3 className="text-xs font-medium text-[#B1B2B3] uppercase tracking-wider mb-3">
          Category
        </h3>
        <div className="space-y-2">
          {CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.category.includes(category)}
                onChange={() => onFilterChange('category', category)}
                className="w-4 h-4 rounded border-white/[0.06] bg-white/[0.02] text-crimson focus:ring-crimson/20"
              />
              <span className="text-sm text-[#B1B2B3] group-hover:text-[#FEFEFE] transition-colors">
                {category}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* License Type */}
      <div>
        <h3 className="text-xs font-medium text-[#B1B2B3] uppercase tracking-wider mb-3">
          License Type
        </h3>
        <div className="space-y-2">
          {LICENSE_TYPES.map((license) => (
            <label
              key={license}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.licenseType.includes(license)}
                onChange={() => onFilterChange('licenseType', license)}
                className="w-4 h-4 rounded border-white/[0.06] bg-white/[0.02] text-crimson focus:ring-crimson/20"
              />
              <span className="text-sm text-[#B1B2B3] group-hover:text-[#FEFEFE] transition-colors">
                {license}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

