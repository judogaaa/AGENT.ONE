const AUTH_ORIGIN = import.meta.env.VITE_AUTH_ORIGIN || 'http://localhost:5180'

export function getAuthOrigin() {
  const origin = AUTH_ORIGIN
  if (!origin || typeof origin !== 'string') return 'http://localhost:5180'
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'http://localhost:5180'
    return origin.replace(/\/+$/, '')
  } catch {
    return 'http://localhost:5180'
  }
}

export function getCurrentRelativePath() {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname + window.location.search + window.location.hash
}

export function validateReturnTo(returnTo) {
  if (!returnTo || typeof returnTo !== 'string') return '/'
  const trimmed = returnTo.trim()
  if (!trimmed.startsWith('/')) return '/'
  if (trimmed.startsWith('//')) return '/'
  if (/[\\\x00-\x1f\x7f]/.test(trimmed)) return '/'
  try {
    const url = new URL(trimmed, 'http://dummy')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/'
    if (url.hostname !== 'dummy') return '/'
  } catch {
    return '/'
  }
  return trimmed
}

export function buildAuthUrl(authPath, returnTo) {
  const origin = getAuthOrigin()
  const safeReturn = validateReturnTo(returnTo || getCurrentRelativePath())
  return origin + authPath + '?return_to=' + encodeURIComponent(safeReturn)
}

export function buildLoginUrl(returnTo) {
  return buildAuthUrl('/login', returnTo)
}

export function buildRegisterUrl(returnTo) {
  return buildAuthUrl('/register', returnTo)
}
