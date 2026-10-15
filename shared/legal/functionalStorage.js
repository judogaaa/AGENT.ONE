import { loadCookieConsent } from './cookieCategories.js'

export const FUNCTIONAL_STORAGE_KEYS = [
  'cart',
  'compare',
  'assistant_msgs',
  'assistant_lpi',
  'assistant_lri',
]

export function isFunctionalAllowed(categories) {
  const consent = categories || loadCookieConsent()
  return Boolean(consent?.categories?.functional)
}

export function loadFunctionalJSON(key, fallback, categories) {
  if (!isFunctionalAllowed(categories)) return fallback
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

export function saveFunctionalJSON(key, value, categories) {
  if (!isFunctionalAllowed(categories)) return false
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function clearFunctionalStorage() {
  for (const key of FUNCTIONAL_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}
