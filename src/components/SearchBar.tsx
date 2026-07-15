import { useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import type { SmartSearchResult } from '@/components/ai/SmartSearch';

// Smart Product Search (feature 03) is code-split; only the type is imported
// eagerly (types are erased at build). A layout-matched skeleton holds the space
// so the header doesn't shift while the small chunk loads.
const SmartSearch = lazy(() => import('@/components/ai/SmartSearch'));

interface SearchBarProps {
  className?: string;
  onProductSelect?: (result: SmartSearchResult) => void;
  darkText?: boolean;
}

/**
 * Global search bar — thin wrapper around the AI Smart Product Search (feature
 * 03). When the VPS API is healthy it returns live, AI-ranked results; when the
 * VPS is down it silently degrades to the bundled static index so search NEVER
 * breaks. Navigation stays inside the SPA (React Router + AppContext) instead of
 * a full page reload.
 */
export default function SearchBar({ className = '', onProductSelect, darkText = false }: SearchBarProps) {
  const { setSearchQuery, openProduct } = useApp();
  const navigate = useNavigate();

  const handleSelect = useCallback(
    (result: SmartSearchResult) => {
      if (onProductSelect) {
        onProductSelect(result);
        return;
      }
      // Open the product modal in-app (falls back gracefully if the VPS is down).
      void openProduct(result.id);
    },
    [onProductSelect, openProduct],
  );

  const handleSubmit = useCallback(
    (query: string) => {
      setSearchQuery(query);
      navigate('/store');
    },
    [setSearchQuery, navigate],
  );

  return (
    <Suspense
      fallback={
        <div
          className={`h-11 w-full animate-pulse rounded-full border border-white/10 bg-white/[0.04] ${className}`}
          aria-hidden="true"
        />
      }
    >
      <SmartSearch
        className={className}
        darkText={darkText}
        placeholder="Search products, brands, or tell us what you need…"
        onSelect={handleSelect}
        onSubmit={handleSubmit}
      />
    </Suspense>
  );
}
