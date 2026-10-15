/** Shared cookie consent persistence for agent-one.ru and auth.agent-one.ru */

export const COOKIE_CONSENT_COOKIE_NAME = 'agentone_cookie_consent'
const CONSENT_MAX_AGE_SEC = 365 * 24 * 60 * 60

function cookieDomainAttr() {
  if (typeof window === 'undefined') return ''
  const host = window.location.hostname
  if (host === 'agent-one.ru' || host.endsWith('.agent-one.ru')) {
    return '; domain=.agent-one.ru'
  }
  return ''
}

function isSecureContext() {
  return typeof window !== 'undefined' && window.location.protocol === 'https:'
}

function readCookie(name) {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name, value, maxAgeSec) {
  if (typeof document === 'undefined') return
  let cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSec}; SameSite=Lax`
  cookie += cookieDomainAttr()
  if (isSecureContext()) cookie += '; Secure'
  document.cookie = cookie
}

export function readConsentPayloadRaw() {
  const fromCookie = readCookie(COOKIE_CONSENT_COOKIE_NAME)
  if (fromCookie) return fromCookie
  return null
}

export function persistConsentPayload(serialized) {
  writeCookie(COOKIE_CONSENT_COOKIE_NAME, serialized, CONSENT_MAX_AGE_SEC)
  try {
    localStorage.setItem('agentone_cookie_consent', serialized)
  } catch {
    /* ignore quota errors */
  }
}

export function clearConsentPayload() {
  if (typeof document !== 'undefined') {
    const expire = (domainAttr) => {
      const base = `${COOKIE_CONSENT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${domainAttr}`
      document.cookie = base
      if (isSecureContext()) document.cookie = `${base}; Secure`
    }
    // Clear host-only and shared domain variants (with and without Secure).
    expire('')
    expire('; domain=.agent-one.ru')
  }
  try {
    localStorage.removeItem('agentone_cookie_consent')
  } catch {
    /* ignore */
  }
}

export function parseConsentSerialized(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
