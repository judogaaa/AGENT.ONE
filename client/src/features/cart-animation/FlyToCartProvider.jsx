import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { FlyToCartContext, MAX_VISIBLE_GHOSTS } from './flyToCartTypes';
import { isValidRect } from './flyToCartGeometry';
import FlyToCartLayer from './FlyToCartLayer';

const REDUCED_MOTION = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let ghostIdCounter = 0;

export default function FlyToCartProvider({ children }) {
  const [ghosts, setGhosts] = useState(/** @type {FlyAnimation[]} */ ([]));
  const cartTargetRef = useRef(/** @type {HTMLElement | null} */ (null));
  const [cartTargetEl, setCartTargetEl] = useState(/** @type {HTMLElement | null} */ (null));
  const badgeRef = useRef(/** @type {HTMLElement | null} */ (null));
  const [badgeEl, setBadgeEl] = useState(/** @type {HTMLElement | null} */ (null));
  const reducedMotionRef = useRef(REDUCED_MOTION);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => { reducedMotionRef.current = e.matches; };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const removeGhost = useCallback((id) => {
    setGhosts(prev => prev.filter(g => g.id !== id));
  }, []);

  const registerCartTarget = useCallback((el) => {
    cartTargetRef.current = el;
    setCartTargetEl(el);
  }, []);

  const registerBadge = useCallback((el) => {
    badgeRef.current = el;
    setBadgeEl(el);
  }, []);

  // Accepts pre-captured sourceRect to avoid element disconnection after cart mutation
  const flyToCart = useCallback((imageUrl, title, sourceRect) => {
    if (!sourceRect || !isValidRect(sourceRect)) return;

    const targetEl = cartTargetRef.current;
    if (!targetEl) return;
    const targetRect = targetEl.getBoundingClientRect();
    if (!isValidRect(targetRect)) return;

    // Cart + badge bounce
    if (!reducedMotionRef.current) {
      const bounceTarget = targetEl; // use local
      const bb = badgeRef.current;
      bounceTarget?.animate?.([
        { transform: 'scale(1)' }, { transform: 'scale(1.16)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }
      ], { duration: 280, easing: 'cubic-bezier(0.34, 1.25, 0.64, 1)' });
      bb?.animate?.([
        { transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(1)' }
      ], { duration: 260, easing: 'ease-out' });
    }

    // Reduced motion — skip flight
    if (reducedMotionRef.current) return;

    const id = `ghost-${Date.now()}-${++ghostIdCounter}`;
    setGhosts(prev => {
      const next = [...prev, { id, imageUrl, title: title || '', sourceRect, targetRect, startedAt: Date.now() }];
      if (next.length > MAX_VISIBLE_GHOSTS) next.shift();
      return next;
    });
  }, []);

  const value = useMemo(() => ({ flyToCart, registerCartTarget, registerBadge }), [flyToCart, registerCartTarget, registerBadge]);

  return (
    <FlyToCartContext.Provider value={value}>
      {children}
      <FlyToCartLayer ghosts={ghosts} onComplete={removeGhost} />
    </FlyToCartContext.Provider>
  );
}
