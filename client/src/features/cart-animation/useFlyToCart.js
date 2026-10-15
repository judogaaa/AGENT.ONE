import { useContext } from 'react';
import { FlyToCartContext } from './flyToCartTypes';

export function useFlyToCart() {
  const ctx = useContext(FlyToCartContext);
  if (!ctx) {
    // Graceful fallback — feature not wrapped
    return { flyToCart: () => {}, registerCartTarget: () => {}, registerBadge: () => {} };
  }
  return ctx;
}
