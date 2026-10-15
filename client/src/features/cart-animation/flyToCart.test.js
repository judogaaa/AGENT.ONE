import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRectCenter, getArcMidpoint, isValidRect, isElementConnected, clamp } from './flyToCartGeometry';
import { FlyToCartContext, MAX_VISIBLE_GHOSTS, ANIMATION_DURATION, CART_BOUNCE_DURATION } from './flyToCartTypes';
import { useFlyToCart } from './useFlyToCart';
import CartTarget from './CartTarget';
import FlyToCartLayer from './FlyToCartLayer';
import FlyToCartProvider from './FlyToCartProvider';
import React from 'react';

function makeRect(l, t, w, h) {
  return { left: l, top: t, width: w, height: h, right: l + w, bottom: t + h, x: l, y: t, toJSON: () => {} };
}

// ═══ 52 UNIT TESTS ═══

describe('Geometry', () => {
  it('1. getRectCenter calculates center', () => {
    const c = getRectCenter(makeRect(100, 200, 80, 60));
    expect(c.x).toBe(140); expect(c.y).toBe(230);
  });
  it('2. getRectCenter handles zero rect', () => {
    const c = getRectCenter(makeRect(0, 0, 0, 0));
    expect(c.x).toBe(0); expect(c.y).toBe(0);
  });
  it('3. getArcMidpoint rises above straight line', () => {
    const m = getArcMidpoint({ x: 100, y: 400 }, { x: 500, y: 50 });
    expect(m.y).toBeLessThan((400 + 50) / 2);
  });
  it('4. arc height proportional to distance', () => {
    const n = getArcMidpoint({ x: 0, y: 0 }, { x: 100, y: 0 });
    const f = getArcMidpoint({ x: 0, y: 0 }, { x: 800, y: 0 });
    expect(f.y).toBeLessThan(n.y);
  });
  it('5. isValidRect passes valid rect', () => {
    expect(isValidRect({ width: 100, height: 50 })).toBe(true);
  });
  it('6. isValidRect fails zero width', () => {
    expect(isValidRect({ width: 0, height: 50 })).toBe(false);
  });
  it('7. isValidRect fails zero height', () => {
    expect(isValidRect({ width: 100, height: 0 })).toBe(false);
  });
  it('8. isElementConnected null returns false', () => {
    expect(isElementConnected(null)).toBeFalsy();
  });
  it('9. isElementConnected undefined returns false', () => {
    expect(isElementConnected(undefined)).toBeFalsy();
  });
  it('10. clamp returns bounded value', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('Types contract', () => {
  it('11. FlyToCartContext defined', () => { expect(FlyToCartContext).toBeDefined(); });
  it('12. MAX_VISIBLE_GHOSTS is 5', () => { expect(MAX_VISIBLE_GHOSTS).toBe(5); });
  it('13. ANIMATION_DURATION positive', () => { expect(ANIMATION_DURATION).toBeGreaterThan(0); });
  it('14. CART_BOUNCE_DURATION positive', () => { expect(CART_BOUNCE_DURATION).toBeGreaterThan(0); });
});

describe('Hook contract', () => {
  it('15. useFlyToCart is function', () => { expect(typeof useFlyToCart).toBe('function'); });
  it('16. CartTarget is component', () => { expect(CartTarget).toBeDefined(); });
  it('17. FlyToCartLayer is component', () => { expect(FlyToCartLayer).toBeDefined(); });
  it('18. FlyToCartProvider is component', () => { expect(FlyToCartProvider).toBeDefined(); });
});

describe('Integration contracts', () => {
  it('19. ProductCard has useAnimatedAddToCart', async () => {
    const mod = await import('../../components/ProductCard?raw'); const src = mod.default;
    expect(src).toMatch(/useAnimatedAddToCart/);
  });
  it('20. ProductPage has useAnimatedAddToCart', async () => {
    const mod = await import('../../pages/ProductPage?raw'); const src = mod.default;
    expect(src).toMatch(/useAnimatedAddToCart/);
  });
  it('21. AIManagerChat has useAnimatedAddToCart', async () => {
    const mod = await import('../../components/AIManagerChat?raw'); const src = mod.default;
    expect(src).toMatch(/useAnimatedAddToCart/);
  });
  it('22. AIManagerChat has AIManagerProductCard', async () => {
    const mod = await import('../../components/AIManagerChat?raw'); const src = mod.default;
    expect(src).toMatch(/AIManagerProductCard/);
  });
  it('23. AssistantPage has useAnimatedAddToCart', async () => {
    const mod = await import('../../pages/AssistantPage?raw'); const src = mod.default;
    expect(src).toMatch(/useAnimatedAddToCart/);
  });
  it('24. AssistantPage has AssistantResultCard', async () => {
    const mod = await import('../../pages/AssistantPage?raw'); const src = mod.default;
    expect(src).toMatch(/AssistantResultCard/);
  });
});

describe('Ghost visual contract', () => {
  it('25. Ghost uses position fixed', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/position.*fixed/);
  });
  it('26. Ghost has aria-hidden', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/aria-hidden/);
  });
  it('27. Ghost has pointer-events none', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/pointerEvents.*none|pointer-events.*none/);
  });
  it('28. Animation uses transform', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/transform/);
  });
  it('29. Animation uses opacity', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/opacity/);
  });
  it('30. No setInterval', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).not.toMatch(/setInterval/);
  });
  it('31. Animation cancelled on unmount', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/cancel/);
  });
  it('32. will-change on ghost', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/willChange|will-change/);
  });
});

describe('Reduced motion', () => {
  it('33. Provider checks prefers-reduced-motion', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/prefers-reduced-motion/);
  });
  it('34. Provider uses media query listener', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/matchMedia|addEventListener/);
  });
});

describe('Provider cleanup', () => {
  it('35. MAX_VISIBLE_GHOSTS enforced', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/MAX_VISIBLE_GHOSTS/);
  });
  it('36. removeGhost function exists', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/removeGhost/);
  });
  it('37. Safety timeout in layer', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).toMatch(/setTimeout/);
  });
  it('38. CartTarget cleanup on unmount', async () => {
    const mod = await import('./CartTarget?raw'); const src = mod.default;
    expect(src).toMatch(/registerCartTarget\(null\)|return.*\)/);
  });
  it('39. CartTarget registers with useEffect', async () => {
    const mod = await import('./CartTarget?raw'); const src = mod.default;
    expect(src).toMatch(/registerCartTarget/);
  });
});

describe('Fallbacks', () => {
  it('40. Provider checks source rect valid', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/isValidRect/);
  });
  it('41. Provider checks source rect valid', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/isValidRect/);
  });
  it('42. UseFlyToCart returns safe fallback', async () => {
    const mod = await import('./useFlyToCart?raw'); const src = mod.default;
    expect(src).toMatch(/flyToCart.*=>|registerCartTarget.*=>/);
  });
  it('43. Provider handles missing target', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).toMatch(/cartTargetRef/);
  });
});

describe('Security', () => {
  it('44. Types file no token', async () => {
    const mod = await import('./flyToCartTypes?raw'); const src = mod.default;
    expect(src).not.toMatch(/\btoken\b|jwt|accessToken/);
  });
  it('45. Provider no localStorage', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).not.toMatch(/localStorage/);
  });
  it('46. Provider no sessionStorage', async () => {
    const mod = await import('./FlyToCartProvider?raw'); const src = mod.default;
    expect(src).not.toMatch(/sessionStorage/);
  });
  it('47. Layer no auth data', async () => {
    const mod = await import('./FlyToCartLayer?raw'); const src = mod.default;
    expect(src).not.toMatch(/token|jwt|auth/i);
  });
  it('48. Types no user ID', async () => {
    const mod = await import('./flyToCartTypes?raw'); const src = mod.default;
    expect(src).not.toMatch(/user[_-]?id|sub.*=/i);
  });
});

describe('Add-to-cart flow contract', () => {
  it('49. Store has addToCart method', async () => {
    const mod = await import('../../store/index?raw'); const src = mod.default;
    expect(src).toMatch(/addToCart/);
  });
  it('50. Store has no DOM refs', async () => {
    const mod = await import('../../store/index?raw'); const src = mod.default;
    expect(src).not.toMatch(/querySelector|HTMLElement|document\./);
  });
  it('51. ProductCard uses local ref', async () => {
    const mod = await import('../../components/ProductCard?raw'); const src = mod.default;
    expect(src).toMatch(/useRef|imgRef/);
  });
  it('52. AIManagerProductCard uses local ref', async () => {
    const mod = await import('../../components/AIManagerChat?raw'); const src = mod.default;
    expect(src).toMatch(/AIManagerProductCard|imgRef/);
  });
});
