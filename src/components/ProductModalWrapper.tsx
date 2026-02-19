import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import ProductModal from './ProductModal';

export default function ProductModalWrapper() {
  const { state, openProduct } = useApp();
  const [searchParams] = useSearchParams();

  // Handle deep-linking for product modal
  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId && (!state.selectedProduct || String(state.selectedProduct.id) !== productId)) {
      openProduct(productId);
    } else if (!productId && state.selectedProduct) {
      // If URL doesn't have product param but modal is open, sync it
      const url = new URL(window.location.href);
      url.searchParams.set('product', String(state.selectedProduct.id));
      window.history.replaceState({}, '', url);
    }
  }, [searchParams, state.selectedProduct, openProduct]);

  if (!state.selectedProduct) return null;

  return <ProductModal product={state.selectedProduct} />;
}

