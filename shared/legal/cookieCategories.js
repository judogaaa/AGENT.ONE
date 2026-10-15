import { COOKIE_CONSENT_VERSION } from './config.js'
import {
  COOKIE_CONSENT_COOKIE_NAME,
  clearConsentPayload,
  parseConsentSerialized,
  persistConsentPayload,
  readConsentPayloadRaw,
} from './cookieStorage.js'

export const COOKIE_CATEGORIES = {
  necessary: {
    id: 'necessary',
    title: 'Необходимые',
    required: true,
    description: 'Обеспечивают вход, безопасность сессии и базовую работу сайта. Отключить нельзя.',
  },
  functional: {
    id: 'functional',
    title: 'Функциональные',
    required: false,
    description: 'Сохраняют корзину, сравнение товаров и настройки интерфейса в браузере.',
  },
  analytics: {
    id: 'analytics',
    title: 'Аналитические',
    required: false,
    description: 'Помогают понимать использование сервиса. На текущей версии AGENT.ONE сторонняя аналитика не подключена.',
  },
  marketing: {
    id: 'marketing',
    title: 'Рекламные',
    required: false,
    description: 'Используются для персонализированной рекламы. На текущей версии AGENT.ONE не используются.',
  },
}

export const COOKIE_STORAGE_KEY = 'agentone_cookie_consent'

export function defaultCookieConsent() {
  return {
    version: COOKIE_CONSENT_VERSION,
    decidedAt: null,
    categories: {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    },
  }
}

function normalizeCategories(categories) {
  return {
    necessary: true,
    functional: Boolean(categories?.functional),
    analytics: false,
    marketing: false,
  }
}

function isSharedConsentDomain() {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname
  return host === 'agent-one.ru' || host.endsWith('.agent-one.ru')
}

function readStoredConsentRaw() {
  const fromCookie = readConsentPayloadRaw()
  if (fromCookie) return fromCookie
  // On production shared domains the cookie is the source of truth.
  // If it was cleared on another subdomain, drop stale localStorage.
  if (isSharedConsentDomain()) {
    try {
      localStorage.removeItem(COOKIE_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    return null
  }
  try {
    return localStorage.getItem(COOKIE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function loadCookieConsent() {
  const raw = readStoredConsentRaw()
  const parsed = parseConsentSerialized(raw)
  if (!parsed || parsed.version !== COOKIE_CONSENT_VERSION) return null
  if (!parsed.categories || typeof parsed.categories !== 'object') return null
  const normalized = {
    ...parsed,
    categories: normalizeCategories(parsed.categories),
  }
  if (raw) {
    persistConsentPayload(JSON.stringify(normalized))
  }
  return normalized
}

/** Clears shared consent and reopens the Accept/Reject banner. */
export function resetCookieConsentChoice() {
  clearConsentPayload()
  try {
    window.dispatchEvent(new CustomEvent('agentone:cookie-consent-changed', { detail: null }))
    window.dispatchEvent(new CustomEvent('agentone:cookie-settings'))
  } catch {
    /* ignore in non-browser env */
  }
}

export function saveCookieConsent(consent) {
  const payload = {
    ...consent,
    version: COOKIE_CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    categories: normalizeCategories(consent.categories),
  }
  persistConsentPayload(JSON.stringify(payload))
  try {
    window.dispatchEvent(new CustomEvent('agentone:cookie-consent-changed', { detail: payload }))
  } catch {
    /* ignore in non-browser env */
  }
  return payload
}

export function acceptAllCookies() {
  return saveCookieConsent({
    categories: { necessary: true, functional: true, analytics: false, marketing: false },
  })
}

export function acceptNecessaryOnly() {
  return saveCookieConsent({
    categories: { necessary: true, functional: false, analytics: false, marketing: false },
  })
}

export { COOKIE_CONSENT_COOKIE_NAME }
