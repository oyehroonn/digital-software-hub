import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { Product } from '@/lib/api';

interface AppState {
  selectedProduct: Product | null;
  cartItems: CartItem[];
  searchQuery: string;
  filters: {
    brand: string[];
    category: string[];
    licenseType: string[];
  };
  sortBy: string;
  marketingMode: boolean;
  theme: 'light' | 'dark';
}

export interface CartItem {
  id: string | number;
  name: string;
  price: string;
  unitPrice: number;
  quantity: number;
  category?: string;
  brand?: string;
  licenseType?: string;
  glbSrc: string;
}

type CartInputItem = {
  id: string | number;
  name: string;
  price: string;
  category?: string;
  brand?: string;
  licenseType?: string;
  glbSrc?: string;
  link?: string;
};

interface AppContextType {
  state: AppState;
  openProduct: (product: Product | string | number) => Promise<void>;
  closeProduct: () => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<AppState['filters']>) => void;
  setSortBy: (sort: string) => void;
  addToCart: (item: CartInputItem) => void;
  removeFromCart: (productId: string | number) => void;
  updateCartQuantity: (productId: string | number, quantity: number) => void;
  clearCart: () => void;
  cartItemCount: number;
  cartTotal: number;
  applyAIAction: (action: { type: string; payload: any }) => void;
  setMarketingMode: (enabled: boolean) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setNavigate: (navigateFn: (path: string) => void) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const navigateRef = useRef<((path: string) => void) | null>(null);
  
  // Load preferences from localStorage
  const loadPreferences = useCallback(() => {
    try {
      const saved = localStorage.getItem('dsm-preferences');
      if (saved) {
        const prefs = JSON.parse(saved);
        return {
          marketingMode: prefs.marketingMode !== false, // default true
          theme: prefs.theme || 'dark', // default dark
        };
      }
    } catch (e) {
      // Ignore parse errors
    }
    return {
      marketingMode: true,
      theme: 'dark' as const,
    };
  }, []);

  const preferences = loadPreferences();

  const loadCart = useCallback((): CartItem[] => {
    try {
      const saved = localStorage.getItem('dsm-cart');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      // Ignore parse errors
    }
    return [];
  }, []);

  const [state, setState] = useState<AppState>({
    selectedProduct: null,
    cartItems: loadCart(),
    searchQuery: '',
    filters: {
      brand: [],
      category: [],
      licenseType: [],
    },
    sortBy: 'popular',
    marketingMode: preferences.marketingMode,
    theme: preferences.theme,
  });

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [state.theme]);

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem('dsm-preferences', JSON.stringify({
      marketingMode: state.marketingMode,
      theme: state.theme,
    }));
  }, [state.marketingMode, state.theme]);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('dsm-cart', JSON.stringify(state.cartItems));
  }, [state.cartItems]);

  const parsePriceToNumber = useCallback((priceText: string): number => {
    const clean = priceText.replace(/,/g, '');
    const match = clean.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const parsed = Number.parseFloat(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  }, []);

  const addToCart = useCallback((item: CartInputItem) => {
    setState(prev => {
      const existingIdx = prev.cartItems.findIndex(p => String(p.id) === String(item.id));
      if (existingIdx >= 0) {
        const updated = [...prev.cartItems];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + 1,
        };
        return { ...prev, cartItems: updated };
      }

      const nextItem: CartItem = {
        id: item.id,
        name: item.name,
        price: item.price,
        unitPrice: parsePriceToNumber(item.price),
        quantity: 1,
        category: item.category,
        brand: item.brand,
        licenseType: item.licenseType,
        glbSrc: item.glbSrc || item.link || `/models/${item.id}.glb`,
      };

      return { ...prev, cartItems: [...prev.cartItems, nextItem] };
    });
  }, [parsePriceToNumber]);

  const removeFromCart = useCallback((productId: string | number) => {
    setState(prev => ({
      ...prev,
      cartItems: prev.cartItems.filter(item => String(item.id) !== String(productId)),
    }));
  }, []);

  const updateCartQuantity = useCallback((productId: string | number, quantity: number) => {
    setState(prev => ({
      ...prev,
      cartItems: prev.cartItems
        .map(item =>
          String(item.id) === String(productId)
            ? { ...item, quantity: Math.max(1, quantity) }
            : item
        ),
    }));
  }, []);

  const clearCart = useCallback(() => {
    setState(prev => ({ ...prev, cartItems: [] }));
  }, []);

  const cartItemCount = state.cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = state.cartItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

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

  // Set navigate function from a component that has router context
  const setNavigate = useCallback((navigateFn: (path: string) => void) => {
    navigateRef.current = navigateFn;
  }, []);

  const applyAIAction = useCallback((action: { type: string; payload: any }) => {
    switch (action.type) {
      case 'OPEN_PRODUCT':
        openProduct(action.payload.productId);
        break;
      case 'NAVIGATE':
        // Navigate using React Router to avoid page reload
        const path = action.payload.path || '/';
        try {
          if (navigateRef.current) {
            // Use React Router navigate (no page reload)
            navigateRef.current(path.startsWith('/') ? path : '/' + path);
          } else {
            // Fallback to window.location only if navigate is not available
            console.warn('Navigate function not available, using window.location');
            window.location.href = path.startsWith('/') ? path : '/' + path;
          }
        } catch (error) {
          console.error('Navigation error:', error);
        }
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

  const setMarketingMode = useCallback((enabled: boolean) => {
    setState(prev => ({ ...prev, marketingMode: enabled }));
  }, []);

  const setTheme = useCallback((theme: 'light' | 'dark') => {
    setState(prev => ({ ...prev, theme }));
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        openProduct,
        closeProduct,
        setSearchQuery,
        setFilters,
        setSortBy,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartItemCount,
        cartTotal,
        applyAIAction,
        setMarketingMode,
        setTheme,
        setNavigate,
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

