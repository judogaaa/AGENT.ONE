// Pure geometry calculations — no DOM manipulation, no side effects.

/**
 * Get the center point of a DOMRect.
 * @param {DOMRect} rect
 * @returns {{ x: number, y: number }}
 */
export function getRectCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Calculate an upward-arc midpoint between two points.
 * The arc rises above the straight line proportionally to distance.
 * @param {{ x: number, y: number }} from
 * @param {{ x: number, y: number }} to
 * @returns {{ x: number, y: number }}
 */
export function getArcMidpoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const arcHeight = Math.min(Math.max(distance * 0.18, 70), 180);
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - arcHeight,
  };
}

/**
 * Clamp a value between min and max.
 * @param {number} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Check if a rect has valid dimensions.
 * @param {DOMRect} rect
 * @returns {boolean}
 */
export function isValidRect(rect) {
  return rect.width > 0 && rect.height > 0;
}

/**
 * Check if element is connected to the DOM.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
export function isElementConnected(el) {
  return el && el.isConnected;
}
