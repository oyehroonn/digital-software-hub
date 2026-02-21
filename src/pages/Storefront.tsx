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
import { Filter, Grid, List, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

const BRANDS = ['Microsoft', 'Autodesk', 'Adobe'];

// Hierarchical category tree matching the real website
interface CategoryNode {
  name: string;
  filter: string; // value sent to API
  children?: CategoryNode[];
}

const CATEGORY_TREE: CategoryNode[] = [
  {
    name: 'Adobe', filter: 'Adobe',
  },
  {
    name: 'Autodesk', filter: 'Autodesk', children: [
      { name: 'Autodesk 2026', filter: 'Autodesk 2026' },
      { name: 'Autodesk 2025', filter: 'Autodesk 2025' },
      { name: 'Autodesk 2024', filter: 'Autodesk 2024' },
      { name: 'Autodesk 2023', filter: 'Autodesk 2023' },
      { name: 'Autodesk 2022', filter: 'Autodesk 2022' },
      { name: '3ds Max', filter: '3ds Max' },
      { name: 'AutoCAD', filter: 'AutoCAD' },
      { name: 'Civil 3D', filter: 'Civil 3D' },
      { name: 'Fusion 360', filter: 'Fusion 360' },
      { name: 'Inventor', filter: 'Inventor' },
      { name: 'Maya', filter: 'Maya' },
      { name: 'Navisworks', filter: 'Naviswork' },
      { name: 'Revit', filter: 'Revit' },
      { name: 'AEC Collection 2025', filter: 'AEC Collection 2025' },
      { name: 'Infodrainage', filter: 'Infodrainage' },
    ],
  },
  {
    name: 'Agencies & Freelancers Software', filter: 'Agencies & Freelancers Software',
  },
  {
    name: 'Architecture and Engineer', filter: 'Architecture and Engineer',
  },
  {
    name: 'Corporate IT Teams Software', filter: 'Corporate IT Teams Software',
  },
  {
    name: 'Dynamics 365', filter: 'Dynamics 365',
  },
  {
    name: 'Microsoft Office', filter: 'Microsoft Office', children: [
      { name: 'Microsoft Office 2013', filter: 'Microsoft Office 2013' },
      { name: 'Microsoft Office 2016', filter: 'Microsoft Office 2016' },
      { name: 'Microsoft Office 2019', filter: 'Microsoft Office 2019' },
      { name: 'Microsoft Office 2021', filter: 'Microsoft Office 2021' },
      { name: 'Microsoft Office 365', filter: 'Microsoft Office 365' },
      { name: 'Microsoft Office For MAC', filter: 'Microsoft Office For MAC' },
      { name: 'Microsoft Office 2024', filter: 'Microsoft Office 2024' },
    ],
  },
  {
    name: 'Microsoft Power BI', filter: 'Microsoft Power BI',
  },
  {
    name: 'Microsoft Project', filter: 'Microsoft Project', children: [
      { name: 'Microsoft Project 2024 Pro', filter: 'Microsoft Project 2024 Pro' },
    ],
  },
  {
    name: 'Microsoft Servers', filter: 'Microsoft Servers', children: [
      { name: 'Exchange Server', filter: 'Exchange Server' },
      { name: 'Share Point Server', filter: 'Share Point Server' },
      { name: 'SQL Server', filter: 'SQL Server' },
      { name: 'Windows Server 2012', filter: 'Windows Server 2012' },
      { name: 'Windows Server 2016', filter: 'Windows Server 2016' },
      { name: 'Windows Server 2019', filter: 'Windows Server 2019' },
      { name: 'Windows Server 2022', filter: 'Windows Server 2022' },
      { name: 'Windows Server 2025', filter: 'Windows Server 2025' },
    ],
  },
  {
    name: 'Microsoft Visio', filter: 'Microsoft Visio', children: [
      { name: 'Microsoft Visio 2024 Pro', filter: 'Microsoft Visio 2024 Pro' },
    ],
  },
  {
    name: 'Microsoft Volume Licensing', filter: 'Microsoft Volume Licensing',
  },
  {
    name: 'Office Applications', filter: 'Office Applications', children: [
      { name: 'Microsoft Project', filter: 'Microsoft Project' },
      { name: 'Microsoft Visio', filter: 'Microsoft Visio' },
      { name: 'Microsoft Visual Studio', filter: 'Microsoft Visual Studio' },
    ],
  },
  {
    name: 'SketchUp & V-Ray', filter: 'SketchUp & V-Ray',
  },
  {
    name: 'SQL Server', filter: 'SQL Server', children: [
      { name: 'SQL Server 2017', filter: 'SQL Server 2017' },
      { name: 'SQL Server 2019', filter: 'SQL Server 2019' },
      { name: 'SQL Server 2022', filter: 'SQL Server 2022' },
      { name: 'SQL Server 2025', filter: 'SQL Server 2025' },
    ],
  },
  {
    name: 'Small Business', filter: 'small business',
  },
  {
    name: 'Windows', filter: 'Windows', children: [
      { name: 'Microsoft Windows 10', filter: 'Microsoft Windows 10' },
      { name: 'Microsoft Windows 11', filter: 'Microsoft Windows 11' },
    ],
  },
];

const LICENSE_TYPES = ['Subscription', 'Lifetime', 'Variable', 'MAK', 'Device CAL'];
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
    <div className="min-h-screen bg-surface-dark">
      <Header />
      <main className="max-w-[1600px] mx-auto px-6 pt-24 pb-12">
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
                <SheetContent side="left" className="bg-surface-card border-theme">
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

// ── Collapsible Category Node ──
function CategoryFilterNode({
  node,
  filters,
  onFilterChange,
}: {
  node: CategoryNode;
  filters: string[];
  onFilterChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isChecked = filters.includes(node.filter);

  // Auto-expand if any child is checked
  const childChecked = hasChildren && node.children!.some((c) => filters.includes(c.filter));
  const isExpanded = expanded || childChecked;

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {hasChildren && (
          <button
            onClick={() => setExpanded(!isExpanded)}
            className="p-0.5 text-[#B1B2B3]/50 hover:text-[#FEFEFE] transition-colors"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
            />
          </button>
        )}
        <label
          className={`flex items-center gap-2 cursor-pointer group ${hasChildren ? '' : 'ml-[18px]'}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onFilterChange(node.filter)}
            className="w-3.5 h-3.5 rounded border-white/[0.06] bg-white/[0.02] text-crimson focus:ring-crimson/20"
          />
          <span className={`text-xs group-hover:text-[#FEFEFE] transition-colors ${isChecked ? 'text-[#FEFEFE] font-medium' : 'text-[#B1B2B3]'}`}>
            {node.name}
          </span>
        </label>
      </div>
      {hasChildren && isExpanded && (
        <div className="ml-5 mt-1 space-y-1 border-l border-white/[0.04] pl-3">
          {node.children!.map((child) => (
            <label
              key={child.filter}
              className="flex items-center gap-2 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={filters.includes(child.filter)}
                onChange={() => onFilterChange(child.filter)}
                className="w-3 h-3 rounded border-white/[0.06] bg-white/[0.02] text-crimson focus:ring-crimson/20"
              />
              <span className={`text-[11px] group-hover:text-[#FEFEFE] transition-colors ${filters.includes(child.filter) ? 'text-[#FEFEFE]' : 'text-[#B1B2B3]/80'}`}>
                {child.name}
              </span>
            </label>
          ))}
        </div>
      )}
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
              <span className={`text-sm group-hover:text-[#FEFEFE] transition-colors ${filters.brand.includes(brand) ? 'text-[#FEFEFE] font-medium' : 'text-[#B1B2B3]'}`}>
                {brand}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Product Categories — hierarchical tree */}
      <div>
        <h3 className="text-xs font-medium text-[#B1B2B3] uppercase tracking-wider mb-3">
          Product Categories
        </h3>
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
          {CATEGORY_TREE.map((node) => (
            <CategoryFilterNode
              key={node.filter}
              node={node}
              filters={filters.category}
              onFilterChange={(val) => onFilterChange('category', val)}
            />
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
              <span className={`text-sm group-hover:text-[#FEFEFE] transition-colors ${filters.licenseType.includes(license) ? 'text-[#FEFEFE] font-medium' : 'text-[#B1B2B3]'}`}>
                {license}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

