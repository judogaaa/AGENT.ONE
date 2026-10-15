import { useStore } from './useStore';

/**
 * useRequireAuth
 *
 * Returns a function that:
 * - runs the callback immediately if the user is authenticated;
 * - otherwise opens the auth modal and remembers the action so it can
 *   continue automatically after sign-in/sign-up.
 *
 * Usage:
 *   const requireAuth = useRequireAuth();
 *   <button onClick={() => requireAuth(() => s.addToCart(product))}>
 *     В корзину
 *   </button>
 */
export function useRequireAuth() {
  const s = useStore();

  return function requireAuth(run, opts = {}) {
    return s.requireAuth(run, opts);
  };
}
