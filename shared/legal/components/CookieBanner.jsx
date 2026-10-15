import { useCallback, useEffect, useRef, useState } from 'react'
import {
  acceptAllCookies,
  acceptNecessaryOnly,
  loadCookieConsent,
} from '../cookieCategories.js'
import { clearFunctionalStorage } from '../functionalStorage.js'
import { recordConsent } from '../consentApi.js'
import { cookieConsentVer } from '../cookieVersion.js'

function CookieIcon() {
  return (
    <svg className="cookie-banner-icon" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="cookie-fill" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#E8C07A" />
          <stop offset="55%" stopColor="#C9954A" />
          <stop offset="100%" stopColor="#A87335" />
        </radialGradient>
        <linearGradient id="cookie-sheen" x1="10" y1="6" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF6E4" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#FFF6E4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="18" fill="url(#cookie-fill)" />
      <circle cx="22" cy="22" r="18" fill="url(#cookie-sheen)" />
      <circle cx="22" cy="22" r="17.25" stroke="#8F5E28" strokeOpacity="0.28" strokeWidth="1.5" />
      <circle cx="14.5" cy="16" r="2.1" fill="#6B4423" fillOpacity="0.88" />
      <circle cx="23.5" cy="13.5" r="1.55" fill="#6B4423" fillOpacity="0.82" />
      <circle cx="29.5" cy="19" r="1.9" fill="#6B4423" fillOpacity="0.86" />
      <circle cx="17" cy="24.5" r="1.7" fill="#6B4423" fillOpacity="0.84" />
      <circle cx="25.5" cy="27.5" r="2.15" fill="#6B4423" fillOpacity="0.88" />
      <circle cx="13.5" cy="29.5" r="1.35" fill="#6B4423" fillOpacity="0.78" />
      <circle cx="30.5" cy="28.5" r="1.2" fill="#6B4423" fillOpacity="0.75" />
    </svg>
  )
}

function CookiePolicyLink({ useRouterLink, LinkComponent }) {
  const href = '/legal/cookies'
  if (useRouterLink && LinkComponent) {
    return (
      <LinkComponent to={href} target="_blank" rel="noopener noreferrer">
        Политике cookie
      </LinkComponent>
    )
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      Политике cookie
    </a>
  )
}

export function CookieBanner({ onConsentChange, useRouterLink = false, LinkComponent }) {
  const [visible, setVisible] = useState(() => !loadCookieConsent())
  const dialogRef = useRef(null)

  useEffect(() => {
    const existing = loadCookieConsent()
    if (existing) {
      onConsentChange?.(existing.categories)
    }
  }, [onConsentChange])

  useEffect(() => {
    const syncFromStorage = () => {
      const existing = loadCookieConsent()
      if (existing) {
        onConsentChange?.(existing.categories)
        setVisible(false)
        return
      }
      onConsentChange?.({ necessary: true, functional: false, analytics: false, marketing: false })
      setVisible(true)
    }
    syncFromStorage()
    window.addEventListener('agentone:cookie-consent-changed', syncFromStorage)
    window.addEventListener('focus', syncFromStorage)
    window.addEventListener('storage', syncFromStorage)
    return () => {
      window.removeEventListener('agentone:cookie-consent-changed', syncFromStorage)
      window.removeEventListener('focus', syncFromStorage)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [onConsentChange])

  // Internal: reopen simple accept/reject banner (no category UI for users).
  useEffect(() => {
    const handler = () => setVisible(true)
    window.addEventListener('agentone:cookie-settings', handler)
    return () => window.removeEventListener('agentone:cookie-settings', handler)
  }, [])

  const applyConsent = useCallback(async (consent) => {
    if (!consent.categories.functional) {
      clearFunctionalStorage()
    }
    onConsentChange?.(consent.categories)
    setVisible(false)
    try {
      await recordConsent({
        consentType: 'cookies',
        documentVersion: cookieConsentVer,
        source: 'cookie_banner',
        granted: true,
      })
    } catch {
      /* best-effort server record */
    }
  }, [onConsentChange])

  const handleAccept = () => {
    applyConsent(acceptAllCookies())
  }

  const handleReject = () => {
    applyConsent(acceptNecessaryOnly())
  }

  useEffect(() => {
    const cls = 'cookie-banner-visible'
    if (visible) document.documentElement.classList.add(cls)
    else document.documentElement.classList.remove(cls)
    return () => document.documentElement.classList.remove(cls)
  }, [visible])

  if (!visible) return null

  return (
    <div className="cookie-banner-overlay" role="presentation">
      <div
        className="cookie-banner cookie-banner--compact"
        role="dialog"
        aria-labelledby="cookie-banner-title"
        aria-describedby="cookie-banner-desc"
        ref={dialogRef}
      >
        <div className="cookie-banner-head">
          <CookieIcon />
          <h2 id="cookie-banner-title">Файлы cookie AGENT.ONE</h2>
        </div>
        <p id="cookie-banner-desc" className="cookie-banner-desc">
          AGENT.ONE использует файлы cookie для авторизации, сохранения настроек и корректной работы сервиса.
          Подробнее — в{' '}
          <CookiePolicyLink useRouterLink={useRouterLink} LinkComponent={LinkComponent} />.
        </p>
        <div className="cookie-banner-actions cookie-banner-actions--compact">
          <button type="button" className="cookie-btn cookie-btn-primary" onClick={handleAccept}>
            Принять
          </button>
          <button type="button" className="cookie-btn cookie-btn-secondary" onClick={handleReject}>
            Отклонить
          </button>
        </div>
      </div>
    </div>
  )
}

export function openCookieSettings() {
  window.dispatchEvent(new CustomEvent('agentone:cookie-settings'))
}

export default CookieBanner
