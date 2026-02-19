import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Product } from '@/lib/api';

interface AppState {
  selectedProduct: Product | null;
  searchQuery: string;
  filters: {
    brand: string[];
    category: string[];
    licenseType: string[];
  };
  sortBy: string;
}

interface AppContextType {
  state: AppState;
  openProduct: (product: Product | string | number) => Promise<void>;
  closeProduct: () => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<AppState['filters']>) => void;
  setSortBy: (sort: string) => void;
  applyAIAction: (action: { type: string; payload: any }) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    selectedProduct: null,
    searchQuery: '',
    filters: {
      brand: [],
      category: [],
      licenseType: [],
    },
    sortBy: 'popular',
  });

  const openProduct = useCallback(async (product: Product | string | number) => {
    if (typeof product === 'object') {
      setState(prev => ({ ...prev, selectedProduct: product }));
      // Update URL
      const url = new URL(window.location.href);
      url.searchParams.set('product', String(product.id));
      window.history.pushState({}, '', url);
    } else {
      // Fetch product by ID
      try {
        const { getProductById } = await import('@/lib/api');
        const p = await getProductById(product);
        setState(prev => ({ ...prev, selectedProduct: p }));
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set('product', String(product));
        window.history.pushState({}, '', url);
      } catch (error) {
        console.error('Failed to load product:', error);
      }
    }
  }, []);

  const closeProduct = useCallback(() => {
    setState(prev => ({ ...prev, selectedProduct: null }));
    // Update URL without product param
    const url = new URL(window.location.href);
    url.searchParams.delete('product');
    window.history.replaceState({}, '', url);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState(prev => ({ ...prev, searchQuery: query }));
  }, []);

  const setFilters = useCallback((newFilters: Partial<AppState['filters']>) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, ...newFilters },
    }));
  }, []);

  const setSortBy = useCallback((sort: string) => {
    setState(prev => ({ ...prev, sortBy: sort }));
  }, []);

  const applyAIAction = useCallback((action: { type: string; payload: any }) => {
    switch (action.type) {
      case 'OPEN_PRODUCT':
        openProduct(action.payload.productId);
        break;
      case 'NAVIGATE':
        window.location.href = action.payload.path;
        break;
      case 'APPLY_FILTERS':
        setFilters(action.payload);
        break;
      case 'SET_SEARCH':
        setSearchQuery(action.payload.query);
        break;
      case 'SCROLL_TO':
        const el = document.getElementById(action.payload.anchorId);
        el?.scrollIntoView({ behavior: 'smooth' });
        break;
    }
  }, [openProduct, setFilters, setSearchQuery]);

  return (
    <AppContext.Provider
      value={{
        state,
        openProduct,
        closeProduct,
        setSearchQuery,
        setFilters,
        setSortBy,
        applyAIAction,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}

