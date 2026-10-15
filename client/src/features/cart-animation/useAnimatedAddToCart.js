import { useCallback } from 'react';
import { useFlyToCart } from './useFlyToCart';
import { useStore } from '../../hooks/useStore';
import { getProductMainImage } from '../../utils/productImages';
import { isValidRect } from './flyToCartGeometry';

export function useAnimatedAddToCart() {
  const s = useStore();
  const { flyToCart } = useFlyToCart();

  const addToCartWithAnimation = useCallback(async (product, sourceElement) => {
    // CRITICAL: capture sourceRect BEFORE cart mutation (re-render may disconnect element)
    let sourceRect = null;
    if (sourceElement) {
      const r = sourceElement.getBoundingClientRect();
      if (isValidRect(r)) sourceRect = r;
    }

    const imageUrl = sourceElement?.currentSrc || sourceElement?.src || getProductMainImage(product) || '';

    // Cart mutation (synchronous)
    s.addToCart(product);

    // Fly with pre-captured rect
    flyToCart(imageUrl, product.name || '', sourceRect);
  }, [s, flyToCart]);

  return { addToCartWithAnimation };
}
