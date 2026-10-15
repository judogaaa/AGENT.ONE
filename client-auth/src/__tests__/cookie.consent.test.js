import { describe, it, expect, beforeEach } from 'vitest'
import {
  acceptAllCookies,
  acceptNecessaryOnly,
  loadCookieConsent,
  saveCookieConsent,
  resetCookieConsentChoice,
  COOKIE_STORAGE_KEY,
} from '@legal/cookieCategories.js'
import { loadAnalyticsIfAllowed, resetAnalyticsForTests } from '@legal/analyticsGate.js'
import {
  isFunctionalAllowed,
  loadFunctionalJSON,
  saveFunctionalJSON,
  clearFunctionalStorage,
} from '@legal/functionalStorage.js'
import { hasCurrentPersonalDataConsent, hasCurrentTermsConsent } from '@legal/userConsent.js'
import { LEGAL_DOCUMENT_VERSION } from '@legal/config.js'
import { persistConsentPayload } from '@legal/cookieStorage.js'

describe('cookie consent unit tests', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'agentone_cookie_consent=; path=/; max-age=0'
    resetAnalyticsForTests()
  })

  it('necessary only excludes analytics scripts', () => {
    const consent = acceptNecessaryOnly()
    expect(consent.categories.analytics).toBe(false)
    expect(consent.categories.marketing).toBe(false)
    expect(loadAnalyticsIfAllowed(consent.categories)).toBe(false)
  })

  it('accept all enables functional cookies but keeps analytics disabled', () => {
    const consent = acceptAllCookies()
    expect(consent.categories.functional).toBe(true)
    expect(consent.categories.analytics).toBe(false)
    expect(consent.categories.marketing).toBe(false)
    expect(loadAnalyticsIfAllowed(consent.categories)).toBe(false)
  })

  it('stores consent version and date in localStorage and cookie', () => {
    const saved = saveCookieConsent({ categories: { necessary: true, functional: false, analytics: false, marketing: false } })
    expect(saved.version).toBeTruthy()
    expect(saved.decidedAt).toBeTruthy()
    expect(localStorage.getItem(COOKIE_STORAGE_KEY)).toContain(saved.version)
    expect(document.cookie).toContain('agentone_cookie_consent=')
    expect(loadCookieConsent()?.categories.functional).toBe(false)
  })

  it('reloads shared consent from cookie payload', () => {
    const payload = JSON.stringify({
      version: '2026-08-03-cookie-v1',
      decidedAt: new Date().toISOString(),
      categories: { necessary: true, functional: true, analytics: true, marketing: true },
    })
    persistConsentPayload(payload)
    localStorage.clear()
    const loaded = loadCookieConsent()
    expect(loaded?.categories.functional).toBe(true)
    expect(loaded?.categories.analytics).toBe(false)
  })

  it('reset clears storage and leaves only necessary after reject', () => {
    acceptAllCookies()
    expect(loadCookieConsent()?.categories.functional).toBe(true)
    resetCookieConsentChoice()
    expect(localStorage.getItem(COOKIE_STORAGE_KEY)).toBeNull()
    expect(loadCookieConsent()).toBeNull()
    const rejected = acceptNecessaryOnly()
    expect(rejected.categories.necessary).toBe(true)
    expect(rejected.categories.functional).toBe(false)
  })

  it('clearConsentPayload removes Secure shared cookie name from document', async () => {
    const { clearConsentPayload } = await import('@legal/cookieStorage.js')
    acceptAllCookies()
    expect(document.cookie).toContain('agentone_cookie_consent=')
    clearConsentPayload()
    expect(localStorage.getItem(COOKIE_STORAGE_KEY)).toBeNull()
  })
})

describe('functional storage gating', () => {
  beforeEach(() => {
    localStorage.clear()
    document.cookie = 'agentone_cookie_consent=; path=/; max-age=0'
  })

  it('blocks functional persistence without consent', () => {
    acceptNecessaryOnly()
    expect(isFunctionalAllowed()).toBe(false)
    expect(saveFunctionalJSON('cart', [{ id: 1 }])).toBe(false)
    expect(loadFunctionalJSON('cart', [])).toEqual([])
  })

  it('persists functional data when functional cookies accepted', () => {
    acceptAllCookies()
    expect(isFunctionalAllowed()).toBe(true)
    saveFunctionalJSON('cart', [{ productId: 'p1' }])
    expect(loadFunctionalJSON('cart', [])).toEqual([{ productId: 'p1' }])
    clearFunctionalStorage()
    expect(loadFunctionalJSON('cart', [])).toEqual([])
  })
})

describe('legal consent version helpers', () => {
  it('detects current personal data and terms consent from profile', () => {
    const profile = { privacyVersion: LEGAL_DOCUMENT_VERSION, termsVersion: LEGAL_DOCUMENT_VERSION }
    expect(hasCurrentPersonalDataConsent(profile)).toBe(true)
    expect(hasCurrentTermsConsent(profile)).toBe(true)
  })

  it('requires re-consent when document version changes', () => {
    const profile = { privacyVersion: 'old-version', termsVersion: 'old-version' }
    expect(hasCurrentPersonalDataConsent(profile)).toBe(false)
    expect(hasCurrentTermsConsent(profile)).toBe(false)
  })
})
