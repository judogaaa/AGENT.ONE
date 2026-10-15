import { useEffect, useRef } from 'react';
import { useFlyToCart } from './useFlyToCart';

export default function CartTarget({ children, className, style }) {
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  const { registerCartTarget } = useFlyToCart();

  useEffect(() => {
    registerCartTarget(ref.current);
    return () => registerCartTarget(null);
  }, [registerCartTarget]);

  return (
    <div ref={ref} className={className} style={style} data-cart-animation-target>
      {children}
    </div>
  );
}
