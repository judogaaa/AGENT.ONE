import { useEffect, useState } from 'react'
import LegalDocumentView from '@legal/components/LegalDocumentView.jsx'
import LegalHub from '@legal/components/LegalHub.jsx'
import LegalFooter from '@legal/components/LegalFooter.jsx'
import CookieBanner from '@legal/components/CookieBanner.jsx'
import { AnalyticsGate } from '@legal/analyticsGate.js'
import { loadCookieConsent } from '@legal/cookieCategories.js'
import '@legal/legal.css'

const SLUGS = [
  'privacy',
  'personal-data-consent',
  'cookies',
  'terms',
  'offer',
  'marketplace-rules',
  'payment-delivery-returns',
  'requisites',
]

function LegalRoute({ slug }) {
  return (
    <LegalDocumentView
      slug={slug}
      backTo="/legal"
      backLabel="← Юридический центр"
      useRouterLink={false}
    />
  )
}

export default function LegalShell() {
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  const slug = path.replace(/^\/legal\/?/, '').replace(/\/$/, '')

  const [cookieCategories, setCookieCategories] = useState(
    () => loadCookieConsent()?.categories || { necessary: true }
  )

  useEffect(() => {
    document.documentElement.classList.add('legal-shell')
    return () => document.documentElement.classList.remove('legal-shell')
  }, [])

  const isHub = !slug || slug === 'index'
  const activeSlug = SLUGS.includes(slug) ? slug : null

  return (
    <>
      {isHub ? (
        <LegalHub backTo="/" backLabel="← На главную" useRouterLink={false} />
      ) : activeSlug ? (
        <LegalRoute slug={activeSlug} />
      ) : (
        <LegalHub backTo="/" backLabel="← На главную" useRouterLink={false} />
      )}
      <LegalFooter useRouterLink={false} />
      <CookieBanner onConsentChange={setCookieCategories} />
      <AnalyticsGate categories={cookieCategories} />
    </>
  )
}
