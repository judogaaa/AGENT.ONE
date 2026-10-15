// Fly-to-cart animation types
// No auth tokens, user IDs, or backend data stored here.

export const ANIMATION_DURATION = 620;
export const CART_BOUNCE_DURATION = 280;
export const MAX_VISIBLE_GHOSTS = 5;

/** @typedef {{ id: string, imageUrl: string, title: string, sourceRect: DOMRect, targetRect: DOMRect, startedAt: number }} FlyAnimation */

/** @typedef {{ flyToCart: (source: HTMLElement, imageUrl: string, title: string) => void, registerCartTarget: (el: HTMLElement | null) => void }} FlyToCartAPI */

import { createContext } from 'react';
export const FlyToCartContext = createContext(/** @type {FlyToCartAPI | null} */ (null));
